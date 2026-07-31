export type AgentHint = "claude-code" | "cline" | "codex" | undefined;

export function detectAgentHint(userAgent: string | null): AgentHint {
  if (!userAgent) return undefined;
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("claude-code") || normalized.includes("anthropic")) {
    return "claude-code";
  }
  if (normalized.includes("cline")) return "cline";
  if (normalized.includes("codex")) return "codex";
  return undefined;
}
