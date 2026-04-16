import { chat, chatStream } from "@modmux/providers";
import { anthropicToOpenAI, openAIToAnthropic } from "./openai-translate.ts";
import {
  openAIServiceUnavailable,
  parseOpenAIRequestBody,
  resolveOpenAIModel,
  validateOpenAIModelField,
} from "./openai-handler-utils.ts";
import {
  EVENT_STREAM_HEADERS,
  jsonResponse,
  openAIErrorBody,
  openAIErrorResponse,
} from "./response-utils.ts";
import { loadConfig } from "./store.ts";
import type {
  OpenAIChatRequest,
  OpenAIResponsesInputMessage,
  OpenAIResponsesRequest,
  OpenAIToolCall,
  ProxyRequest,
  StreamEvent,
} from "./types.ts";

function responsesInputToMessages(
  input: string | OpenAIResponsesInputMessage[] | undefined,
): OpenAIChatRequest["messages"] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) return [];

  const messages: OpenAIChatRequest["messages"] = [];
  for (const item of input) {
    const role = item.role;
    if (role !== "user" && role !== "assistant" && role !== "system") {
      continue;
    }

    if (typeof item.content === "string") {
      messages.push({ role, content: item.content });
      continue;
    }

    if (Array.isArray(item.content)) {
      const text = item.content
        .filter((part): part is { type: "input_text" | "text"; text: string } =>
          part && typeof part === "object" &&
          (part.type === "input_text" || part.type === "text") &&
          typeof part.text === "string"
        )
        .map((part) => part.text)
        .join("\n");
      messages.push({ role, content: text });
    }
  }

  return messages.filter((message) =>
    typeof message.content === "string" && message.content.trim().length > 0
  );
}

interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details: { cached_tokens: number };
  output_tokens_details: { reasoning_tokens: number };
}

interface ResponsesBody {
  id: string;
  object: "response";
  created_at: number;
  status: "completed";
  model: string;
  output: ResponsesOutputItem[];
  output_text: string;
  usage: ResponsesUsage;
}

interface ResponsesMessageOutputItem {
  type: "message";
  role: "assistant";
  content: Array<{ type: "output_text"; text: string }>;
}

interface ResponsesFunctionCallOutputItem {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: "completed";
}

type ResponsesOutputItem =
  | ResponsesMessageOutputItem
  | ResponsesFunctionCallOutputItem;

interface StreamFunctionCallState {
  itemId: string;
  callId: string;
  name: string;
  arguments: string;
}

interface ResponsesStreamState {
  requestedModel: string;
  responseId: string | null;
  outputItemId: string | null;
  createdAt: number;
  text: string;
  usage: ResponsesUsage | null;
  textBlockIndex: number | null;
  contentDone: boolean;
  functionCalls: Map<number, StreamFunctionCallState>;
  completed: boolean;
}

function usageFromCounts(
  promptTokens: number,
  completionTokens: number,
): ResponsesUsage {
  return {
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
}

function buildResponsesBody(
  responseId: string,
  createdAt: number,
  model: string,
  text: string,
  usage: ResponsesUsage,
  output: ResponsesOutputItem[],
): ResponsesBody {
  return {
    id: responseId,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model,
    output,
    output_text: text,
    usage,
  };
}

function messageOutput(text: string): ResponsesMessageOutputItem {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

function functionCallOutput(
  toolCall: OpenAIToolCall,
): ResponsesFunctionCallOutputItem {
  return {
    type: "function_call",
    id: `fc_${toolCall.id}`,
    call_id: toolCall.id,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
    status: "completed",
  };
}

function toResponsesBody(openAIResp: ReturnType<typeof anthropicToOpenAI>) {
  const message = openAIResp.choices[0]?.message;
  const text = message?.content ?? "";
  const output: ResponsesOutputItem[] = [];

  output.push(messageOutput(text));
  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      output.push(functionCallOutput(toolCall));
    }
  }

  return buildResponsesBody(
    `resp_${openAIResp.id}`,
    openAIResp.created,
    openAIResp.model,
    text,
    usageFromCounts(
      openAIResp.usage.prompt_tokens,
      openAIResp.usage.completion_tokens,
    ),
    output,
  );
}

interface ResponsesSseEvent {
  event: string;
  data: Record<string, unknown>;
}

async function getResponsesBody(
  anthropicReq: ProxyRequest,
  requestedModel: string,
) {
  const anthropicResp = await chat(anthropicReq);
  const openAIResp = anthropicToOpenAI(anthropicResp, requestedModel);
  return toResponsesBody(openAIResp);
}

function createResponsesStreamState(
  requestedModel: string,
): ResponsesStreamState {
  return {
    requestedModel,
    responseId: null,
    outputItemId: null,
    createdAt: Math.floor(Date.now() / 1000),
    text: "",
    usage: null,
    textBlockIndex: null,
    contentDone: false,
    functionCalls: new Map(),
    completed: false,
  };
}

function toFunctionCallOutputItems(
  state: ResponsesStreamState,
): ResponsesFunctionCallOutputItem[] {
  return Array.from(state.functionCalls.values()).map((call) => ({
    type: "function_call",
    id: call.itemId,
    call_id: call.callId,
    name: call.name,
    arguments: call.arguments,
    status: "completed",
  }));
}

function ensureResponseIds(
  state: ResponsesStreamState,
  messageId?: string,
): void {
  if (state.responseId && state.outputItemId) return;
  const baseId = messageId ?? crypto.randomUUID();
  state.responseId = `resp_${baseId}`;
  state.outputItemId = `msg_${state.responseId}`;
}

function finalizeContent(state: ResponsesStreamState): ResponsesSseEvent[] {
  if (state.contentDone || !state.responseId || !state.outputItemId) {
    return [];
  }

  state.contentDone = true;
  return [
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        response_id: state.responseId,
        output_index: 0,
        item_id: state.outputItemId,
        content_index: 0,
        text: state.text,
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        response_id: state.responseId,
        output_index: 0,
        item_id: state.outputItemId,
        content_index: 0,
        part: { type: "output_text", text: state.text },
      },
    },
  ];
}

function mapStreamEventToResponses(
  event: StreamEvent,
  state: ResponsesStreamState,
): ResponsesSseEvent[] {
  switch (event.type) {
    case "message_start": {
      const message = event.message;
      const messageId =
        message && typeof message === "object" && "id" in message &&
          typeof message.id === "string"
          ? message.id
          : undefined;
      ensureResponseIds(state, messageId);

      return [
        {
          event: "response.created",
          data: {
            type: "response.created",
            response: {
              id: state.responseId,
              object: "response",
              model: state.requestedModel,
              status: "in_progress",
            },
          },
        },
        {
          event: "response.output_item.added",
          data: {
            type: "response.output_item.added",
            response_id: state.responseId,
            output_index: 0,
            item: {
              id: state.outputItemId,
              type: "message",
              role: "assistant",
              status: "in_progress",
              content: [],
            },
          },
        },
        {
          event: "response.content_part.added",
          data: {
            type: "response.content_part.added",
            response_id: state.responseId,
            output_index: 0,
            item_id: state.outputItemId,
            content_index: 0,
            part: { type: "output_text", text: "" },
          },
        },
      ];
    }

    case "content_block_start": {
      const contentBlock = event.content_block;
      if (
        contentBlock && typeof contentBlock === "object" &&
        "type" in contentBlock && contentBlock.type === "text" &&
        typeof event.index === "number"
      ) {
        state.textBlockIndex = event.index;
        return [];
      }

      if (
        contentBlock && typeof contentBlock === "object" &&
        "type" in contentBlock && contentBlock.type === "tool_use" &&
        typeof event.index === "number"
      ) {
        ensureResponseIds(state);

        const functionCall: StreamFunctionCallState = {
          itemId: `fc_${contentBlock.id}`,
          callId: contentBlock.id,
          name: contentBlock.name,
          arguments: "",
        };

        state.functionCalls.set(event.index, functionCall);

        return [{
          event: "response.output_item.added",
          data: {
            type: "response.output_item.added",
            response_id: state.responseId,
            output_index: 1,
            item: {
              id: functionCall.itemId,
              type: "function_call",
              call_id: functionCall.callId,
              name: functionCall.name,
              arguments: functionCall.arguments,
              status: "in_progress",
            },
          },
        }];
      }

      return [];
    }

    case "content_block_delta": {
      const delta = event.delta;
      if (
        delta && typeof delta === "object" && "type" in delta &&
        delta.type === "input_json_delta" && typeof event.index === "number"
      ) {
        const functionCall = state.functionCalls.get(event.index);
        if (!functionCall) return [];

        functionCall.arguments += delta.partial_json;

        return [{
          event: "response.function_call_arguments.delta",
          data: {
            type: "response.function_call_arguments.delta",
            response_id: state.responseId,
            item_id: functionCall.itemId,
            output_index: 1,
            delta: delta.partial_json,
          },
        }];
      }

      if (
        !delta || typeof delta !== "object" || !("type" in delta) ||
        delta.type !== "text_delta" || !("text" in delta) ||
        typeof delta.text !== "string"
      ) {
        return [];
      }

      ensureResponseIds(state);
      state.text += delta.text;
      return [{
        event: "response.output_text.delta",
        data: {
          type: "response.output_text.delta",
          response_id: state.responseId,
          output_index: 0,
          item_id: state.outputItemId,
          content_index: 0,
          delta: delta.text,
        },
      }];
    }

    case "content_block_stop": {
      if (typeof event.index === "number") {
        const functionCall = state.functionCalls.get(event.index);
        if (functionCall) {
          return [
            {
              event: "response.function_call_arguments.done",
              data: {
                type: "response.function_call_arguments.done",
                response_id: state.responseId,
                item_id: functionCall.itemId,
                output_index: 1,
                arguments: functionCall.arguments,
              },
            },
            {
              event: "response.output_item.done",
              data: {
                type: "response.output_item.done",
                response_id: state.responseId,
                output_index: 1,
                item: {
                  id: functionCall.itemId,
                  type: "function_call",
                  call_id: functionCall.callId,
                  name: functionCall.name,
                  arguments: functionCall.arguments,
                  status: "completed",
                },
              },
            },
          ];
        }
      }

      if (
        state.textBlockIndex !== null && typeof event.index === "number" &&
        event.index === state.textBlockIndex
      ) {
        return finalizeContent(state);
      }
      return [];
    }

    case "message_delta": {
      const usage = event.usage;
      if (
        usage && typeof usage === "object" && "input_tokens" in usage &&
        "output_tokens" in usage && typeof usage.input_tokens === "number" &&
        typeof usage.output_tokens === "number"
      ) {
        state.usage = usageFromCounts(usage.input_tokens, usage.output_tokens);
      }
      return [];
    }

    case "message_stop": {
      ensureResponseIds(state);
      const events = finalizeContent(state);
      const usage = state.usage ?? usageFromCounts(0, 0);
      const output = [
        messageOutput(state.text),
        ...toFunctionCallOutputItems(state),
      ];
      const responseBody = buildResponsesBody(
        state.responseId!,
        state.createdAt,
        state.requestedModel,
        state.text,
        usage,
        output,
      );

      events.push(
        {
          event: "response.output_item.done",
          data: {
            type: "response.output_item.done",
            response_id: state.responseId,
            output_index: 0,
            item: {
              id: state.outputItemId,
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: state.text }],
            },
          },
        },
        {
          event: "response.completed",
          data: {
            type: "response.completed",
            response: responseBody,
          },
        },
      );

      state.completed = true;

      return events;
    }

    default:
      return [];
  }
}

export async function handleResponses(req: Request): Promise<Response> {
  const bodyOrResponse = await parseOpenAIRequestBody(req);
  if (bodyOrResponse instanceof Response) return bodyOrResponse;
  const body = bodyOrResponse;

  const modelError = validateOpenAIModelField(body);
  if (modelError) return modelError;

  const responsesReq = body as unknown as OpenAIResponsesRequest;
  const messages = responsesInputToMessages(responsesReq.input);
  if (messages.length === 0) {
    return openAIErrorResponse(
      400,
      "input is required and must contain text content",
      "invalid_request_error",
      "invalid_value",
    );
  }

  const resolvedModelOrResponse = await resolveOpenAIModel(
    responsesReq.model,
    "responses",
    "/v1/responses",
  );
  if (resolvedModelOrResponse instanceof Response) {
    return resolvedModelOrResponse;
  }
  const resolvedModel = resolvedModelOrResponse;

  const anthropicReq: ProxyRequest = {
    ...openAIToAnthropic({
      model: responsesReq.model,
      messages,
      max_tokens: responsesReq.max_output_tokens ?? 4096,
      stream: false,
      temperature: responsesReq.temperature,
      top_p: responsesReq.top_p,
      tools: responsesReq.tools,
      tool_choice: responsesReq.tool_choice,
    }),
    model: resolvedModel,
    stream: false,
  };

  if (responsesReq.stream === true) {
    const config = await loadConfig();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const state = createResponsesStreamState(responsesReq.model);
        let backpressureCount = 0;
        let isClosed = false;

        const queueChunk = async (data: string): Promise<void> => {
          if (isClosed) return;

          try {
            controller.enqueue(encoder.encode(data));
          } catch (err) {
            if (err instanceof TypeError && err.message.includes("full")) {
              backpressureCount++;
              const delay = Math.min(100 * backpressureCount, 1000);
              await new Promise((resolve) => setTimeout(resolve, delay));

              if (!isClosed) {
                controller.enqueue(encoder.encode(data));
              }
            } else if (
              err instanceof TypeError && err.message.includes("close")
            ) {
              isClosed = true;
            } else {
              throw err;
            }
          }
        };

        const write = async (
          event: string,
          data: Record<string, unknown>,
        ): Promise<void> => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          await queueChunk(payload);
        };

        try {
          await chatStream({ ...anthropicReq, stream: true }, async (event) => {
            for (
              const responseEvent of mapStreamEventToResponses(event, state)
            ) {
              await write(responseEvent.event, responseEvent.data);
            }
          });

          if (!state.completed && state.responseId && state.outputItemId) {
            for (const event of finalizeContent(state)) {
              await write(event.event, event.data);
            }

            const usage = state.usage ?? usageFromCounts(0, 0);
            const output = [
              messageOutput(state.text),
              ...toFunctionCallOutputItems(state),
            ];
            const responseBody = buildResponsesBody(
              state.responseId,
              state.createdAt,
              state.requestedModel,
              state.text,
              usage,
              output,
            );

            await write("response.output_item.done", {
              type: "response.output_item.done",
              response_id: state.responseId,
              output_index: 0,
              item: {
                id: state.outputItemId,
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: state.text }],
              },
            });

            await write("response.completed", {
              type: "response.completed",
              response: responseBody,
            });
            state.completed = true;
          }

          if (!isClosed) {
            await queueChunk("data: [DONE]\n\n");
          }
        } catch (err) {
          if (!isClosed) {
            await write("error", {
              type: "error",
              error: openAIErrorBody(
                err instanceof Error ? err.message : "Service unavailable",
                "api_error",
                "service_unavailable",
              ).error,
            });
            await queueChunk("data: [DONE]\n\n");
          }
        } finally {
          if (!isClosed) {
            isClosed = true;
            controller.close();
          }
        }
      },
    }, {
      highWaterMark: config.streaming.highWaterMark,
    });

    return new Response(stream, {
      status: 200,
      headers: EVENT_STREAM_HEADERS,
    });
  }

  try {
    const responseBody = await getResponsesBody(
      anthropicReq,
      responsesReq.model,
    );

    return jsonResponse(responseBody);
  } catch (err) {
    return openAIServiceUnavailable(err);
  }
}
