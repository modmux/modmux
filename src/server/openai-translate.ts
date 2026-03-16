/**
 * Bidirectional translation between OpenAI and Anthropic wire formats.
 * Used by the /v1/chat/completions handler.
 */
import type {
  OpenAIChatMessage,
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
} from "./types.ts";
import type {
  ContentBlock,
  Message,
  ProxyRequest,
  ProxyResponse,
  StreamEvent,
} from "./types.ts";
import { generateMessageId } from "./types.ts";

// ---------------------------------------------------------------------------
// OpenAI → Anthropic
// ---------------------------------------------------------------------------

/**
 * Convert an OpenAI /v1/chat/completions request to an Anthropic ProxyRequest.
 * System messages are extracted and joined as the `system` field.
 * The model name is passed through as-is (caller resolves aliases before here).
 */
export function openAIToAnthropic(req: OpenAIChatRequest): ProxyRequest {
  const systemParts: string[] = [];
  const messages: Message[] = [];

  for (const msg of req.messages) {
    if (msg.role === "system") {
      if (msg.content) systemParts.push(msg.content);
    } else if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content ?? "" });
    }
    // tool/function role messages are skipped for now
  }

  return {
    model: req.model,
    messages,
    max_tokens: req.max_tokens ?? 4096,
    system: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    stream: req.stream ?? false,
    temperature: req.temperature,
    top_p: req.top_p,
  };
}

// ---------------------------------------------------------------------------
// Anthropic → OpenAI (non-streaming)
// ---------------------------------------------------------------------------

/**
 * Convert an Anthropic ProxyResponse to OpenAI chat.completion format.
 */
export function anthropicToOpenAI(
  res: ProxyResponse,
  requestedModel: string,
): OpenAIChatResponse {
  const text = res.content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> =>
      b.type === "text"
    )
    .map((b) => b.text)
    .join("");

  const finishReason = stopReasonToFinishReason(res.stop_reason);

  const message: OpenAIChatMessage = {
    role: "assistant",
    content: text || null,
  };

  return {
    id: `chatcmpl-${res.id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: {
      prompt_tokens: res.usage.input_tokens,
      completion_tokens: res.usage.output_tokens,
      total_tokens: res.usage.input_tokens + res.usage.output_tokens,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic → OpenAI (streaming)
// ---------------------------------------------------------------------------

const STREAM_CHUNK_ID = () => `chatcmpl-${generateMessageId()}`;

/**
 * State carried across calls to anthropicStreamToOpenAI within one request.
 */
export interface StreamState {
  id: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function makeStreamState(model: string): StreamState {
  return { id: STREAM_CHUNK_ID(), model };
}

/**
 * Convert a single Anthropic StreamEvent to zero or more `data: ...` SSE lines.
 * Returns null when the event should be silently skipped.
 * Returns the string "[DONE]" for the terminal event.
 */
export function anthropicStreamEventToOpenAI(
  event: StreamEvent,
  state: StreamState,
): string | null {
  const created = Math.floor(Date.now() / 1000);

  switch (event.type) {
    case "message_start": {
      // Emit opening chunk with role
      const chunk: OpenAIStreamChunk = {
        id: state.id,
        object: "chat.completion.chunk",
        created,
        model: state.model,
        choices: [{
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        }],
      };
      return `data: ${JSON.stringify(chunk)}\n\n`;
    }

    case "content_block_delta": {
      if (!event.delta) return null;
      if (event.delta.type !== "text_delta") return null;
      const chunk: OpenAIStreamChunk = {
        id: state.id,
        object: "chat.completion.chunk",
        created,
        model: state.model,
        choices: [{
          index: 0,
          delta: { content: event.delta.text },
          finish_reason: null,
        }],
      };
      return `data: ${JSON.stringify(chunk)}\n\n`;
    }

    case "message_delta": {
      if (!event.delta) return null;
      const stopReason = (event.delta as { stop_reason?: string }).stop_reason;
      if (!stopReason) return null;
      const chunk: OpenAIStreamChunk = {
        id: state.id,
        object: "chat.completion.chunk",
        created,
        model: state.model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: stopReasonToFinishReason(stopReason),
        }],
      };
      // Capture usage from the Anthropic message_delta event
      if (event.usage) {
        state.usage = {
          prompt_tokens: event.usage.input_tokens,
          completion_tokens: event.usage.output_tokens,
          total_tokens: event.usage.input_tokens + event.usage.output_tokens,
        };
      }
      // Emit the stop chunk, then a usage chunk if usage data is available
      const stopLine = `data: ${JSON.stringify(chunk)}\n\n`;
      if (state.usage) {
        const usageChunk: OpenAIStreamChunk = {
          id: state.id,
          object: "chat.completion.chunk",
          created,
          model: state.model,
          choices: [],
          usage: {
            prompt_tokens: state.usage.prompt_tokens,
            completion_tokens: state.usage.completion_tokens,
            total_tokens: state.usage.total_tokens,
            prompt_tokens_details: { cached_tokens: 0 },
            completion_tokens_details: { reasoning_tokens: 0 },
          },
        };
        return `${stopLine}data: ${JSON.stringify(usageChunk)}\n\n`;
      }
      return stopLine;
    }

    case "message_stop":
      return "data: [DONE]\n\n";

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stopReasonToFinishReason(
  stopReason: string | null,
): "stop" | "length" | "tool_calls" | "content_filter" | null {
  switch (stopReason) {
    case "end_turn":
    case "stop":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
    case "length":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      return null;
  }
}

/**
 * Build an OpenAI-format error response body.
 */
export function openAIError(
  message: string,
  type: string,
  code: string,
): Record<string, unknown> {
  return { error: { message, type, code } };
}
