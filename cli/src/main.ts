import { authenticate, getStoredToken, isTokenValid } from "./auth.ts";
import { VERSION } from "./version.ts";
import { runUpgradeHelper, upgrade } from "./upgrade.ts";
import { checkForNewerVersion, maybeNotifyUpdate } from "./update-check.ts";
import { ensureMiseRestartHook, removeMiseRestartHook } from "./mise-hook.ts";
import { isRunningFromMiseInstall } from "./mise-install.ts";
import { handleElevation } from "./windows-elevation-handler.ts";
import { formatStatus, getServiceState } from "../../gateway/src/status.ts";
import {
  getDaemonManager,
  getServiceManager,
} from "../../gateway/src/managers/mod.ts";
import { detectAll } from "../../gateway/src/detector.ts";
import { loadConfig, saveConfig } from "../../gateway/src/store.ts";
import type { ModmuxConfig } from "../../gateway/src/store.ts";
import {
  configureAgent,
  isAgentConfigured,
  unconfigureAgent,
  verifyAgentConfig,
} from "../../gateway/src/config.ts";
import {
  buildSettingsRows,
  buildTUIState,
  clearScreen,
  renderFull,
  showCursor,
} from "../../gateway/src/render.ts";
import { keypress, mapKey } from "../../gateway/src/input.ts";
import { fetchModelList } from "../../providers/src/models.ts";
import { getLogPath } from "../../gateway/src/log.ts";
import { startServer } from "@modmux/gateway";

export { authenticate, getStoredToken, isTokenValid } from "./auth.ts";
export type { AuthToken } from "../../gateway/src/token.ts";
export { VERSION };

const APP_NAME = "Modmux";
const CANONICAL_CLI_NAME = "modmux";

function showHelp() {
  console.log(`
${APP_NAME} - GitHub Copilot gateway

Usage: ${CANONICAL_CLI_NAME} [COMMAND] [OPTIONS]

Commands:
  (none)               Open the interactive TUI
  start                Start the background proxy service
  stop                 Stop the background proxy service
  restart              Restart the background proxy service
  status               Show service and auth status
  configure <agent>    Configure an agent to use ${APP_NAME}
  unconfigure <agent>  Revert agent configuration
  doctor               Scan and report all agent states
  models               List available Copilot model IDs
  model-policy [mode]  Show or set model mapping policy (compatible|strict)
  install-service      Register daemon with OS login service manager
  uninstall-service    Remove daemon from OS login service manager
  upgrade              Upgrade modmux to the latest release

Options:
  --help, -h           Show this help message
  --version, -v        Show version
`.trim());
}

function showVersion() {
  console.log(`${APP_NAME} v${VERSION}`);
}

export async function ensureAuthenticated(): Promise<boolean> {
  const stored = await getStoredToken();
  if (isTokenValid(stored)) {
    return true;
  }
  try {
    await authenticate();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: Authentication failed: ${message}`);
    return false;
  }
}

async function cmdStart(): Promise<void> {
  // Handle Windows privilege elevation if needed
  if (await handleElevation()) {
    return;
  }

  const authenticated = await ensureAuthenticated();
  if (!authenticated) Deno.exit(1);
  const svc = getServiceManager();
  const dm = getDaemonManager();
  const serviceInstalled = await svc.isInstalled();
  if (serviceInstalled) {
    await svc.start();
    const config = await loadConfig();
    console.log(`${APP_NAME} is running on http://localhost:${config.port}`);
  } else {
    const result = await dm.start();
    if (result.already) {
      console.log(
        `${APP_NAME} is already running on http://localhost:${result.port}`,
      );
    } else {
      console.log(`${APP_NAME} is running on http://localhost:${result.port}`);
    }
  }
}

async function cmdStop(): Promise<void> {
  const svc = getServiceManager();
  const dm = getDaemonManager();
  const serviceInstalled = await svc.isInstalled();
  if (serviceInstalled) {
    await svc.stop();
    console.log(`${APP_NAME} stopped.`);
  } else {
    const stopped = await dm.stop();
    if (stopped) {
      console.log(`${APP_NAME} stopped.`);
    } else {
      console.log(`${APP_NAME} is not running.`);
    }
  }
}

async function cmdRestart(): Promise<void> {
  const stopped = await getDaemonManager().stop();
  if (stopped) console.log(`${APP_NAME} stopped.`);
  const authenticated = await ensureAuthenticated();
  if (!authenticated) Deno.exit(1);
  const result = await getDaemonManager().start();
  console.log(`${APP_NAME} is running on http://localhost:${result.port}`);
}

async function cmdStatus(): Promise<void> {
  const [state, config] = await Promise.all([
    getServiceState(),
    loadConfig().catch(() => null),
  ]);
  const agentNames = config?.agents.map((a) => a.agentName) ?? [];
  console.log(formatStatus(state, agentNames, VERSION));
  Deno.exit(state.running ? 0 : 1);
}

async function cmdConfigure(agentName: string | undefined): Promise<void> {
  if (!agentName) {
    console.error("Error: 'configure' requires an agent name.");
    console.error(`Usage: ${CANONICAL_CLI_NAME} configure <agent>`);
    Deno.exit(1);
  }

  let config = await loadConfig();

  const existingEntry = config.agents.find((a) => a.agentName === agentName);
  if (existingEntry) {
    const verified = await verifyAgentConfig(existingEntry);
    if (verified) {
      console.log(`${agentName} is already configured.`);
      Deno.exit(0);
    }
    // Config file is missing or broken — unconfigure and re-apply below
    await unconfigureAgent(agentName, config);
    config = await loadConfig();
  }

  let entry;
  try {
    entry = await configureAgent(agentName, config.port, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unknown agent")) {
      console.error(`Error: Unknown agent "${agentName}".`);
      console.error(
        "Valid agents: claude-code, cline, codex",
      );
    } else {
      console.error(`Error: ${message}`);
    }
    Deno.exit(1);
  }

  if (entry.validatedAt === null) {
    console.log(
      `${agentName} configured, but validation failed: proxy may not be running.`,
    );
    Deno.exit(2);
  }
  console.log(`${agentName} configured.`);
}

async function cmdUnconfigure(agentName: string | undefined): Promise<void> {
  if (!agentName) {
    console.error("Error: 'unconfigure' requires an agent name.");
    console.error(`Usage: ${CANONICAL_CLI_NAME} unconfigure <agent>`);
    Deno.exit(1);
  }

  const config = await loadConfig();

  if (!isAgentConfigured(agentName, config)) {
    console.log(`${agentName} is not configured.`);
    Deno.exit(0);
  }

  try {
    await unconfigureAgent(agentName, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  }

  console.log(`${agentName} unconfigured.`);
}

async function cmdDoctor(): Promise<void> {
  const divider = "──────────────────────────────────────────────";
  console.log(`${APP_NAME} Doctor`);
  console.log(divider);

  const config = await loadConfig();

  const verifications = await Promise.all(
    config.agents.map(async (a) => ({
      name: a.agentName,
      verified: await verifyAgentConfig(a),
    })),
  );
  const configuredAgents = new Set(
    verifications.filter((v) => v.verified).map((v) => v.name),
  );
  const misconfiguredAgents = new Set(
    verifications.filter((v) => !v.verified).map((v) => v.name),
  );

  const results = await detectAll();
  for (const { agent, state } of results) {
    const stateLabel = state.padEnd(12);
    let configStatus: string;
    if (configuredAgents.has(agent.name)) {
      configStatus = "configured ✓";
    } else if (misconfiguredAgents.has(agent.name)) {
      configStatus = "misconfigured !";
    } else {
      configStatus = "not configured";
    }
    console.log(`${agent.name.padEnd(16)}${stateLabel} ${configStatus}`);
  }

  console.log(divider);

  // Show last 5 error-level lines from the log file
  const logPath = getLogPath();
  let lastErrors = "(none)";
  try {
    const raw = await Deno.readTextFile(logPath);
    const errorLines = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        try {
          return JSON.parse(line).level === "error";
        } catch {
          return false;
        }
      })
      .slice(-5);
    if (errorLines.length > 0) lastErrors = errorLines.join("\n");
  } catch {
    // log file doesn't exist yet — that's fine
  }

  console.log(`Log: ${logPath}`);
  console.log(`Last 5 errors: ${lastErrors}`);
}

async function cmdInstallService(): Promise<void> {
  // Stop any running daemon before installing system service
  await getDaemonManager().stop();

  try {
    const result = await getServiceManager().install();
    if (result.installed) {
      console.log(`${APP_NAME} service installed.`);
      console.log(`  Config: ${result.configPath}`);
      console.log(`  Binary: ${result.binaryPath}`);
      const config = await loadConfig();
      console.log(`${APP_NAME} is running on http://localhost:${config.port}`);
    } else {
      console.log(`${APP_NAME} service is already installed.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  }
}

async function cmdUninstallService(): Promise<void> {
  try {
    const svc = getServiceManager();
    const installed = await svc.isInstalled();
    if (!installed) {
      console.log(`${APP_NAME} service is not installed.`);
      Deno.exit(0);
    }
    const result = await svc.uninstall();
    if (result.removed) {
      console.log(
        `${APP_NAME} service removed. The daemon will not start on next login.`,
      );
    } else {
      console.log(`${APP_NAME} service is not installed.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  }
}

async function cmdModels(): Promise<void> {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) Deno.exit(1);

  const models = await fetchModelList();
  if (models.length === 0) {
    console.error("Error: Could not fetch model list from GitHub Copilot.");
    Deno.exit(1);
  }

  console.log("Available models (via GitHub Copilot):\n");
  for (const id of models) {
    console.log(`  ${id}`);
  }
  console.log(
    `\nRun '${CANONICAL_CLI_NAME} configure <agent>' to route an agent through ${APP_NAME}.`,
  );
}

async function cmdModelPolicy(policyArg: string | undefined): Promise<void> {
  const config = await loadConfig();

  if (!policyArg) {
    console.log(`Model mapping policy: ${config.modelMappingPolicy}`);
    return;
  }

  if (policyArg !== "compatible" && policyArg !== "strict") {
    console.error(
      `Error: Invalid model policy "${policyArg}". Use "compatible" or "strict".`,
    );
    Deno.exit(1);
  }

  if (config.modelMappingPolicy === policyArg) {
    console.log(`Model mapping policy already set to: ${policyArg}`);
    return;
  }

  await saveConfig({ ...config, modelMappingPolicy: policyArg });
  console.log(`Model mapping policy set to: ${policyArg}`);
}

async function runTUI(updateVersion: string | null): Promise<void> {
  const [serviceState, config, detectionResults] = await Promise.all([
    getServiceState(),
    loadConfig(),
    detectAll(),
  ]);

  const verifications = await Promise.all(
    config.agents.map(async (a) => ({
      name: a.agentName,
      verified: await verifyAgentConfig(a),
    })),
  );
  const configuredNames = new Set(
    verifications.filter((v) => v.verified).map((v) => v.name),
  );
  const misconfiguredNames = new Set(
    verifications.filter((v) => !v.verified).map((v) => v.name),
  );

  let state = buildTUIState(
    serviceState,
    detectionResults,
    configuredNames,
    misconfiguredNames,
    VERSION,
    updateVersion,
    config,
  );

  let currentConfig = config;

  renderFull(state);

  for await (const event of keypress()) {
    const key = mapKey(event);

    if (key === "CtrlC") {
      showCursor();
      break;
    }

    // --- Settings mode ---
    if (state.mode === "settings") {
      if (key === "Escape") {
        state = { ...state, mode: "agents" };
        renderFull(state);
        continue;
      }

      if (key === "Up") {
        if (state.settingsCursorIndex > 0) {
          state = {
            ...state,
            settingsCursorIndex: state.settingsCursorIndex - 1,
          };
          renderFull(state);
        }
        continue;
      }

      if (key === "Down") {
        if (state.settingsCursorIndex < state.settings.length - 1) {
          state = {
            ...state,
            settingsCursorIndex: state.settingsCursorIndex + 1,
          };
          renderFull(state);
        }
        continue;
      }

      if (key === "Left" || key === "Right") {
        const row = state.settings[state.settingsCursorIndex];
        const currentIdx = row.options.indexOf(row.value);
        const len = row.options.length;
        const nextIdx = key === "Right"
          ? (currentIdx + 1) % len
          : (currentIdx - 1 + len) % len;
        const newValue = row.options[nextIdx];

        const updatedSettings = state.settings.map((s, i) =>
          i === state.settingsCursorIndex ? { ...s, value: newValue } : s
        );

        currentConfig = applySettingChange(row.id, newValue, currentConfig);
        await saveConfig(currentConfig).catch(() => {});

        state = { ...state, settings: updatedSettings };
        renderFull(state);
        continue;
      }

      continue;
    }

    // --- Agents mode ---
    if (key === "Escape") {
      showCursor();
      break;
    }

    if (key === "Settings") {
      state = {
        ...state,
        mode: "settings",
        settings: buildSettingsRows(currentConfig),
        settingsCursorIndex: 0,
      };
      renderFull(state);
      continue;
    }

    if (key === "Up") {
      if (state.cursorIndex > 0) {
        state = { ...state, cursorIndex: state.cursorIndex - 1 };
        renderFull(state);
      }
      continue;
    }

    if (key === "Down") {
      if (state.cursorIndex < state.agents.length - 1) {
        state = { ...state, cursorIndex: state.cursorIndex + 1 };
        renderFull(state);
      }
      continue;
    }

    if (key === "Space") {
      const row = state.agents[state.cursorIndex];
      if (row.state !== "not-installed") {
        const agents = state.agents.map((a, i) =>
          i === state.cursorIndex ? { ...a, selected: !a.selected } : a
        );
        state = { ...state, agents };
        renderFull(state);
      }
      continue;
    }

    if (key === "Enter") {
      clearScreen();

      let applyError = false;
      const freshConfig = await loadConfig();
      for (const row of state.agents) {
        const existingEntry = freshConfig.agents.find(
          (a) => a.agentName === row.name,
        );
        const isMisconfigured = existingEntry
          ? !(await verifyAgentConfig(existingEntry))
          : false;
        const wasConfigured = existingEntry !== undefined && !isMisconfigured;
        const wantsConfigured = row.selected;

        if (wantsConfigured && (!wasConfigured || isMisconfigured)) {
          try {
            let updated = await loadConfig();
            if (isMisconfigured) {
              await unconfigureAgent(row.name, updated);
              updated = await loadConfig();
            }
            await configureAgent(row.name, updated.port, updated);
            console.log(`${row.name} configured.`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Error configuring ${row.name}: ${msg}`);
            applyError = true;
          }
        } else if (!wantsConfigured && existingEntry !== undefined) {
          try {
            const updated = await loadConfig();
            await unconfigureAgent(row.name, updated);
            console.log(`${row.name} unconfigured.`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Error unconfiguring ${row.name}: ${msg}`);
            applyError = true;
          }
        }
      }

      showCursor();
      Deno.exit(applyError ? 1 : 0);
      return;
    }
  }
}

/**
 * Apply a single setting change to a config object and return the updated config.
 */
function applySettingChange(
  id: string,
  value: string,
  config: ModmuxConfig,
): ModmuxConfig {
  switch (id) {
    case "checkEnabled":
      return {
        ...config,
        updates: { ...config.updates, checkEnabled: value === "enabled" },
      };
    case "modelMappingPolicy":
      return {
        ...config,
        modelMappingPolicy: value as "compatible" | "strict",
      };
    case "logLevel":
      return {
        ...config,
        logLevel: value as "debug" | "info" | "warn" | "error",
      };
    default:
      return config;
  }
}

async function main() {
  const args = Deno.args;

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    Deno.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    showVersion();
    Deno.exit(0);
  }

  if (args[0] === "--upgrade-helper") {
    const targetPath = args[1];
    const downloadUrl = args[2];
    const latestTag = args[3];
    if (!targetPath || !downloadUrl || !latestTag) {
      console.error("Error: Missing upgrade helper arguments.");
      Deno.exit(1);
    }
    await runUpgradeHelper(targetPath, downloadUrl, latestTag);
    return;
  }

  // --daemon flag: run as background service
  if (args.includes("--daemon")) {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) Deno.exit(1);
    await startServer();
    return;
  }

  const subcommand = args[0];

  // Keep the mise restart hook only for mise-managed installs and remove the
  // old hook when the running binary is not inside mise's installs tree.
  try {
    if (isRunningFromMiseInstall()) {
      ensureMiseRestartHook();
    } else {
      removeMiseRestartHook();
    }
  } catch {
    // Non-fatal.
  }

  // For the TUI, get the update version to display inline.
  // For all other commands (except upgrade), print the notice to stderr.
  const isTUI = subcommand === undefined && Deno.stdout.isTerminal();
  if (subcommand !== "upgrade") {
    if (!isTUI) {
      await maybeNotifyUpdate();
    }
  }

  switch (subcommand) {
    case "start":
      await cmdStart();
      break;
    case "stop":
      await cmdStop();
      break;
    case "restart":
      await cmdRestart();
      break;
    case "status":
      await cmdStatus();
      break;
    case "configure":
      await cmdConfigure(args[1]);
      break;
    case "unconfigure":
      await cmdUnconfigure(args[1]);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "models":
      await cmdModels();
      break;
    case "model-policy":
      await cmdModelPolicy(args[1]);
      break;
    case "install-service":
      await cmdInstallService();
      break;
    case "uninstall-service":
      await cmdUninstallService();
      break;
    case "upgrade":
      await upgrade();
      break;
    default:
      // T038: non-TTY bare invocation → print status and exit 0
      if (!Deno.stdout.isTerminal()) {
        const [state, config] = await Promise.all([
          getServiceState(),
          loadConfig().catch(() => null),
        ]);
        const agentNames = config?.agents.map((a) => a.agentName) ?? [];
        console.log(formatStatus(state, agentNames, VERSION));
        Deno.exit(0);
        return;
      }
      // T037: TTY bare invocation → open TUI
      await runTUI(await checkForNewerVersion());
  }
}

if (import.meta.main) {
  await main();
}
