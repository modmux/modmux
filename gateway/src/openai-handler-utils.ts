import { loadConfig } from "./store.ts";
import { DEFAULT_CONFIG } from "./store.ts";
import { log } from "./log.ts";
import {
  type ModelEndpoint,
  type ModelResolution,
  resolveModelForEndpoint,
} from "./model-resolver.ts";
import { resolveAutoModel } from "./auto-router.ts";
import type { AgentHint } from "./agent-hint.ts";
import { isNonEmptyString, isRecord, readJsonBody } from "./request-utils.ts";
import { openAIErrorResponse } from "./response-utils.ts";

export async function parseOpenAIRequestBody(
  req: Request,
): Promise<Record<string, unknown> | Response> {
  const body = await readJsonBody(req);
  if (body === null) {
    return openAIErrorResponse(
      400,
      "Invalid JSON body",
      "invalid_request_error",
      "invalid_value",
    );
  }

  if (!isRecord(body)) {
    return openAIErrorResponse(
      400,
      "Request body is required",
      "invalid_request_error",
      "invalid_value",
    );
  }

  return body;
}

export function validateOpenAIModelField(
  body: Record<string, unknown>,
): Response | null {
  if (!isNonEmptyString(body.model)) {
    return openAIErrorResponse(
      400,
      "model is required",
      "invalid_request_error",
      "invalid_value",
    );
  }

  return null;
}

export async function resolveOpenAIModel(
  requestedModel: string,
  endpoint: ModelEndpoint,
  requestPath: string,
  options?: {
    requestBody?: Record<string, unknown>;
    agentHint?: AgentHint;
  },
): Promise<string | Response> {
  const resolutionOrResponse = await resolveOpenAIModelCandidates(
    requestedModel,
    endpoint,
    requestPath,
    options,
  );
  if (resolutionOrResponse instanceof Response) {
    return resolutionOrResponse;
  }
  return resolutionOrResponse.resolvedModel;
}

export async function resolveOpenAIModelCandidates(
  requestedModel: string,
  endpoint: ModelEndpoint,
  requestPath: string,
  options?: {
    requestBody?: Record<string, unknown>;
    agentHint?: AgentHint;
  },
): Promise<ModelResolution | Response> {
  const config = await loadConfig().catch(() => null);
  const effectiveConfig = config ?? DEFAULT_CONFIG;

  if (requestedModel === "auto") {
    const autoDecision = await resolveAutoModel({
      endpoint,
      requestBody: options?.requestBody ?? {},
      agentHint: options?.agentHint,
      autoRouting: effectiveConfig.autoRouting,
    });

    if (autoDecision.rejected) {
      return openAIErrorResponse(
        400,
        autoDecision.rejectReason ?? "Unable to resolve model:auto",
        "invalid_request_error",
        "invalid_value",
      );
    }

    if (effectiveConfig.autoRouting.logDecisions) {
      await log("debug", "Auto model resolved", {
        endpoint: requestPath,
        requestedModel: "auto",
        resolvedModel: autoDecision.resolvedModel,
        strategy: autoDecision.strategy,
        reasons: autoDecision.reasons,
        tier: autoDecision.tier,
      });
    }

    return {
      requestedModel: "auto",
      resolvedModel: autoDecision.resolvedModel,
      strategy: autoDecision.strategy,
      candidateModels: [autoDecision.resolvedModel],
    };
  }

  const modelResolution = await resolveModelForEndpoint(
    requestedModel,
    endpoint,
    effectiveConfig.modelMap,
    effectiveConfig.modelMappingPolicy,
  );

  if (modelResolution.rejected) {
    return openAIErrorResponse(
      400,
      modelResolution.rejectReason ??
        `Model "${requestedModel}" is not supported for ${requestPath} in strict mode`,
      "invalid_request_error",
      "invalid_value",
    );
  }

  if (modelResolution.resolvedModel !== requestedModel) {
    await log("debug", "Model resolved", {
      endpoint: requestPath,
      requestedModel,
      resolvedModel: modelResolution.resolvedModel,
      strategy: modelResolution.strategy,
    });
  }

  return modelResolution;
}

export function openAIServiceUnavailable(err: unknown): Response {
  return openAIErrorResponse(
    503,
    err instanceof Error ? err.message : "Service unavailable",
    "api_error",
    "service_unavailable",
  );
}
