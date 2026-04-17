import { proxyResponses } from "@modmux/providers";
import {
  openAIServiceUnavailable,
  parseOpenAIRequestBody,
  resolveOpenAIModelCandidates,
  validateOpenAIModelField,
} from "./openai-handler-utils.ts";
import { openAIErrorResponse } from "./response-utils.ts";
import { log } from "./log.ts";
import type {
  OpenAIResponsesInputMessage,
  OpenAIResponsesRequest,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Input normalization + validation
// ---------------------------------------------------------------------------

/**
 * Strip invalid content parts from a message input array before forwarding.
 * Removes parts that are missing text (e.g. `{type:"text"}` with no `text`
 * field) so Copilot doesn't reject the entire request due to one bad part.
 * Returns the input unchanged if it's a plain string.
 */
function normalizeInput(
  input: string | OpenAIResponsesInputMessage[] | undefined,
): string | OpenAIResponsesInputMessage[] | undefined {
  if (!Array.isArray(input)) return input;

  return input.map((item) => {
    if (!Array.isArray(item.content)) return item;
    const cleanParts = item.content.filter(
      (part) =>
        !(
          part &&
          typeof part === "object" &&
          (part.type === "input_text" || part.type === "text") &&
          typeof part.text !== "string"
        ),
    );
    return { ...item, content: cleanParts };
  });
}

/**
 * Returns true if the Responses API input contains at least one message with
 * non-empty text content. Used to reject obviously invalid requests early
 * rather than forwarding garbage to Copilot.
 */
function hasValidInput(
  input: string | OpenAIResponsesInputMessage[] | undefined,
): boolean {
  if (typeof input === "string") return input.trim().length > 0;
  if (!Array.isArray(input) || input.length === 0) return false;

  return input.some((item) => {
    if (typeof item.content === "string") return item.content.trim().length > 0;
    if (Array.isArray(item.content)) {
      return item.content.some(
        (part) =>
          part &&
          typeof part === "object" &&
          (part.type === "input_text" || part.type === "text") &&
          typeof part.text === "string" &&
          part.text.trim().length > 0,
      );
    }
    return false;
  });
}

function statusToOpenAIError(
  status: number,
): { type: string; code: string } {
  if (status === 400) {
    return { type: "invalid_request_error", code: "invalid_value" };
  }
  if (status === 401) {
    return { type: "authentication_error", code: "invalid_api_key" };
  }
  if (status === 403) {
    return { type: "permission_error", code: "permission_denied" };
  }
  if (status === 429) {
    return { type: "rate_limit_error", code: "rate_limit_exceeded" };
  }
  if (status === 503) {
    return { type: "api_error", code: "service_unavailable" };
  }
  return { type: "api_error", code: "upstream_error" };
}

async function normalizeUpstreamError(upstream: Response): Promise<Response> {
  const errorText = await upstream.text().catch(() => "");
  const headers = new Headers(upstream.headers);
  const trimmed = errorText.trim();

  if (trimmed.length > 0) {
    try {
      JSON.parse(trimmed);
      headers.set("Content-Type", "application/json");
      return new Response(trimmed, {
        status: upstream.status,
        headers,
      });
    } catch {
      // Fall through to normalize plain-text errors into OpenAI JSON.
    }
  }

  const errorShape = statusToOpenAIError(upstream.status);
  return openAIErrorResponse(
    upstream.status,
    trimmed || "Service unavailable",
    errorShape.type,
    errorShape.code,
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * POST /v1/responses — thin proxy to Copilot's native responses endpoint.
 *
 * Resolves the model name, validates the input, then forwards the request
 * body directly to https://api.githubcopilot.com/v1/responses and streams
 * the response back unchanged. No translation through Anthropic format.
 */
export async function handleResponses(req: Request): Promise<Response> {
  const bodyOrResponse = await parseOpenAIRequestBody(req);
  if (bodyOrResponse instanceof Response) return bodyOrResponse;
  const body = bodyOrResponse;

  const modelError = validateOpenAIModelField(body);
  if (modelError) return modelError;

  const responsesReq = body as unknown as OpenAIResponsesRequest;

  await log("debug", "responses: request received", {
    model: responsesReq.model,
    stream: responsesReq.stream ?? false,
  });

  if (!hasValidInput(responsesReq.input)) {
    await log("debug", "responses: rejected — empty input");
    return openAIErrorResponse(
      400,
      "input is required and must contain text content",
      "invalid_request_error",
      "invalid_value",
    );
  }

  const normalizedInput = normalizeInput(responsesReq.input);
  const proxiedBody = normalizedInput === responsesReq.input
    ? (body as Record<string, unknown>)
    : { ...(body as Record<string, unknown>), input: normalizedInput };

  const resolutionOrResponse = await resolveOpenAIModelCandidates(
    responsesReq.model,
    "responses",
    "/v1/responses",
  );
  if (resolutionOrResponse instanceof Response) {
    await log("debug", "responses: model resolution rejected", {
      model: responsesReq.model,
    });
    return resolutionOrResponse;
  }
  const resolvedModel = resolutionOrResponse.resolvedModel;
  const candidateModels = resolutionOrResponse.candidateModels ??
    [resolvedModel];

  await log("debug", "responses: model resolved", {
    requested: responsesReq.model,
    resolved: resolvedModel,
    candidates: candidateModels,
  });

  try {
    const upstream = await proxyResponses({
      ...proxiedBody,
      model: resolvedModel,
    }, {
      candidateModels,
    });

    await log("debug", "responses: upstream response", {
      status: upstream.status,
      stream: responsesReq.stream ?? false,
    });

    if (!upstream.ok) {
      await log("warn", "responses: upstream error", {
        status: upstream.status,
        body: await upstream.clone().text().catch(() => ""),
      });
      return await normalizeUpstreamError(upstream);
    }

    // Pass Copilot's response through directly — headers, body, status.
    // For streaming this is text/event-stream; for non-streaming application/json.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (err) {
    await log("warn", "responses: proxy error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return openAIServiceUnavailable(err);
  }
}
