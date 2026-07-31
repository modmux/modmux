import { chat, chatStream } from "../../providers/src/mod.ts";
import {
  anthropicStreamEventToOpenAI,
  anthropicToOpenAI,
  makeStreamState,
  openAIToAnthropic,
} from "./openai-translate.ts";
import {
  openAIServiceUnavailable,
  parseOpenAIRequestBody,
  resolveOpenAIModel,
  validateOpenAIModelField,
} from "./openai-handler-utils.ts";
import { isNonEmptyArray } from "./request-utils.ts";
import {
  EVENT_STREAM_HEADERS,
  jsonResponse,
  openAIErrorBody,
  openAIErrorResponse,
} from "./response-utils.ts";
import type { OpenAIChatRequest, ProxyRequest } from "./types.ts";
import { loadConfig } from "./store.ts";
import { detectAgentHint } from "./agent-hint.ts";

export async function handleChatCompletions(req: Request): Promise<Response> {
  const bodyOrResponse = await parseOpenAIRequestBody(req);
  if (bodyOrResponse instanceof Response) return bodyOrResponse;
  const body = bodyOrResponse;

  const modelError = validateOpenAIModelField(body);
  if (modelError) return modelError;

  if (!isNonEmptyArray(body.messages)) {
    return openAIErrorResponse(
      400,
      "messages is required and must be non-empty",
      "invalid_request_error",
      "invalid_value",
    );
  }

  const openAIReq = body as unknown as OpenAIChatRequest;
  const resolvedModelOrResponse = await resolveOpenAIModel(
    openAIReq.model,
    "chat_completions",
    "/v1/chat/completions",
    {
      requestBody: body,
      agentHint: detectAgentHint(req.headers.get("user-agent")),
    },
  );
  if (resolvedModelOrResponse instanceof Response) {
    return resolvedModelOrResponse;
  }
  const resolvedModel = resolvedModelOrResponse;

  const anthropicReq: ProxyRequest = {
    ...openAIToAnthropic(openAIReq),
    model: resolvedModel,
  };

  if (anthropicReq.stream) {
    const config = await loadConfig();
    const state = makeStreamState(resolvedModel);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let backpressureCount = 0;
        let isClosed = false;

        const queueChunk = async (data: string): Promise<void> => {
          if (isClosed) return;

          try {
            controller.enqueue(encoder.encode(data));
          } catch (err) {
            if (err instanceof TypeError && err.message.includes("full")) {
              backpressureCount++;
              // Implement exponential backoff for backpressure
              const delay = Math.min(100 * backpressureCount, 1000);
              await new Promise((resolve) => setTimeout(resolve, delay));

              if (!isClosed) {
                // Retry the enqueue
                controller.enqueue(encoder.encode(data));
              }
            } else if (
              err instanceof TypeError && err.message.includes("close")
            ) {
              // Stream is already closed, ignore
              isClosed = true;
            } else {
              throw err;
            }
          }
        };

        try {
          let pendingWrites: Promise<void> = Promise.resolve();
          await chatStream(anthropicReq, (event) => {
            const line = anthropicStreamEventToOpenAI(event, state);
            if (line) {
              pendingWrites = pendingWrites.then(() => queueChunk(line));
            }
          });
          await pendingWrites;

          if (!isClosed) {
            await queueChunk("data: [DONE]\n\n");
          }
        } catch (err) {
          if (!isClosed) {
            const errorBody = openAIErrorBody(
              err instanceof Error ? err.message : "Service unavailable",
              "api_error",
              "service_unavailable",
            );
            await queueChunk(`data: ${JSON.stringify(errorBody)}\n\n`);
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
    const anthropicResp = await chat(anthropicReq);
    const openAIResp = anthropicToOpenAI(anthropicResp, resolvedModel);
    return jsonResponse(openAIResp);
  } catch (err) {
    return openAIServiceUnavailable(err);
  }
}
