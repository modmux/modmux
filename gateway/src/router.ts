import { handleChatCompletions } from "./chat-handler.ts";
import { handleCountTokens, handleMessages } from "./messages-handler.ts";
import { handleModels } from "./models-handler.ts";
import { errorResponse, jsonResponse } from "./response-utils.ts";
import { handleResponses } from "./responses-handler.ts";
import {
  addShutdownHandler,
  getConfig,
  initializeServerRuntime,
  shutdown,
} from "./server.ts";
import {
  getUsageMetricsSnapshotWithGitHub,
  initializeUsageMetrics,
  recordUsage,
} from "./usage-metrics.ts";
import { log } from "./log.ts";

const server = Deno.serve;

function detectAgentFromUserAgent(
  userAgent: string | null,
): string | undefined {
  if (!userAgent) return undefined;

  const normalized = userAgent.toLowerCase();
  if (normalized.includes("claude-code") || normalized.includes("anthropic")) {
    return "claude-code";
  }
  if (normalized.includes("cline")) return "cline";
  if (normalized.includes("codex")) return "codex";
  return undefined;
}

async function extractUsageDimensions(
  req: Request,
  url: URL,
): Promise<{ model?: string; agent?: string }> {
  const dimensions: { model?: string; agent?: string } = {
    agent: detectAgentFromUserAgent(req.headers.get("user-agent")),
  };

  if (req.method !== "POST") return dimensions;

  const modelPaths = new Set([
    "/v1/messages",
    "/v1/messages/count_tokens",
    "/v1/chat/completions",
    "/v1/responses",
  ]);
  if (!modelPaths.has(url.pathname)) return dimensions;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return dimensions;
  }

  try {
    const body = await req.clone().json() as Record<string, unknown>;
    if (typeof body.model === "string" && body.model.trim()) {
      dimensions.model = body.model;
    }
  } catch {
    // Metrics dimensions are best-effort and must never affect request flow.
  }

  return dimensions;
}

function resolveMetricsEndpoint(req: Request, url: URL): string | null {
  if (url.pathname === "/health") return "/health";
  if (req.method === "POST" && url.pathname === "/v1/messages") {
    return "/v1/messages";
  }
  if (req.method === "POST" && url.pathname === "/v1/messages/count_tokens") {
    return "/v1/messages/count_tokens";
  }
  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    return "/v1/chat/completions";
  }
  if (req.method === "POST" && url.pathname === "/v1/responses") {
    return "/v1/responses";
  }
  if (req.method === "GET" && url.pathname === "/v1/models") {
    return "/v1/models";
  }
  if (req.method === "GET" && url.pathname === "/v1/usage") {
    return "/v1/usage";
  }
  return null;
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const endpoint = resolveMetricsEndpoint(req, url);
  const dimensions = await extractUsageDimensions(req, url);
  const startedAt = performance.now();

  try {
    let response: Response;

    if (url.pathname === "/health") {
      response = jsonResponse({ status: "ok" });
    } else if (req.method === "POST" && url.pathname === "/v1/messages") {
      response = await handleMessages(req);
    } else if (
      req.method === "POST" && url.pathname === "/v1/messages/count_tokens"
    ) {
      response = await handleCountTokens(req);
    } else if (
      req.method === "POST" && url.pathname === "/v1/chat/completions"
    ) {
      response = await handleChatCompletions(req);
    } else if (req.method === "POST" && url.pathname === "/v1/responses") {
      response = await handleResponses(req);
    } else if (req.method === "GET" && url.pathname === "/v1/models") {
      response = await handleModels();
    } else if (req.method === "GET" && url.pathname === "/v1/usage") {
      response = jsonResponse(await getUsageMetricsSnapshotWithGitHub());
    } else {
      response = errorResponse(
        404,
        "invalid_request_error",
        "Not found",
        null,
      );
    }

    if (endpoint !== null) {
      recordUsage(
        endpoint,
        response.status,
        performance.now() - startedAt,
        dimensions,
      );
    }

    return response;
  } catch (err) {
    log("error", "Unhandled request error", {
      error: err instanceof Error ? err.message : String(err),
      method: req.method,
      path: url.pathname,
    });

    const response = errorResponse(
      500,
      "service_error",
      "Internal server error",
      null,
    );

    if (endpoint !== null) {
      recordUsage(
        endpoint,
        response.status,
        performance.now() - startedAt,
        dimensions,
      );
    }

    return response;
  }
}

export async function startServer(): Promise<
  { port: number; stop: () => Promise<void> }
> {
  await initializeServerRuntime();
  const config = await getConfig();
  await initializeUsageMetrics(config.usageMetrics);
  addShutdownHandler();

  const httpServer = server({
    hostname: config.hostname,
    port: config.port,
    handler: handleRequest,
    onListen: ({ port, hostname }) => {
      log("info", "Server started", { port, hostname });
    },
  });

  const { port } = httpServer.addr as Deno.NetAddr;

  return {
    port,
    stop: async () => {
      await httpServer.shutdown();
      await shutdown();
    },
  };
}
