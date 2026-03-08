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

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchModelIds(): Promise<Set<string>> {
  const { token } = await getToken();
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

/** Returns the cached set of Copilot model IDs, fetching once if needed. */
async function getAvailableModelIds(): Promise<Set<string>> {
  if (cachedModelIds !== null) return cachedModelIds;
  cachedModelIds = await fetchModelIds();
  return cachedModelIds;
}

/** Clears the model ID cache (used in tests). */
export function _clearModelCacheForTest(): void {
  cachedModelIds = null;
}

/** Pre-seeds the model ID cache (used in tests to avoid HTTP calls). */
export function _setModelCacheForTest(ids: string[]): void {
  cachedModelIds = new Set(ids);
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

/**
 * Maps an Anthropic model ID to a supported Copilot model ID.
 *
 * Resolution order:
 * 1. Exact match in Copilot's /models list
 * 2. Prefix match (e.g., "claude-sonnet-4-5-20250929" → "claude-sonnet-4-5")
 * 3. Family match (e.g., "claude-3-5-sonnet-*" → "claude-sonnet-*")
 * 4. DEFAULT_COPILOT_MODEL
 */
export async function resolveModel(anthropicModel: string): Promise<string> {
  const available = await getAvailableModelIds();

  // 1. Exact match
  if (available.has(anthropicModel)) return anthropicModel;

  // 2. Prefix match — Copilot ID is a prefix of the Anthropic ID
  //    e.g., "claude-sonnet-4-5-20250929" matches prefix "claude-sonnet-4-5"
  for (const id of available) {
    if (anthropicModel.startsWith(id)) return id;
  }

  // 3. Semantic family mapping for older Anthropic IDs
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
    if (match) {
      const candidate = anthropicModel.replace(pattern, template);
      if (available.has(candidate)) return candidate;
    }
  }

  // 4. Pick the first available preference from the fallback list
  for (const preferred of FALLBACK_PREFERENCE) {
    if (available.has(preferred)) return preferred;
  }

  // 5. Absolute fallback (Copilot /models was unreachable at startup)
  return DEFAULT_COPILOT_MODEL;
}
