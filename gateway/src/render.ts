/**
 * TUI renderer for Modmux.
 *
 * Uses @cliffy/ansi for ANSI escape sequences and cursor control.
 * Performs a full redraw on every state change to avoid cursor arithmetic bugs.
 *
 * Layout:
 *
 *   Modmux - Local AI Gateway
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
import type { DetectionResult } from "./detector.ts";
import type { ServiceState } from "./status.ts";
import type { ModmuxConfig } from "./store.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIVIDER = "──────────────────────────────────────────────";

// Pre-generated with figlet "slant" font
const LOGO = [
  "                        __                    ",
  "   ____ ___  ____  ____/ /___ ___  __  ___  __",
  "  / __ `__ \\/ __ \\/ __  / __ `__ \\/ / / / |/_/",
  " / / / / / / /_/ / /_/ / / / / / / /_/ />  <  ",
  "/_/ /_/ /_/\\____/\\__,_/_/ /_/ /_/\\__,_/_/|_|  ",
].join("\n");

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type AgentConfigStatus = "configured" | "misconfigured" | "unconfigured";
export type TUIMode = "agents" | "settings";

export interface AgentRow {
  name: string;
  displayName: string;
  state: "installed" | "detected" | "not-installed";
  configStatus: AgentConfigStatus;
  /** Whether this row is currently selected (toggled for apply). */
  selected: boolean;
}

export interface SettingsRow {
  /** Unique key matching the config field (e.g. "checkEnabled"). */
  id: string;
  label: string;
  value: string;
  options: readonly string[];
}

export interface TUIState {
  mode: TUIMode;
  serviceState: ServiceState;
  agents: AgentRow[];
  /** Index of the cursor row (0-based into agents array). */
  cursorIndex: number;
  /** Currently running modmux version shown in the TUI header. */
  installedVersion: string;
  /** Newer version string if an update is available, null otherwise. */
  updateVersion: string | null;
  settings: SettingsRow[];
  settingsCursorIndex: number;
  /** Result of Copilot CLI detection: true = found, false = missing, null = not yet checked */
  copilotCliDetected: boolean | null;
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
  installedVersion: string,
  updateVersion: string | null = null,
  config: ModmuxConfig | null = null,
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

  const settings = buildSettingsRows(config);

  return {
    mode: "agents",
    serviceState,
    agents,
    cursorIndex: 0,
    installedVersion,
    updateVersion,
    settings,
    settingsCursorIndex: 0,
    copilotCliDetected: null,
  };
}

/**
 * Build settings rows from a config object, or use defaults if null.
 */
export function buildSettingsRows(
  config: ModmuxConfig | null,
): SettingsRow[] {
  const c = config ?? {
    updates: { checkEnabled: true },
    modelMappingPolicy: "compatible",
    logLevel: "info",
    copilotSdk: { backend: "external-cli" },
  };
  return [
    {
      id: "checkEnabled",
      label: "Version check",
      value: c.updates?.checkEnabled !== false ? "enabled" : "disabled",
      options: ["enabled", "disabled"],
    },
    {
      id: "copilot-sdk",
      label: "Copilot SDK",
      value: c.copilotSdk?.backend !== "disabled"
        ? "connected"
        : "disconnected",
      options: ["connected", "disconnected"],
    },
    {
      id: "modelMappingPolicy",
      label: "Model policy",
      value: c.modelMappingPolicy ?? "compatible",
      options: ["compatible", "strict"],
    },
    {
      id: "logLevel",
      label: "Log level",
      value: c.logLevel ?? "info",
      options: ["debug", "info", "warn", "error"],
    },
  ];
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
  if (state.mode === "settings") {
    renderSettings(state);
  } else {
    renderAgents(state);
  }
}

function renderAgents(state: TUIState): void {
  const { serviceState } = state;

  const statusLine = serviceState.running
    ? `Status:  Running on http://localhost:${serviceState.port}`
    : "Status:  Not running";
  const versionLine = `Version: v${state.installedVersion}`;
  const authLine = serviceState.authStatus === "authenticated"
    ? "Copilot: Authenticated ✓"
    : "Copilot: Not authenticated";

  tty.cursorHide.eraseScreen.cursorTo(0, 0)();

  const lines: string[] = [
    colors.bold.cyan(LOGO),
    DIVIDER,
    statusLine,
    versionLine,
    authLine,
    "",
    "Agents",
    DIVIDER,
    ...state.agents.map((row, i) => renderRow(row, i === state.cursorIndex)),
    "",
    DIVIDER,
  ];

  if (state.updateVersion !== null) {
    lines.push(
      colors.yellow(
        `⬆ Update available: v${state.updateVersion}  —  run 'modmux upgrade'`,
      ),
    );
    lines.push(DIVIDER);
  }

  lines.push(
    "Space: toggle   Enter: apply   s: settings   Esc: quit",
  );

  console.log(lines.join("\n"));
}

function renderSettings(state: TUIState): void {
  const { serviceState } = state;

  const statusLine = serviceState.running
    ? `Status:  Running on http://localhost:${serviceState.port}`
    : "Status:  Not running";
  const versionLine = `Version: v${state.installedVersion}`;
  const authLine = serviceState.authStatus === "authenticated"
    ? "Copilot: Authenticated ✓"
    : "Copilot: Not authenticated";

  tty.cursorHide.eraseScreen.cursorTo(0, 0)();

  const lines: string[] = [
    colors.bold.cyan(LOGO),
    DIVIDER,
    statusLine,
    versionLine,
    authLine,
    "",
    "Settings",
    DIVIDER,
  ];

  for (let i = 0; i < state.settings.length; i++) {
    const row = state.settings[i];
    const isCursor = i === state.settingsCursorIndex;
    const cursor = isCursor ? "❯" : " ";
    const label = row.label.padEnd(20);
    const valueStr = isCursor ? colors.brightCyan.bold(row.value) : row.value;
    const line = `${cursor} ${label} ${valueStr}`;
    lines.push(isCursor ? colors.bold(line) : line);

    // Extra logic: show warning/message if Copilot SDK is enabled but CLI is missing or being detected
    if (
      row.id === "copilot-sdk" && row.value === "connected"
    ) {
      if (state.copilotCliDetected === false) {
        lines.push(
          colors.bold.yellow(
            "⚠ Copilot CLI not found. Download from https://docs.github.com/copilot/cli, and ensure it is in your PATH. Copilot integration will not work until the CLI is available.",
          ),
        );
      } else if (state.copilotCliDetected === null) {
        lines.push(colors.dim("Detecting Copilot CLI binary..."));
      }
    }
  }

  lines.push("");
  lines.push(DIVIDER);

  if (state.updateVersion !== null) {
    lines.push(
      colors.yellow(
        `⬆ Update available: v${state.updateVersion}  —  run 'modmux upgrade'`,
      ),
    );
    lines.push(DIVIDER);
  }

  lines.push("←/→: change   Esc: back");

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
