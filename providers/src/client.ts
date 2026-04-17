import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIMessage,
  OpenAIStreamChunk,
  OpenAITool,
} from "./types.ts";
import {
  type ContentBlock,
  COPILOT_API_VERSION,
  COPILOT_PLUGIN_VERSION,
  DEFAULT_STREAMING_CONFIG,
  finishReasonToStopReason,
  generateMessageId,
  type ProxyRequest,
  type ProxyResponse,
  type StreamEvent,
  type StreamingConfig,
  type TextContentBlock,
  type Tool,
  type ToolChoice,
  VSCODE_VERSION,
} from "./types.ts";
import { resolveModelCandidates } from "./models.ts";
import { getToken } from "./token.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COPILOT_CHAT_URL = "https://api.githubcopilot.com/chat/completions";
const COPILOT_RESPONSES_URL = "https://api.githubcopilot.com/v1/responses";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateInputTokens(req: ProxyRequest): number {
  const parts: string[] = [];
  if (req.system) parts.push(req.system);
  for (const msg of req.messages) {
    if (typeof msg.content === "string") {
      parts.push(msg.content);
    } else {
      for (const block of msg.content) {
        if (block.type === "text") parts.push(block.text);
      }
    }
  }
  return Math.ceil(parts.join("\n\n").length / 4);
}

function buildHeaders(
  copilotToken: string,
  isAgentCall: boolean,
): Record<string, string> {
  return {
    "Authorization": `Bearer ${copilotToken}`,
    "Content-Type": "application/json",
    "editor-version": `vscode/${VSCODE_VERSION}`,
    "editor-plugin-version": `copilot-chat/${COPILOT_PLUGIN_VERSION}`,
    "user-agent": `GitHubCopilotChat/${COPILOT_PLUGIN_VERSION}`,
    "copilot-integration-id": "vscode-chat",
    "openai-intent": "conversation-panel",
    "x-github-api-version": COPILOT_API_VERSION,
    "x-request-id": crypto.randomUUID(),
    "x-vscode-user-agent-library-version": "electron-fetch",
    "X-Initiator": isAgentCall ? "agent" : "user",
  };
}

function toOpenAIMessages(req: ProxyRequest): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  if (req.system) {
    messages.push({ role: "system", content: req.system });
  }
  for (const msg of req.messages) {
    if (typeof msg.content === "string") {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }

    const blocks = msg.content;

    if (msg.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: NonNullable<OpenAIMessage["tool_calls"]> = [];

      for (const block of blocks) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      const message: OpenAIMessage = {
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("\n") : null,
      };
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
      messages.push(message);
    } else {
      // user role: separate text blocks from tool_result blocks
      const textParts: string[] = [];

      for (const block of blocks) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_result") {
          // tool_result becomes a role:"tool" message
          let resultContent: string;
          if (typeof block.content === "string") {
            resultContent = block.content;
          } else {
            resultContent = block.content
              .filter((b): b is TextContentBlock => b.type === "text")
              .map((b) => b.text)
              .join("\n");
          }
          messages.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: resultContent,
          });
        }
      }

      if (textParts.length > 0) {
        messages.push({ role: "user", content: textParts.join("\n") });
      }
    }
  }
  return messages;
}

function toOpenAITools(tools: Tool[]): OpenAITool[] {
  return tools
    .filter((tool) => typeof tool.name === "string" && tool.name.length > 0)
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        ...(tool.description && { description: tool.description }),
        parameters: tool.input_schema,
      },
    }));
}

function toOpenAIToolChoice(
  choice: ToolChoice,
): OpenAIChatRequest["tool_choice"] {
  if (choice.type === "auto") return "auto";
  if (choice.type === "any") return "required";
  return { type: "function", function: { name: choice.name } };
}

function isAgentCall(req: ProxyRequest): boolean {
  return req.messages.some((m) => m.role === "assistant");
}

/** Maps an HTTP error status from the Copilot chat API to an Anthropic error type string. */
function statusToAnthropicError(status: number): string {
  if (status === 400) return "invalid_request_error";
  if (status === 401) return "authentication_error";
  if (status === 403) return "permission_error";
  if (status === 429) return "rate_limit_error";
  if (status === 503) return "overloaded_error";
  return "api_error";
}

// ---------------------------------------------------------------------------
// 429 Retry with exponential backoff
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [100, 200, 400];

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429) return response;
    // Consume body before retry to avoid leak
    await response.body?.cancel();
    lastResponse = response;
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  // All retries exhausted — return last 429
  return lastResponse!;
}

function isModelAccessDenied(status: number, errorBody: string): boolean {
  if (status !== 400 && status !== 403) return false;

  const normalized = errorBody.toLowerCase();
  return [
    "may not have access",
    "do not have access",
    "does not have access",
    "not allowed to use this model",
    "model is not available to you",
    "no access to model",
  ].some((needle) => normalized.includes(needle));
}

interface ModelAttemptResult {
  ok: boolean;
  response?: Response;
  status: number;
  errorBody: string;
}

function shouldRetryCandidate(status: number, errorBody: string): boolean {
  return isModelAccessDenied(status, errorBody) || status === 503;
}

async function postWithModelFallback(
  request: ProxyRequest,
  body: OpenAIChatRequest,
  copilotToken: string,
  opts?: ChatOptions,
): Promise<ModelAttemptResult> {
  const candidates = await resolveModelCandidates(request.model, {
    token: opts?.token,
  });

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const response = await fetchWithRetry(COPILOT_CHAT_URL, {
      method: "POST",
      headers: buildHeaders(copilotToken, isAgentCall(request)),
      body: JSON.stringify({
        ...body,
        model: candidate,
      }),
    });

    if (response.ok) {
      return {
        ok: true,
        response,
        status: response.status,
        errorBody: "",
      };
    }

    const errorBody = await response.text().catch(() => "");
    const canRetry = index < candidates.length - 1 &&
      shouldRetryCandidate(response.status, errorBody);
    if (canRetry) {
      continue;
    }

    return {
      ok: false,
      status: response.status,
      errorBody,
    };
  }

  return {
    ok: false,
    status: 503,
    errorBody: "No compatible Copilot model available",
  };
}

// ---------------------------------------------------------------------------
// Token counting (for /v1/messages/count_tokens endpoint)
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function messagesToText(
  request: { system?: string; messages: { role: string; content: unknown }[] },
): string {
  const parts: string[] = [];
  if (request.system) {
    parts.push(`System: ${request.system}`);
  }
  for (const msg of request.messages) {
    const label = msg.role === "user" ? "User" : "Assistant";
    if (typeof msg.content === "string") {
      parts.push(`${label}: ${msg.content}`);
    } else if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b): b is { type: "text"; text: string } =>
          typeof b === "object" && b !== null && "type" in b &&
          b.type === "text"
        )
        .map((b) => b.text)
        .join(" ");
      if (text) parts.push(`${label}: ${text}`);
    }
  }
  return parts.join("\n\n");
}

export function countTokens(
  request: {
    model: string;
    messages: { role: string; content: unknown }[];
    system?: string;
  },
): {
  id: string;
  type: string;
  role: string;
  content: never[];
  model: string;
  stop_reason: null;
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
} {
  const tokens = estimateTokens(messagesToText(request));

  return {
    id: generateMessageId(),
    type: "message",
    role: "assistant",
    content: [],
    model: request.model,
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: tokens,
      output_tokens: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Non-streaming chat
// ---------------------------------------------------------------------------

export interface ChatOptions {
  getGitHubToken?: () => Promise<string>;
  token?: string;
}

export async function chat(
  request: ProxyRequest,
  opts?: ChatOptions,
): Promise<ProxyResponse> {
  const copilotToken = await getToken({ getGitHubToken: opts?.getGitHubToken });

  const body: OpenAIChatRequest = {
    model: request.model,
    messages: toOpenAIMessages(request),
    max_tokens: request.max_tokens ?? 4096,
    stream: false,
    ...(request.temperature !== undefined &&
      { temperature: request.temperature }),
    ...(request.top_p !== undefined && { top_p: request.top_p }),
    ...(request.tools && request.tools.length > 0 &&
      { tools: toOpenAITools(request.tools) }),
    ...(request.tool_choice &&
      { tool_choice: toOpenAIToolChoice(request.tool_choice) }),
  };

  const result = await postWithModelFallback(
    request,
    body,
    copilotToken.token,
    opts,
  );

  if (!result.ok) {
    const errorType = statusToAnthropicError(result.status);
    return {
      id: generateMessageId(),
      type: "message",
      role: "assistant",
      content: [{
        type: "text",
        text: `Error: ${errorType} (HTTP ${result.status})${
          result.errorBody ? ` — ${result.errorBody}` : ""
        }`,
      }],
      model: request.model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  }

  const data = await result.response!.json() as OpenAIChatResponse;
  const choice = data.choices[0];

  const contentBlocks: ContentBlock[] = [];

  if (choice.message.content) {
    contentBlocks.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(toolCall.function.arguments) as Record<
          string,
          unknown
        >;
      } catch {
        input = { _raw: toolCall.function.arguments };
      }
      contentBlocks.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input,
      });
    }
  }

  return {
    id: generateMessageId(),
    type: "message",
    role: "assistant",
    content: contentBlocks,
    model: request.model,
    stop_reason: finishReasonToStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Enhanced Streaming Processor with Aggressive Flushing
// ---------------------------------------------------------------------------

/**
 * Enhanced streaming processor that fixes line-based buffering issues.
 * Implements timeout-based and size-based flushing for better streaming experience.
 */
class StreamingProcessor {
  private buffer = "";
  private lastFlushTime = Date.now();
  private flushTimer?: number;
  private decoder = new TextDecoder();

  constructor(
    private config: {
      flushTimeoutMs: number;
      maxBufferBytes: number;
      enableAggressiveFlushing: boolean;
      enableDiagnostics: boolean;
    },
    private onProcessedLine: (line: string) => void,
    private diagnostics: {
      recordChunk?: (size: number) => void;
      recordFlush?: (size: number, forced: boolean) => void;
    } = {},
  ) {}

  /**
   * Process a chunk of data and emit processed lines
   */
  processChunk(value: Uint8Array): void {
    const chunk = this.decoder.decode(value, { stream: true });

    if (this.config.enableDiagnostics) {
      this.diagnostics.recordChunk?.(chunk.length);
    }

    this.buffer += chunk;

    // Process complete lines immediately
    const lines = this.buffer.split("\n");
    const incompleteLine = lines.pop() ?? "";

    // Emit all complete lines
    for (const line of lines) {
      this.emitLine(line, false);
    }

    // Handle incomplete line
    this.buffer = incompleteLine;

    if (this.config.enableAggressiveFlushing && incompleteLine) {
      this.scheduleFlush();
    }
  }

  /**
   * Process any remaining buffer content on stream end
   */
  finish(): void {
    this.clearTimer();

    if (this.buffer.trim()) {
      this.emitLine(this.buffer, true);
      this.buffer = "";
    }
  }

  /**
   * Clear any pending timer
   */
  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Schedule a flush for incomplete lines
   */
  private scheduleFlush(): void {
    this.clearTimer();

    this.flushTimer = setTimeout(() => {
      this.forceFlush();
    }, this.config.flushTimeoutMs);
  }

  /**
   * Force flush incomplete line based on timeout or buffer size
   */
  private forceFlush(): void {
    if (!this.buffer.trim()) return;

    const bufferSize = new TextEncoder().encode(this.buffer).length;
    const timeSinceFlush = Date.now() - this.lastFlushTime;

    // Force flush if buffer is too large or too much time has passed
    if (
      bufferSize >= this.config.maxBufferBytes ||
      timeSinceFlush >= this.config.flushTimeoutMs
    ) {
      // Try to find a natural break point in the incomplete line
      const processedLine = this.findNaturalBreakPoint(this.buffer);
      if (processedLine) {
        this.emitLine(processedLine, true);
        this.buffer = this.buffer.slice(processedLine.length);
      }
    }
  }

  /**
   * Find a natural break point in an incomplete line (e.g., after punctuation)
   */
  private findNaturalBreakPoint(line: string): string | null {
    if (!line.trim()) return null;

    // Look for natural break points
    const breakPoints = [
      /^(.*[.!?]\s+)/, // After sentence endings
      /^(.*[,;:]\s+)/, // After clause separators
      /^(.*\s+)/, // After any whitespace
    ];

    for (const pattern of breakPoints) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // If no natural break point, split at a reasonable position
    if (line.length > 50) {
      return line.slice(0, Math.floor(line.length / 2));
    }

    return null;
  }

  /**
   * Emit a processed line
   */
  private emitLine(line: string, forced: boolean): void {
    if (this.config.enableDiagnostics) {
      const bufferSize = new TextEncoder().encode(this.buffer).length;
      this.diagnostics.recordFlush?.(bufferSize, forced);
    }

    this.lastFlushTime = Date.now();
    this.onProcessedLine(line);
    this.clearTimer();
  }
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

export async function chatStream(
  request: ProxyRequest,
  onChunk: (event: StreamEvent) => void,
  streamingConfig?: Partial<StreamingConfig>,
  opts?: ChatOptions,
): Promise<void> {
  const copilotToken = await getToken({ getGitHubToken: opts?.getGitHubToken });
  const config = { ...DEFAULT_STREAMING_CONFIG, ...streamingConfig };

  const body: OpenAIChatRequest = {
    model: request.model,
    messages: toOpenAIMessages(request),
    max_tokens: request.max_tokens ?? 4096,
    stream: true,
    stream_options: { include_usage: true },
    ...(request.temperature !== undefined &&
      { temperature: request.temperature }),
    ...(request.top_p !== undefined && { top_p: request.top_p }),
    ...(request.tools && request.tools.length > 0 &&
      { tools: toOpenAITools(request.tools) }),
    ...(request.tool_choice &&
      { tool_choice: toOpenAIToolChoice(request.tool_choice) }),
  };

  const result = await postWithModelFallback(
    request,
    body,
    copilotToken.token,
    opts,
  );

  if (!result.ok) {
    // Emit a minimal stream with the error, then close
    const errorType = statusToAnthropicError(result.status);
    const messageId = generateMessageId();

    onChunk({
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        model: request.model,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    onChunk({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
    onChunk({
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text: `Error: ${errorType} (HTTP ${result.status})${
          result.errorBody ? ` — ${result.errorBody}` : ""
        }`,
      },
    });
    onChunk({ type: "content_block_stop", index: 0 });
    onChunk({
      type: "message_delta",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      delta: { type: "stop_reason", stop_reason: "end_turn" },
    });
    onChunk({ type: "message_stop" });
    return;
  }

  const reader = result.response!.body!.getReader();

  let headerEmitted = false;
  let doneEmitted = false;
  const messageId = generateMessageId();
  const estimatedInputTokens = estimateInputTokens(request);
  let pendingStopReason: "end_turn" | "max_tokens" | "tool_use" | null = null;
  let actualInputTokens = estimatedInputTokens;
  let actualOutputTokens = 0;

  // Content block tracking
  let nextBlockIndex = 0;
  let textBlockIndex = -1;
  // Maps OpenAI tool_call index → { anthropic block index, id, name }
  const toolCallBlocks = new Map<
    number,
    { index: number; id: string; name: string }
  >();

  const emitHeader = () => {
    if (headerEmitted) return;
    headerEmitted = true;
    onChunk({
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        model: request.model,
        usage: {
          input_tokens: estimatedInputTokens,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
  };

  const emitDone = (
    stopReason: "end_turn" | "max_tokens" | "tool_use" | null,
  ) => {
    if (doneEmitted) return;
    doneEmitted = true;

    // Close all open content blocks in index order
    const openIndices: number[] = [];
    if (textBlockIndex >= 0) openIndices.push(textBlockIndex);
    for (const info of toolCallBlocks.values()) openIndices.push(info.index);
    openIndices.sort((a, b) => a - b);
    for (const idx of openIndices) {
      onChunk({ type: "content_block_stop", index: idx });
    }

    onChunk({
      type: "message_delta",
      usage: {
        input_tokens: actualInputTokens,
        output_tokens: actualOutputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      delta: { type: "stop_reason", stop_reason: stopReason ?? "end_turn" },
    });
    onChunk({ type: "message_stop" });
  };

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;

    const data = trimmed.slice("data:".length).trim();

    if (data === "[DONE]") {
      emitHeader();
      emitDone(pendingStopReason ?? "end_turn");
      return;
    }

    let chunk: OpenAIStreamChunk;
    try {
      chunk = JSON.parse(data) as OpenAIStreamChunk;
    } catch {
      return;
    }

    const choice = chunk.choices[0];
    // Usage-only chunk (choices is empty, usage is present) — capture actual counts
    if (!choice) {
      if (chunk.usage) {
        actualInputTokens = chunk.usage.prompt_tokens;
        actualOutputTokens = chunk.usage.completion_tokens;
      }
      return;
    }

    const { delta, finish_reason } = choice;

    // Handle text content
    if (delta.content) {
      emitHeader();
      if (textBlockIndex < 0) {
        textBlockIndex = nextBlockIndex++;
        onChunk({
          type: "content_block_start",
          index: textBlockIndex,
          content_block: { type: "text" },
        });
      }
      onChunk({
        type: "content_block_delta",
        index: textBlockIndex,
        delta: { type: "text_delta", text: delta.content },
      });
    }

    // Handle tool call deltas
    if (delta.tool_calls) {
      emitHeader();
      for (const tcDelta of delta.tool_calls) {
        const tcIndex = tcDelta.index;

        if (!toolCallBlocks.has(tcIndex)) {
          // First chunk for this tool call — start the block
          const blockIndex = nextBlockIndex++;
          const id = tcDelta.id ?? `tool_${blockIndex}`;
          const name = tcDelta.function?.name ?? "";
          toolCallBlocks.set(tcIndex, { index: blockIndex, id, name });
          onChunk({
            type: "content_block_start",
            index: blockIndex,
            content_block: { type: "tool_use", id, name, input: {} },
          });
        }

        if (tcDelta.function?.arguments) {
          const blockInfo = toolCallBlocks.get(tcIndex)!;
          onChunk({
            type: "content_block_delta",
            index: blockInfo.index,
            delta: {
              type: "input_json_delta",
              partial_json: tcDelta.function.arguments,
            },
          });
        }
      }
    }

    if (finish_reason) {
      emitHeader();
      // Defer emitDone — wait for the usage chunk that follows finish_reason
      pendingStopReason = finishReasonToStopReason(finish_reason);
    }
  };

  // Create enhanced streaming processor
  const processor = new StreamingProcessor(
    config,
    processLine,
  );

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Use enhanced processor instead of basic line splitting
      processor.processChunk(value);
    }
  } finally {
    // Process any remaining buffer content
    processor.finish();
    reader.releaseLock();
  }

  // Flush if [DONE] was never received
  emitHeader();
  emitDone("end_turn");
}

// ---------------------------------------------------------------------------
// Direct Responses API proxy
// ---------------------------------------------------------------------------

/**
 * Proxy a request directly to Copilot's /v1/responses endpoint, injecting
 * auth headers. Returns the raw Response so the caller can stream it back
 * to the client without any translation overhead.
 *
 * Use this from the gateway /v1/responses handler instead of the
 * openAIToAnthropic → chatStream path, which double-converts and loses
 * fidelity (especially for tools and responses-only models).
 */
export async function proxyResponses(
  body: Record<string, unknown>,
  opts?: ChatOptions & { candidateModels?: string[]; isAgentCall?: boolean },
): Promise<Response> {
  const tokenData = await getToken({ getGitHubToken: opts?.getGitHubToken });
  const headers = buildHeaders(tokenData.token, opts?.isAgentCall ?? false);
  const requestedModel = typeof body.model === "string" ? body.model : "";
  const candidates = opts?.candidateModels?.length
    ? opts.candidateModels
    : [requestedModel];

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const response = await fetchWithRetry(COPILOT_RESPONSES_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        model: candidate,
      }),
    });

    if (response.ok) {
      return response;
    }

    const errorBody = await response.clone().text().catch(() => "");
    const canRetry = index < candidates.length - 1 &&
      shouldRetryCandidate(response.status, errorBody);
    if (canRetry) {
      await response.body?.cancel();
      continue;
    }

    return response;
  }

  return new Response("No compatible Copilot model available", {
    status: 503,
    headers: { "Content-Type": "text/plain" },
  });
}
