import { getToken } from "./token.ts";
import {
  COPILOT_API_VERSION,
  COPILOT_PLUGIN_VERSION,
  DEFAULT_COPILOT_MODEL,
  VSCODE_VERSION,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CopilotModel {
  id: string;
  name: string;
  vendor: string;
}

interface CopilotModelsResponse {
  data: CopilotModel[];
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedModelIds: Set<string> | null = null;

function uniq(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
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
const FALLBACK_PREFERENCE: string[] = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-sonnet-4",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-haiku-4-5",
];

export async function resolveModelCandidates(
  anthropicModel: string,
  opts?: { token?: string },
): Promise<string[]> {
  const available = await getAvailableModelIds({ token: opts?.token });
  const candidates: string[] = [];

  if (available.has(anthropicModel)) {
    candidates.push(anthropicModel);
  }

  for (const id of available) {
    if (anthropicModel.startsWith(id)) {
      candidates.push(id);
    }
  }

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
    if (available.has(candidate)) {
      candidates.push(candidate);
    }
  }

  for (const preferred of FALLBACK_PREFERENCE) {
    if (available.has(preferred)) {
      candidates.push(preferred);
    }
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
