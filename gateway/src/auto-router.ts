import {
  type ModelFamily,
  modelFamily,
} from "../../providers/src/model-family.ts";
import { getModelCatalog } from "./model-catalog.ts";
import type { AgentHint } from "./agent-hint.ts";
import type { AutoRoutingConfig } from "./store.ts";

type AutoTier = "haiku" | "sonnet" | "opus";

export interface AutoModelDecision {
  requestedModel: "auto";
  resolvedModel: string;
  strategy: string;
  candidateModels: string[];
  reasons: string[];
  tier: AutoTier;
  rejected?: boolean;
  rejectReason?: string;
}

export interface ResolveAutoModelInput {
  endpoint: "chat_completions" | "responses" | "messages";
  requestBody: Record<string, unknown>;
  agentHint: AgentHint;
  autoRouting: AutoRoutingConfig;
}

interface SignalSummary {
  textChars: number;
  messageCount: number;
  toolCount: number;
  keywordScore: number;
}

function inferTextAndMessageCount(
  value: unknown,
): { chars: number; count: number } {
  if (typeof value === "string") {
    return { chars: value.length, count: value.trim().length > 0 ? 1 : 0 };
  }
  if (!Array.isArray(value)) return { chars: 0, count: 0 };

  let chars = 0;
  let count = 0;
  for (const item of value) {
    if (item && typeof item === "object") {
      count += 1;
      const content = (item as Record<string, unknown>).content;
      if (typeof content === "string") {
        chars += content.length;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === "object") {
            const text = (part as Record<string, unknown>).text;
            if (typeof text === "string") chars += text.length;
          }
        }
      }
    }
  }
  return { chars, count };
}

function collectSignals(
  endpoint: "chat_completions" | "responses" | "messages",
  requestBody: Record<string, unknown>,
): SignalSummary {
  const messagesInput = endpoint === "responses"
    ? requestBody.input
    : requestBody.messages;
  const { chars, count } = inferTextAndMessageCount(messagesInput);

  const tools = requestBody.tools;
  const toolCount = Array.isArray(tools) ? tools.length : 0;

  const promptText = JSON.stringify(messagesInput ?? "").toLowerCase();
  let keywordScore = 0;
  if (/refactor|design|migrate|architecture|plan/.test(promptText)) {
    keywordScore += 2;
  }
  if (/fix|debug|test/.test(promptText)) keywordScore += 1;

  return {
    textChars: chars,
    messageCount: count,
    toolCount,
    keywordScore,
  };
}

function classifyTier(
  endpoint: "chat_completions" | "responses" | "messages",
  signals: SignalSummary,
): AutoTier {
  let score = 0;
  if (signals.textChars > 4_000) score += 3;
  else if (signals.textChars > 1_500) score += 2;
  else if (signals.textChars > 500) score += 1;

  if (signals.messageCount > 6) score += 2;
  else if (signals.messageCount > 3) score += 1;

  if (signals.toolCount > 2) score += 2;
  else if (signals.toolCount > 0) score += 1;

  score += signals.keywordScore;
  if (endpoint === "responses") score += 1;

  if (score <= 1) return "haiku";
  if (score <= 4) return "sonnet";
  return "opus";
}

function preferredFamily(
  endpoint: "chat_completions" | "responses" | "messages",
  agentHint: AgentHint,
): ModelFamily {
  if (endpoint === "chat_completions" && agentHint === "claude-code") {
    return "claude";
  }
  return endpoint === "responses" ? "openai" : "claude";
}

function endpointEnabled(
  endpoint: "chat_completions" | "responses" | "messages",
  config: AutoRoutingConfig,
): boolean {
  if (endpoint === "responses") return config.endpoints.responses;
  if (endpoint === "chat_completions") return config.endpoints.chatCompletions;
  return config.endpoints.messages;
}

function endpointSet(
  endpoint: "chat_completions" | "responses" | "messages",
  sets: { chat: Set<string>; responses: Set<string> },
): Set<string> {
  return endpoint === "responses" ? sets.responses : sets.chat;
}

function modelTier(modelId: string, family: ModelFamily): AutoTier {
  const id = modelId.toLowerCase();
  if (family === "claude") {
    if (id.includes("haiku")) return "haiku";
    if (id.includes("opus")) return "opus";
    return "sonnet";
  }
  if (id.includes("mini")) return "haiku";
  if (
    id.includes("gpt-5") || id.startsWith("o1") || id.startsWith("o3") ||
    id.includes("gpt-4.1") || id.includes("gpt-41")
  ) {
    return "opus";
  }
  return "sonnet";
}

function tierOrder(
  chosen: AutoTier,
  mode: AutoRoutingConfig["fallbackMode"],
): AutoTier[] {
  if (mode === "strict_error") return [chosen];
  if (chosen === "haiku") return ["haiku", "sonnet", "opus"];
  if (chosen === "sonnet") return ["sonnet", "opus", "haiku"];
  return ["opus", "sonnet", "haiku"];
}

function rankTier(tier: AutoTier, order: AutoTier[]): number {
  const idx = order.indexOf(tier);
  return idx < 0 ? 999 : idx;
}

export async function resolveAutoModel(
  input: ResolveAutoModelInput,
): Promise<AutoModelDecision> {
  const reasons: string[] = ["decision:auto"];

  if (!input.autoRouting.enabled) {
    return {
      requestedModel: "auto",
      resolvedModel: "auto",
      strategy: "auto-disabled",
      candidateModels: [],
      reasons: [...reasons, "reject:auto_disabled"],
      tier: "sonnet",
      rejected: true,
      rejectReason:
        '"auto" model selection is not enabled. Set MODMUX_AUTO_ROUTING_ENABLED=true to activate.',
    };
  }

  if (!endpointEnabled(input.endpoint, input.autoRouting)) {
    return {
      requestedModel: "auto",
      resolvedModel: "auto",
      strategy: "auto-endpoint-disabled",
      candidateModels: [],
      reasons: [...reasons, "reject:endpoint_disabled"],
      tier: "sonnet",
      rejected: true,
      rejectReason:
        `"auto" model selection is disabled for endpoint ${input.endpoint}.`,
    };
  }

  const catalog = await getModelCatalog(input.autoRouting);
  reasons.push(`catalog:${catalog.source}`);

  const signals = collectSignals(input.endpoint, input.requestBody);
  const selectedTier = classifyTier(input.endpoint, signals);
  reasons.push(
    `tier:${selectedTier}`,
    `signals:chars=${signals.textChars},messages=${signals.messageCount},tools=${signals.toolCount},kw=${signals.keywordScore}`,
  );

  const family = preferredFamily(input.endpoint, input.agentHint);
  reasons.push(`family:${family}`);

  const order = tierOrder(selectedTier, input.autoRouting.fallbackMode);
  const available = endpointSet(input.endpoint, catalog.sets);
  const candidates = catalog.sets.all
    .filter((model) =>
      available.has(model.id) && modelFamily(model.id) === family
    )
    .sort((a, b) => {
      const tierDiff = rankTier(modelTier(a.id, family), order) -
        rankTier(modelTier(b.id, family), order);
      if (tierDiff !== 0) return tierDiff;
      return b.id.localeCompare(a.id);
    })
    .map((model) => model.id);

  if (candidates.length === 0) {
    return {
      requestedModel: "auto",
      resolvedModel: "auto",
      strategy: "auto-no-compatible-model",
      candidateModels: [],
      reasons: [...reasons, "reject:no_candidates"],
      tier: selectedTier,
      rejected: true,
      rejectReason:
        `No compatible live ${family} models available for endpoint ${input.endpoint}.`,
    };
  }

  return {
    requestedModel: "auto",
    resolvedModel: candidates[0],
    strategy: "auto-tier-routing",
    candidateModels: candidates,
    reasons,
    tier: selectedTier,
  };
}
