import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIMessage,
  OpenAIStreamChunk,
  OpenAITool,
} from "./types.ts";
import {
  COPILOT_API_VERSION,
  COPILOT_PLUGIN_VERSION,
  finishReasonToStopReason,
  VSCODE_VERSION,
} from "./types.ts";
import { resolveModel } from "./models.ts";
import { getToken } from "./token.ts";
import type {
  ContentBlock,
  ProxyRequest,
  ProxyResponse,
  StreamEvent,
  TextContentBlock,
  Tool,
  ToolChoice,
} from "../server/types.ts";
import { generateMessageId } from "../server/types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COPILOT_CHAT_URL = "https://api.githubcopilot.com/chat/completions";

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
  return tools.map((tool) => ({
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

// ---------------------------------------------------------------------------
// Non-streaming chat
// ---------------------------------------------------------------------------

export async function chat(request: ProxyRequest): Promise<ProxyResponse> {
  const copilotToken = await getToken();
  const copilotModel = await resolveModel(request.model);

  const body: OpenAIChatRequest = {
    model: copilotModel,
    messages: toOpenAIMessages(request),
    max_tokens: request.max_tokens,
    stream: false,
    ...(request.temperature !== undefined &&
      { temperature: request.temperature }),
    ...(request.top_p !== undefined && { top_p: request.top_p }),
    ...(request.tools && request.tools.length > 0 &&
      { tools: toOpenAITools(request.tools) }),
    ...(request.tool_choice &&
      { tool_choice: toOpenAIToolChoice(request.tool_choice) }),
  };

  const response = await fetchWithRetry(COPILOT_CHAT_URL, {
    method: "POST",
    headers: buildHeaders(copilotToken.token, isAgentCall(request)),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorType = statusToAnthropicError(response.status);
    // response.text() consumes the body — no need to cancel afterward
    const errorBody = await response.text().catch(() => "");
    return {
      id: generateMessageId(),
      type: "message",
      role: "assistant",
      content: [{
        type: "text",
        text: `Error: ${errorType} (HTTP ${response.status})${
          errorBody ? ` — ${errorBody}` : ""
        }`,
      }],
      model: request.model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const data = await response.json() as OpenAIChatResponse;
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
// Streaming chat
// ---------------------------------------------------------------------------

export async function chatStream(
  request: ProxyRequest,
  onChunk: (event: StreamEvent) => void,
): Promise<void> {
  const copilotToken = await getToken();
  const copilotModel = await resolveModel(request.model);

  const body: OpenAIChatRequest = {
    model: copilotModel,
    messages: toOpenAIMessages(request),
    max_tokens: request.max_tokens,
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

  const response = await fetchWithRetry(COPILOT_CHAT_URL, {
    method: "POST",
    headers: buildHeaders(copilotToken.token, isAgentCall(request)),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Emit a minimal stream with the error, then close
    const errorType = statusToAnthropicError(response.status);
    await response.body?.cancel();
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
        text: `Error: ${errorType} (HTTP ${response.status})`,
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

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice("data:".length).trim();

        if (data === "[DONE]") {
          emitHeader();
          emitDone(pendingStopReason ?? "end_turn");
          continue;
        }

        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAIStreamChunk;
        } catch {
          continue;
        }

        const choice = chunk.choices[0];
        // Usage-only chunk (choices is empty, usage is present) — capture actual counts
        if (!choice) {
          if (chunk.usage) {
            actualInputTokens = chunk.usage.prompt_tokens;
            actualOutputTokens = chunk.usage.completion_tokens;
          }
          continue;
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
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush if [DONE] was never received
  emitHeader();
  emitDone("end_turn");
}
