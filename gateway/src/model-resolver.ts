import { DEFAULT_MODEL_MAP } from "./models.ts";
import {
  type CopilotModel,
  fetchModelEndpointSets,
  type ModelEndpointSets,
} from "../../providers/src/models.ts";

export type ModelEndpoint = "chat_completions" | "responses";
export type ModelMappingPolicy = "compatible" | "strict";

export interface ModelResolution {
  requestedModel: string;
  resolvedModel: string;
  strategy: string;
  candidateModels?: string[];
  rejected?: boolean;
  rejectReason?: string;
}

const CACHE_TTL_MS = 60_000;

let cachedSets: ModelEndpointSets | null = null;
let cacheExpiresAt = 0;

/**
 * Emergency static fallbacks used only when the /models API is unavailable.
 * Under normal operation, fallbacks are derived from the live endpoint sets.
 */
const CHAT_COMPAT_FALLBACKS: string[] = [
  "gpt-41-copilot",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4o-mini",
];

const RESPONSES_COMPAT_FALLBACKS: string[] = [
  "gpt-5.4",
  "gpt-5.2",
  "gpt-4.1",
  "gpt-4o",
];

function uniq(values: string[]): string[] {
  return values.filter((v, i, arr) => arr.indexOf(v) === i);
}

function categoryRank(category?: string): number {
  switch (category) {
    case "powerful":
      return 3;
    case "versatile":
      return 2;
    case "lightweight":
      return 1;
    default:
      return 0;
  }
}

function isCodexLike(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes("codex");
}

type ModelFamily = "claude" | "openai" | "unknown";

function modelFamily(model: string): ModelFamily {
  const lower = model.toLowerCase();
  if (lower.includes("claude")) return "claude";
  if (
    lower.includes("codex") || lower.startsWith("gpt") ||
    /^o[134]\b/.test(lower)
  ) {
    return "openai";
  }
  return "unknown";
}

function subfamilyRank(requestedModel: string, candidateModel: string): number {
  const requested = requestedModel.toLowerCase();
  const candidate = candidateModel.toLowerCase();

  if (requested.includes("sonnet")) return candidate.includes("sonnet") ? 2 : 0;
  if (requested.includes("opus")) return candidate.includes("opus") ? 2 : 0;
  if (requested.includes("haiku")) return candidate.includes("haiku") ? 2 : 0;
  if (requested.includes("codex")) return candidate.includes("codex") ? 2 : 0;
  if (requested.includes("gpt-4o")) return candidate.includes("gpt-4o") ? 2 : 0;
  if (
    requested.includes("gpt-4.1") || requested.includes("gpt-41")
  ) {
    return candidate.includes("gpt-4.1") || candidate.includes("gpt-41")
      ? 2
      : 0;
  }
  if (requested.includes("gpt-5")) return candidate.includes("gpt-5") ? 2 : 0;

  return 0;
}

async function getModelEndpointSets(): Promise<ModelEndpointSets> {
  if (cachedSets && Date.now() < cacheExpiresAt) return cachedSets;

  cachedSets = await fetchModelEndpointSets().catch(() => ({
    chat: new Set<string>(),
    responses: new Set<string>(),
    all: [] as CopilotModel[],
  }));
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedSets;
}

/**
 * Build an ordered fallback list from the endpoint-compatible live model set.
 *
 * Ordering:
 * 1. capability tier: powerful > versatile > lightweight > unspecified
 * 2. family preference: codex models first for codex-like requests, last otherwise
 * 3. stable tiebreaker: reverse lexicographic (higher version strings win)
 */
function buildFallbackOrder(
  requestedModel: string,
  endpointSet: Set<string>,
  sets: ModelEndpointSets,
): string[] {
  if (endpointSet.size === 0) return [];

  const family = modelFamily(requestedModel);
  if (family === "unknown") return [];

  const codex = isCodexLike(requestedModel);

  const sorted = sets.all
    .filter((m) => endpointSet.has(m.id) && modelFamily(m.id) === family)
    .sort((a, b) => {
      const rankDiff = categoryRank(b.model_picker_category) -
        categoryRank(a.model_picker_category);
      if (rankDiff !== 0) return rankDiff;
      const subfamilyDiff = subfamilyRank(requestedModel, b.id) -
        subfamilyRank(requestedModel, a.id);
      if (subfamilyDiff !== 0) return subfamilyDiff;
      const aCodex = isCodexLike(a.id);
      const bCodex = isCodexLike(b.id);
      if (aCodex !== bCodex) {
        return codex ? (aCodex ? -1 : 1) : (aCodex ? 1 : -1);
      }
      return b.id.localeCompare(a.id);
    });

  return uniq(sorted.map((m) => m.id));
}

function withFallbackCandidates(
  primaryCandidates: string[],
  requestedModel: string,
  endpointSet: Set<string>,
  sets: ModelEndpointSets,
): string[] {
  return uniq([
    ...primaryCandidates,
    ...buildFallbackOrder(requestedModel, endpointSet, sets),
  ]);
}

function staticFallbackCandidates(
  endpoint: ModelEndpoint,
  requestedModel: string,
  sets: ModelEndpointSets,
): string[] {
  const family = modelFamily(requestedModel);
  const staticList = endpoint === "responses"
    ? RESPONSES_COMPAT_FALLBACKS
    : CHAT_COMPAT_FALLBACKS;
  const allLive = new Set([...sets.chat, ...sets.responses]);

  return staticList.filter((candidate) => {
    if (modelFamily(candidate) !== family) return false;
    return allLive.has(candidate) || allLive.size === 0;
  });
}

export function clearModelResolverCache(): void {
  cachedSets = null;
  cacheExpiresAt = 0;
}

export async function resolveModelForEndpoint(
  requestedModel: string,
  endpoint: ModelEndpoint,
  userOverrides: Record<string, string> = {},
  policy: ModelMappingPolicy = "compatible",
): Promise<ModelResolution> {
  const sets = await getModelEndpointSets();
  const endpointSet = endpoint === "responses" ? sets.responses : sets.chat;

  if (policy === "strict") {
    if (endpointSet.has(requestedModel)) {
      return {
        requestedModel,
        resolvedModel: requestedModel,
        strategy: "exact",
        candidateModels: [requestedModel],
      };
    }
    return {
      requestedModel,
      resolvedModel: requestedModel,
      strategy: "strict-reject",
      rejected: true,
      rejectReason:
        `Model "${requestedModel}" is not endpoint-compatible without remapping`,
    };
  }

  // 1. User override: honor unconditionally — the user knows what they want.
  const userAlias = userOverrides[requestedModel];
  if (userAlias !== undefined) {
    return {
      requestedModel,
      resolvedModel: userAlias,
      strategy: "alias-or-normalized",
      candidateModels: [userAlias],
    };
  }

  // 2. Exact match in endpoint set.
  if (endpointSet.has(requestedModel)) {
    const candidateModels = withFallbackCandidates(
      [requestedModel],
      requestedModel,
      endpointSet,
      sets,
    );
    return {
      requestedModel,
      resolvedModel: candidateModels[0],
      strategy: "exact",
      candidateModels,
    };
  }

  // 3. Normalized form (dots → dashes) in endpoint set.
  const normalizedDashed = requestedModel.replaceAll(".", "-");
  if (
    normalizedDashed !== requestedModel && endpointSet.has(normalizedDashed)
  ) {
    const candidateModels = withFallbackCandidates(
      [normalizedDashed],
      requestedModel,
      endpointSet,
      sets,
    );
    return {
      requestedModel,
      resolvedModel: candidateModels[0],
      strategy: "alias-or-normalized",
      candidateModels,
    };
  }

  // 4. Built-in alias — only if the alias target is usable for this endpoint.
  //    Skipped when alias target is chat-only and we need responses (and vice versa).
  const builtInAlias = DEFAULT_MODEL_MAP[requestedModel];
  if (builtInAlias !== undefined && endpointSet.has(builtInAlias)) {
    const candidateModels = withFallbackCandidates(
      [builtInAlias],
      requestedModel,
      endpointSet,
      sets,
    );
    return {
      requestedModel,
      resolvedModel: candidateModels[0],
      strategy: "alias-or-normalized",
      candidateModels,
    };
  }

  // 5. Dynamic fallback from the live endpoint-compatible model set,
  //    ordered by capability tier and model family.
  const dynamicFallbacks = buildFallbackOrder(
    requestedModel,
    endpointSet,
    sets,
  );
  if (dynamicFallbacks.length > 0) {
    return {
      requestedModel,
      resolvedModel: dynamicFallbacks[0],
      strategy: "family-fallback",
      candidateModels: dynamicFallbacks,
    };
  }

  // 6. Emergency static fallback (API unavailable / empty endpoint set).
  const staticCandidates = staticFallbackCandidates(
    endpoint,
    requestedModel,
    sets,
  );
  if (staticCandidates.length > 0) {
    return {
      requestedModel,
      resolvedModel: staticCandidates[0],
      strategy: "family-fallback",
      candidateModels: staticCandidates,
    };
  }

  // 7. Passthrough — let Copilot accept or reject the model name directly.
  return {
    requestedModel,
    resolvedModel: requestedModel,
    strategy: "passthrough",
    candidateModels: [requestedModel],
  };
}
