/**
 * Bidirectional translation between OpenAI and Anthropic wire formats.
 * Used by the /v1/chat/completions handler.
 */
import type {
  OpenAIChatMessage,
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk,
  OpenAITool,
  OpenAIToolCall,
} from "./types.ts";
import type {
  ContentBlock,
  Message,
  ProxyRequest,
  ProxyResponse,
  StreamEvent,
  Tool,
  ToolChoice,
  ToolInputSchema,
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
    } else if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content ?? "" });
    } else if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: toAnthropicAssistantContent(msg),
      });
    } else if (msg.role === "tool" && msg.tool_call_id) {
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id,
          content: msg.content ?? "",
        }],
      });
    }
  }

  return {
    model: req.model,
    messages,
    max_tokens: req.max_tokens ?? 4096,
    system: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    stream: req.stream ?? false,
    temperature: req.temperature,
    top_p: req.top_p,
    tools: toAnthropicTools(req.tools),
    tool_choice: toAnthropicToolChoice(req.tool_choice),
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
      b.type === "text" && typeof b.text === "string"
    )
    .map((b) => b.text)
    .join("");

  const finishReason = stopReasonToFinishReason(res.stop_reason);
  const toolCalls = res.content
    .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> =>
      b.type === "tool_use"
    )
    .map((b): OpenAIToolCall => ({
      id: b.id,
      type: "function",
      function: {
        name: b.name,
        arguments: JSON.stringify(b.input ?? {}),
      },
    }));

  const message: OpenAIChatMessage = {
    role: "assistant",
    content: text || null,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
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
  nextToolCallIndex: number;
  toolCallIndexByBlockIndex: Map<number, number>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function makeStreamState(model: string): StreamState {
  return {
    id: STREAM_CHUNK_ID(),
    model,
    nextToolCallIndex: 0,
    toolCallIndexByBlockIndex: new Map(),
  };
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

    case "content_block_start": {
      if (
        !event.content_block || typeof event.index !== "number" ||
        event.content_block.type !== "tool_use"
      ) {
        return null;
      }

      const toolCallIndex = state.nextToolCallIndex++;
      state.toolCallIndexByBlockIndex.set(event.index, toolCallIndex);

      const chunk: OpenAIStreamChunk = {
        id: state.id,
        object: "chat.completion.chunk",
        created,
        model: state.model,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: toolCallIndex,
              id: event.content_block.id,
              type: "function",
              function: {
                name: event.content_block.name,
                arguments: "",
              },
            }],
          },
          finish_reason: null,
        }],
      };
      return `data: ${JSON.stringify(chunk)}\n\n`;
    }

    case "content_block_delta": {
      if (!event.delta) return null;
      if (event.delta.type === "input_json_delta") {
        if (typeof event.index !== "number") return null;
        const toolCallIndex = state.toolCallIndexByBlockIndex.get(event.index);
        if (toolCallIndex === undefined) return null;

        const chunk: OpenAIStreamChunk = {
          id: state.id,
          object: "chat.completion.chunk",
          created,
          model: state.model,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: toolCallIndex,
                function: { arguments: event.delta.partial_json },
              }],
            },
            finish_reason: null,
          }],
        };
        return `data: ${JSON.stringify(chunk)}\n\n`;
      }

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

function toAnthropicAssistantContent(
  msg: OpenAIChatMessage,
): string | ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (typeof msg.content === "string" && msg.content.length > 0) {
    blocks.push({ type: "text", text: msg.content });
  }

  if (Array.isArray(msg.tool_calls)) {
    for (const toolCall of msg.tool_calls) {
      blocks.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseToolArguments(toolCall.function.arguments),
      });
    }
  }

  if (blocks.length === 0) return "";
  if (blocks.length === 1 && blocks[0].type === "text") return blocks[0].text;
  return blocks;
}

function parseToolArguments(argumentsText: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsText) as Record<string, unknown>;
  } catch {
    return { _raw: argumentsText };
  }
}

function toAnthropicTools(tools?: OpenAITool[]): Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description &&
      { description: tool.function.description }),
    input_schema: toToolInputSchema(tool.function.parameters),
  }));
}

function toToolInputSchema(
  parameters?: Record<string, unknown>,
): ToolInputSchema {
  if (!parameters) return { type: "object", properties: {} };

  const typeValue = parameters.type;
  if (typeValue === "object") {
    return parameters as ToolInputSchema;
  }

  return {
    type: "object",
    properties: parameters,
  };
}

function toAnthropicToolChoice(
  choice: OpenAIChatRequest["tool_choice"],
): ToolChoice | undefined {
  if (!choice || choice === "none") return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.function.name };
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
