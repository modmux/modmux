import { chat } from "./copilot.ts";
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
import type {
  OpenAIChatRequest,
  OpenAIResponsesInputMessage,
  OpenAIResponsesRequest,
  ProxyRequest,
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
        .filter((part) =>
          part && typeof part === "object" &&
          (part.type === "input_text" || part.type === "text")
        )
        .map((part) => part.text)
        .join("\n");
      messages.push({ role, content: text });
    }
  }

  return messages.filter((message) => typeof message.content === "string");
}

function toResponsesBody(openAIResp: ReturnType<typeof anthropicToOpenAI>) {
  const text = openAIResp.choices[0]?.message?.content ?? "";
  return {
    id: `resp_${openAIResp.id}`,
    object: "response",
    created_at: openAIResp.created,
    status: "completed",
    model: openAIResp.model,
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    }],
    output_text: text,
    usage: {
      input_tokens: openAIResp.usage.prompt_tokens,
      output_tokens: openAIResp.usage.completion_tokens,
      total_tokens: openAIResp.usage.total_tokens,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
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

function buildResponseLifecycleEvents(
  responseBody: ReturnType<typeof toResponsesBody>,
): ResponsesSseEvent[] {
  const responseId = String(responseBody.id);
  const outputItemId = `msg_${responseId}`;
  const text = String(responseBody.output_text);

  return [
    {
      event: "response.created",
      data: {
        type: "response.created",
        response: {
          id: responseId,
          object: "response",
          model: responseBody.model,
          status: "in_progress",
        },
      },
    },
    {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        response_id: responseId,
        output_index: 0,
        item: {
          id: outputItemId,
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
        response_id: responseId,
        output_index: 0,
        item_id: outputItemId,
        content_index: 0,
        part: { type: "output_text", text: "" },
      },
    },
    {
      event: "response.output_text.delta",
      data: {
        type: "response.output_text.delta",
        response_id: responseId,
        output_index: 0,
        item_id: outputItemId,
        content_index: 0,
        delta: text,
      },
    },
    {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        response_id: responseId,
        output_index: 0,
        item_id: outputItemId,
        content_index: 0,
        text,
      },
    },
    {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        response_id: responseId,
        output_index: 0,
        item_id: outputItemId,
        content_index: 0,
        part: { type: "output_text", text },
      },
    },
    {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        response_id: responseId,
        output_index: 0,
        item: {
          id: outputItemId,
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text }],
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
  ];
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
    }),
    model: resolvedModel,
    stream: false,
  };

  if (responsesReq.stream === true) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const write = (event: string, data: Record<string, unknown>) => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        try {
          const responseBody = await getResponsesBody(
            anthropicReq,
            responsesReq.model,
          );

          for (const event of buildResponseLifecycleEvents(responseBody)) {
            write(event.event, event.data);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          write("error", {
            type: "error",
            error: openAIErrorBody(
              err instanceof Error ? err.message : "Service unavailable",
              "api_error",
              "service_unavailable",
            ).error,
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
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
