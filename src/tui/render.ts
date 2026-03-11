/**
 * TUI renderer for Coco.
 *
 * Uses @cliffy/ansi for ANSI escape sequences and cursor control.
 * Performs a full redraw on every state change to avoid cursor arithmetic bugs.
 *
 * Layout:
 *
 *   Coco — Local AI Gateway
 *   ──────────────────────────────────────────────
 *   Status: Running on http://localhost:11434
 *   Copilot: Authenticated ✓
 *
 *   Agents
 *   ──────────────────────────────────────────────
 *   [x] Claude Code      detected
 *   [ ] Cline            installed
 *   ...
 *
 *   ──────────────────────────────────────────────
 *   Space: toggle   Enter: apply   q: quit
 */

import { colors } from "@cliffy/ansi/colors";
import { tty } from "@cliffy/ansi/tty";
import type { DetectionResult } from "../agents/detector.ts";
import type { ServiceState } from "../service/status.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIVIDER = "──────────────────────────────────────────────";

// Pre-generated with figlet "Slant" font
const LOGO = [
  "   ______               ",
  "  / ____/___  _________ ",
  " / /   / __ \\/ ___/ __ \\",
  "/ /___/ /_/ / /__/ /_/ /",
  "\\____/\\____/\\___/\\____/ ",
].join("\n");

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type AgentConfigStatus = "configured" | "misconfigured" | "unconfigured";

export interface AgentRow {
  name: string;
  displayName: string;
  state: "installed" | "detected" | "not-installed";
  configStatus: AgentConfigStatus;
  /** Whether this row is currently selected (toggled for apply). */
  selected: boolean;
}

export interface TUIState {
  serviceState: ServiceState;
  agents: AgentRow[];
  /** Index of the cursor row (0-based into agents array). */
  cursorIndex: number;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build a TUIState from service state, detection results, and config.
 */
export function buildTUIState(
  serviceState: ServiceState,
  detectionResults: DetectionResult[],
  configuredAgentNames: Set<string>,
  misconfiguredAgentNames: Set<string>,
): TUIState {
  const agents: AgentRow[] = detectionResults.map((r) => {
    let configStatus: AgentConfigStatus = "unconfigured";
    if (misconfiguredAgentNames.has(r.agent.name)) {
      configStatus = "misconfigured";
    } else if (configuredAgentNames.has(r.agent.name)) {
      configStatus = "configured";
    }
    return {
      name: r.agent.name,
      displayName: r.agent.displayName,
      state: r.state,
      configStatus,
      selected: configStatus === "configured",
    };
  });

  return {
    serviceState,
    agents,
    cursorIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

/**
 * Render a single agent row.
 * `isCursor` — true when this is the focused row.
 */
export function renderRow(row: AgentRow, isCursor: boolean): string {
  const checkmark = row.selected ? "✓" : " ";
  const prefix = row.configStatus === "misconfigured" ? "!" : checkmark;
  const bracket = `[${prefix}]`;
  const cursor = isCursor ? "❯" : " ";

  const nameCol = row.displayName.padEnd(16);
  const stateCol = row.state.padEnd(14);

  let suffix = "";
  if (row.configStatus === "misconfigured") suffix = " (misconfigured)";

  const line = `${cursor} ${bracket} ${nameCol} ${stateCol}${suffix}`;

  if (row.state === "not-installed") {
    return colors.dim(line);
  }
  if (row.configStatus === "misconfigured") {
    const styled = colors.yellow(line);
    return isCursor ? colors.bold(styled) : styled;
  }
  if (isCursor) {
    return colors.brightCyan.bold(line);
  }
  if (row.selected) {
    return colors.green(line);
  }
  return line;
}

// ---------------------------------------------------------------------------
// Full render
// ---------------------------------------------------------------------------

/**
 * Clear screen and render the entire TUI to stdout.
 */
export function renderFull(state: TUIState): void {
  const { serviceState } = state;

  const statusLine = serviceState.running
    ? `Status:  Running on http://localhost:${serviceState.port}`
    : "Status:  Not running";
  const authLine = serviceState.authStatus === "authenticated"
    ? "Copilot: Authenticated ✓"
    : "Copilot: Not authenticated";

  tty.cursorHide.eraseScreen.cursorTo(0, 0)();

  const lines: string[] = [
    colors.bold.cyan(LOGO),
    DIVIDER,
    statusLine,
    authLine,
    "",
    "Agents",
    DIVIDER,
    ...state.agents.map((row, i) => renderRow(row, i === state.cursorIndex)),
    "",
    DIVIDER,
    "Space: toggle   Enter: apply   Esc: quit",
  ];

  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Clear screen helper (used before showing apply output)
// ---------------------------------------------------------------------------

export function clearScreen(): void {
  tty.eraseScreen.cursorTo(0, 0)();
}

export function showCursor(): void {
  tty.cursorShow();
}
