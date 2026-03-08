import {
  type ErrorResponse,
  type Message,
  type ProxyRequest,
  validateRequest,
} from "./types.ts";
import { chat, chatStream, countTokens } from "./copilot.ts";
import { toStreamEvent } from "./transform.ts";
import { addShutdownHandler, getConfig } from "./server.ts";

const server = Deno.serve;

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/v1/messages") {
    return await handleMessages(req);
  }

  if (req.method === "POST" && url.pathname === "/v1/messages/count_tokens") {
    return await handleCountTokens(req);
  }

  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Not found",
        param: null,
      },
    }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function handleMessages(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (error: unknown) {
    console.error("Request Handled:", error, req);
    return errorResponse(
      400,
      "invalid_request_error",
      "Invalid JSON body",
      null,
    );
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return errorResponse(
      400,
      validation.error!.error.type,
      validation.error!.error.message,
      validation.error!.error.param,
    );
  }

  const request = body as ProxyRequest;

  if (request.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          await chatStream(request, (event) => {
            controller.enqueue(encoder.encode(toStreamEvent(event)));
          });
        } catch (err) {
          const errorEvent = {
            type: "error" as const,
            error: {
              type: "service_error",
              message: err instanceof Error
                ? err.message
                : "Internal server error",
              param: null,
            },
          };
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  try {
    const response = await chat(request);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Request Chat Error:", "400", err);
    return errorResponse(
      503,
      "service_error",
      err instanceof Error ? err.message : "Copilot unavailable",
      null,
    );
  }
}

async function handleCountTokens(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(
      400,
      "invalid_request_error",
      "Invalid JSON body",
      null,
    );
  }

  if (!body || typeof body !== "object") {
    return errorResponse(
      400,
      "invalid_request_error",
      "Request body is required",
      null,
    );
  }

  const r = body as Record<string, unknown>;
  if (typeof r.model !== "string" || r.model === "") {
    return errorResponse(
      400,
      "invalid_request_error",
      "model is required",
      "model",
    );
  }
  if (!Array.isArray(r.messages) || r.messages.length === 0) {
    return errorResponse(
      400,
      "invalid_request_error",
      "messages is required",
      "messages",
    );
  }

  try {
    const response = countTokens({
      model: r.model as string,
      messages: r.messages as Message[],
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(
      503,
      "service_error",
      err instanceof Error ? err.message : "Copilot unavailable",
      null,
    );
  }
}

function errorResponse(
  status: number,
  type: string,
  message: string,
  param: string | null,
): Response {
  const body: ErrorResponse = {
    type: "error",
    error: { type, message, param },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function startServer(): { port: number; stop: () => Promise<void> } {
  const config = getConfig();
  addShutdownHandler();

  const httpServer = server({
    hostname: config.hostname,
    port: config.port,
    handler: handleRequest,
    onListen: () => {},
  });

  const { port } = httpServer.addr as Deno.NetAddr;

  return {
    port,
    stop: () => httpServer.shutdown(),
  };
}
