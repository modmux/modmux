import { getModelCatalog } from "./model-catalog.ts";
import { jsonResponse } from "./response-utils.ts";
import type { OpenAIModel, OpenAIModelList } from "./types.ts";
import { DEFAULT_CONFIG, loadConfig } from "./store.ts";

export async function handleModels(): Promise<Response> {
  const created = Math.floor(Date.now() / 1000);
  const config = await loadConfig().catch(() => DEFAULT_CONFIG);
  const catalog = await getModelCatalog(config.autoRouting);
  const advertisedModelIds = [...new Set(catalog.modelIds)];
  if (!advertisedModelIds.includes("auto")) {
    advertisedModelIds.push("auto");
  }

  const models: OpenAIModel[] = advertisedModelIds
    .map((id) => ({
      id,
      object: "model" as const,
      created,
      owned_by: "github-copilot",
    }));

  const list: OpenAIModelList = { object: "list", data: models };
  return jsonResponse(list);
}
