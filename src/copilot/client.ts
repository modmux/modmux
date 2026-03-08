import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIMessage,
  OpenAIStreamChunk,
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
  ProxyRequest,
  ProxyResponse,
  StreamEvent,
} from "../server/types.ts";
import { generateMessageId } from "../server/types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COPILOT_CHAT_URL = "https://api.githubcopilot.com/chat/completions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }
  return messages;
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
  };

  const response = await fetch(COPILOT_CHAT_URL, {
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

  return {
    id: generateMessageId(),
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: choice.message.content }],
    model: request.model,
    stop_reason: finishReasonToStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
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
    ...(request.temperature !== undefined &&
      { temperature: request.temperature }),
    ...(request.top_p !== undefined && { top_p: request.top_p }),
  };

  const response = await fetch(COPILOT_CHAT_URL, {
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
        usage: { input_tokens: 0, output_tokens: 0 },
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
      usage: { input_tokens: 0, output_tokens: 0 },
      delta: { type: "stop_reason", stop_reason: "end_turn" },
    });
    onChunk({ type: "message_stop" });
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // State for managing event sequence
  let headerEmitted = false;
  let doneEmitted = false;
  const messageId = generateMessageId();

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
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
    onChunk({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
  };

  const emitDone = (stopReason: "end_turn" | "max_tokens" | null) => {
    if (doneEmitted) return;
    doneEmitted = true;
    onChunk({ type: "content_block_stop", index: 0 });
    onChunk({
      type: "message_delta",
      usage: { input_tokens: 0, output_tokens: 0 },
      delta: { type: "stop_reason", stop_reason: stopReason ?? "end_turn" },
    });
    onChunk({ type: "message_stop" });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on SSE line endings
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice("data:".length).trim();

        if (data === "[DONE]") {
          emitHeader(); // in case no content chunks were received
          emitDone("end_turn");
          continue;
        }

        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAIStreamChunk;
        } catch {
          continue;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const { delta, finish_reason } = choice;

        // Only emit content delta if there's actual text
        if (delta.content) {
          emitHeader();
          onChunk({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: delta.content },
          });
        }

        if (finish_reason) {
          emitHeader(); // ensure header emitted before close
          emitDone(finishReasonToStopReason(finish_reason));
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
