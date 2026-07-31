import type {
  CopilotModel,
  ModelEndpointSets,
} from "../../providers/src/models.ts";
import { fetchModelEndpointSets } from "../../providers/src/models.ts";
import type { AutoRoutingConfig } from "./store.ts";

export type ModelCatalogSource = "live" | "stale" | "empty";

export interface ModelCatalogSnapshot {
  sets: ModelEndpointSets;
  modelIds: string[];
  source: ModelCatalogSource;
  fetchedAt: number;
  stale: boolean;
}

interface CachedCatalog {
  sets: ModelEndpointSets;
  fetchedAt: number;
}

const DEFAULT_CATALOG_TTL_MS = 60_000;

let cachedLiveCatalog: CachedCatalog | null = null;

function emptySets(): ModelEndpointSets {
  return { chat: new Set(), responses: new Set(), all: [] };
}

function toModelIds(all: CopilotModel[]): string[] {
  return all.map((model) => model.id);
}

export function clearModelCatalogCache(): void {
  cachedLiveCatalog = null;
}

export async function getModelCatalog(
  autoRouting?: AutoRoutingConfig,
): Promise<ModelCatalogSnapshot> {
  const now = Date.now();
  const ttl = autoRouting?.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS;
  if (cachedLiveCatalog && now - cachedLiveCatalog.fetchedAt <= ttl) {
    return {
      sets: cachedLiveCatalog.sets,
      modelIds: toModelIds(cachedLiveCatalog.sets.all),
      source: "live",
      fetchedAt: cachedLiveCatalog.fetchedAt,
      stale: false,
    };
  }

  try {
    const sets = await fetchModelEndpointSets();
    cachedLiveCatalog = { sets, fetchedAt: now };
    return {
      sets,
      modelIds: toModelIds(sets.all),
      source: "live",
      fetchedAt: now,
      stale: false,
    };
  } catch {
    if ((autoRouting?.allowStaleCatalog ?? true) && cachedLiveCatalog) {
      return {
        sets: cachedLiveCatalog.sets,
        modelIds: toModelIds(cachedLiveCatalog.sets.all),
        source: "stale",
        fetchedAt: cachedLiveCatalog.fetchedAt,
        stale: true,
      };
    }
    return {
      sets: emptySets(),
      modelIds: [],
      source: "empty",
      fetchedAt: now,
      stale: true,
    };
  }
}
