export type AgentState = "installed" | "detected" | "not-installed";

export interface AgentRecord {
  /** Canonical kebab-case identifier used in CLI args (e.g. "claude-code"). */
  name: string;
  /** Human-readable label for TUI display. */
  displayName: string;
  /** Executable names to locate on PATH. */
  binaryNames: string[];
  /** VS Code extension marketplace IDs. */
  extensionIds: string[];
  /** Detection state — resolved at runtime by the detector, never persisted. */
  state: AgentState;
}

export const AGENT_REGISTRY: AgentRecord[] = [
  {
    name: "claude-code",
    displayName: "Claude Code",
    binaryNames: ["claude"],
    extensionIds: ["anthropic.claude-code"],
    state: "not-installed",
  },
  {
    name: "cline",
    displayName: "Cline",
    binaryNames: ["cline"],
    extensionIds: ["saoudrizwan.claude-dev"],
    state: "not-installed",
  },
  {
    name: "codex",
    displayName: "Codex",
    binaryNames: ["codex"],
    extensionIds: [],
    state: "not-installed",
  },
];

/** Look up an agent by its canonical name. */
export function getAgent(name: string): AgentRecord | undefined {
  return AGENT_REGISTRY.find((a) => a.name === name);
}
