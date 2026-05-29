import { getToken } from "./token.ts";
import {
  COPILOT_API_VERSION,
  COPILOT_PLUGIN_VERSION,
  DEFAULT_COPILOT_MODEL,
  VSCODE_VERSION,
} from "./types.ts";
import { modelFamily } from "./model-family.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopilotModel {
  id: string;
  name: string;
  vendor: string;
  supported_endpoints?: string[];
  model_picker_category?: string;
}

interface CopilotModelsResponse {
  data: CopilotModel[];
}

/**
 * Per-endpoint model capability sets derived from Copilot's /models API.
 * - `chat`: models that support /chat/completions (absent supported_endpoints → chat-only by default)
 * - `responses`: models that support /responses
 * - `all`: full model list with metadata (for capability-based sorting)
 */
export interface ModelEndpointSets {
  chat: Set<string>;
  responses: Set<string>;
  all: CopilotModel[];
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedModelIds: Set<string> | null = null;

function uniq(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function modelIdVariants(modelId: string): string[] {
  if (modelFamily(modelId) !== "claude") return [modelId];

  const dotted = modelId.replace(
    /^(claude-(?:opus|sonnet|haiku)-\d)-(\d)(?=-|$)/,
    "$1.$2",
  );
  const dashed = modelId.replace(
    /^(claude-(?:opus|sonnet|haiku)-\d)\.(\d)(?=-|$)/,
    "$1-$2",
  );

  return uniq([modelId, dotted, dashed]);
}

function resolveAvailableModelId(
  requestedModel: string,
  available: Set<string>,
): string | null {
  for (const candidate of modelIdVariants(requestedModel)) {
    if (available.has(candidate)) return candidate;
  }
  return null;
}

function prefixMatchedModelIds(
  requestedModel: string,
  available: Set<string>,
): string[] {
  const matches: string[] = [];
  for (const requestedVariant of modelIdVariants(requestedModel)) {
    for (const availableModel of available) {
      if (requestedVariant.startsWith(availableModel)) {
        matches.push(availableModel);
      }
    }
  }
  return uniq(matches);
}

function sortModelIdsDescending(modelIds: string[]): string[] {
  return [...modelIds].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" })
  );
}

function resolveClaudeTierAliasCandidates(
  requestedModel: string,
  available: Set<string>,
): string[] {
  const normalized = requestedModel.toLowerCase();
  const requestedTier = normalized === "opus" || normalized === "claude-opus"
    ? "opus"
    : normalized === "sonnet" || normalized === "claude-sonnet"
    ? "sonnet"
    : normalized === "haiku" || normalized === "claude-haiku"
    ? "haiku"
    : null;

  if (requestedTier === null) return [];

  const availableClaudeIds = Array.from(available).filter((id) =>
    id.startsWith("claude-")
  );
  const sameTier = sortModelIdsDescending(
    availableClaudeIds.filter((id) => id.includes(`-${requestedTier}-`)),
  );
  const sonnetFallback = sortModelIdsDescending(
    availableClaudeIds.filter((id) => id.includes("-sonnet-")),
  );

  if (sameTier.length > 0) {
    return requestedTier === "opus"
      ? uniq([...sameTier, ...sonnetFallback])
      : sameTier;
  }
  if (requestedTier === "opus") {
    return sonnetFallback;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchModelIds(opts?: {
  token?: string;
}): Promise<Set<string>> {
  const { token } = opts?.token ? { token: opts.token } : await getToken();
  const response = await fetch("https://api.githubcopilot.com/models", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "editor-version": `vscode/${VSCODE_VERSION}`,
      "editor-plugin-version": `copilot-chat/${COPILOT_PLUGIN_VERSION}`,
      "user-agent": `GitHubCopilotChat/${COPILOT_PLUGIN_VERSION}`,
      "x-github-api-version": COPILOT_API_VERSION,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    return new Set();
  }

  const body = await response.json() as CopilotModelsResponse;
  return new Set(body.data.map((m) => m.id));
}

/**
 * Fetch the full ordered list of Copilot model IDs.
 * Reads from the Copilot /models API — does not use the ID-only cache.
 *
 * @param opts.token - Optional token string. When provided, uses this token directly
 *                    instead of calling getToken(). Useful for tests that mock fetch.
 */
export async function fetchModelList(opts?: {
  token?: string;
}): Promise<string[]> {
  const { token } = opts?.token ? { token: opts.token } : await getToken();
  const response = await fetch("https://api.githubcopilot.com/models", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "editor-version": `vscode/${VSCODE_VERSION}`,
      "editor-plugin-version": `copilot-chat/${COPILOT_PLUGIN_VERSION}`,
      "user-agent": `GitHubCopilotChat/${COPILOT_PLUGIN_VERSION}`,
      "x-github-api-version": COPILOT_API_VERSION,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    return [];
  }

  const body = await response.json() as CopilotModelsResponse;
  return body.data.map((m) => m.id);
}

/**
 * Fetch per-endpoint capability sets from the Copilot /models API.
 *
 * Models with no `supported_endpoints` field are treated as chat-only (historical default).
 * Models with `supported_endpoints` containing "/responses" are responses-capable.
 *
 * @param opts.token - Optional token. When provided, uses it directly (useful for tests).
 */
export async function fetchModelEndpointSets(opts?: {
  token?: string;
}): Promise<ModelEndpointSets> {
  const { token } = opts?.token ? { token: opts.token } : await getToken();
  const response = await fetch("https://api.githubcopilot.com/models", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "editor-version": `vscode/${VSCODE_VERSION}`,
      "editor-plugin-version": `copilot-chat/${COPILOT_PLUGIN_VERSION}`,
      "user-agent": `GitHubCopilotChat/${COPILOT_PLUGIN_VERSION}`,
      "x-github-api-version": COPILOT_API_VERSION,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    return { chat: new Set(), responses: new Set(), all: [] };
  }

  const body = await response.json() as CopilotModelsResponse;
  const chat = new Set<string>();
  const responses = new Set<string>();

  for (const model of body.data) {
    const ep = model.supported_endpoints;
    if (!ep || ep.includes("/chat/completions")) {
      chat.add(model.id);
    }
    if (ep?.includes("/responses")) {
      responses.add(model.id);
    }
  }

  return { chat, responses, all: body.data };
}

/** Returns the cached set of Copilot model IDs, fetching once if needed.
 *  When a token is provided, bypasses the cache and fetches directly.
 */
async function getAvailableModelIds(opts?: {
  token?: string;
}): Promise<Set<string>> {
  if (opts?.token) {
    return await fetchModelIds({ token: opts.token });
  }
  if (cachedModelIds !== null) return cachedModelIds;
  cachedModelIds = await fetchModelIds();
  return cachedModelIds;
}

// ---------------------------------------------------------------------------
// Prefix-based static fallback map
// ---------------------------------------------------------------------------

/**
 * Ordered list of Copilot model IDs to try as fallbacks, from most to least capable.
 * Used when the requested model isn't in Copilot's catalog.
 */
const CLAUDE_FALLBACK_PREFERENCE: string[] = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-sonnet-4",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-haiku-4-5",
];

const OPENAI_FALLBACK_PREFERENCE: string[] = [
  "gpt-41-copilot",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4o-mini",
];

export async function resolveModelCandidates(
  anthropicModel: string,
  opts?: { token?: string },
): Promise<string[]> {
  const available = await getAvailableModelIds({ token: opts?.token });
  const candidates: string[] = [];
  const family = modelFamily(anthropicModel);

  const exactMatch = resolveAvailableModelId(anthropicModel, available);
  if (exactMatch) {
    candidates.push(exactMatch);
  }

  candidates.push(...prefixMatchedModelIds(anthropicModel, available));
  candidates.push(
    ...resolveClaudeTierAliasCandidates(anthropicModel, available),
  );

  const familyMap: Array<[RegExp, string]> = [
    [/^claude-(opus|sonnet|haiku)-4-6/, "claude-$1-4-6"],
    [/^claude-(opus|sonnet|haiku)-4-5/, "claude-$1-4-5"],
    [/^claude-(opus|sonnet)-4(-0)?$/, "claude-$1-4"],
    [/^claude-3-7-sonnet/, "claude-sonnet-4-5"],
    [/^claude-3-5-haiku/, "claude-haiku-4-5"],
    [/^claude-3-5-sonnet/, "claude-sonnet-4-5"],
    [/^claude-3-opus/, "claude-opus-4-5"],
    [/^claude-3-(sonnet|haiku)/, "claude-sonnet-4-5"],
  ];

  for (const [pattern, template] of familyMap) {
    const match = anthropicModel.match(pattern);
    if (!match) continue;

    const candidate = anthropicModel.replace(pattern, template);
    const availableCandidate = resolveAvailableModelId(candidate, available);
    if (availableCandidate) {
      candidates.push(availableCandidate);
    }
  }

  const fallbackPreference = family === "openai"
    ? OPENAI_FALLBACK_PREFERENCE
    : family === "claude"
    ? CLAUDE_FALLBACK_PREFERENCE
    : [];

  for (const preferred of fallbackPreference) {
    const availableCandidate = resolveAvailableModelId(preferred, available);
    if (availableCandidate) {
      candidates.push(availableCandidate);
    }
  }

  if (candidates.length === 0) {
    const defaultCandidate = resolveAvailableModelId(
      DEFAULT_COPILOT_MODEL,
      available,
    );
    if (defaultCandidate) {
      candidates.push(defaultCandidate);
    }
  }

  if (candidates.length === 0 && available.size > 0) {
    const familyMatch = Array.from(available).find((id) =>
      modelFamily(id) === family
    );
    candidates.push(familyMatch ?? Array.from(available)[0]);
  }

  if (candidates.length === 0) {
    candidates.push(DEFAULT_COPILOT_MODEL);
  }

  return uniq(candidates);
}

/**
 * Maps an Anthropic model ID to a supported Copilot model ID.
 *
 * Resolution order:
 * 1. Exact match in Copilot's /models list
 * 2. Prefix match (e.g., "claude-sonnet-4-5-20250929" → "claude-sonnet-4-5")
 * 3. Family match (e.g., "claude-3-5-sonnet-*" → "claude-sonnet-*")
 * 4. DEFAULT_COPILOT_MODEL
 *
 * @param anthropicModel - The Anthropic model ID to resolve
 * @param opts.token - Optional token. When provided, fetches model list directly
 *                    instead of using cache. Useful for tests.
 */
export async function resolveModel(
  anthropicModel: string,
  opts?: { token?: string },
): Promise<string> {
  const [candidate] = await resolveModelCandidates(anthropicModel, opts);
  return candidate;
}
