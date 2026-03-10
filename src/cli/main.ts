import { authenticate, getStoredToken, isTokenValid } from "./auth.ts";
import { VERSION } from "../version.ts";
import { startDaemon, stopDaemon } from "../service/daemon.ts";
import { formatStatus, getServiceState } from "../service/status.ts";

function showHelp() {
  console.log(`
Coco — Local AI Gateway

Usage: coco [COMMAND] [OPTIONS]

Commands:
  (none)              Open the interactive TUI
  start               Start the background proxy service
  stop                Stop the background proxy service
  restart             Restart the background proxy service
  status              Show service and auth status
  configure <agent>   Configure an agent to use Coco
  unconfigure <agent> Revert agent configuration
  doctor              Scan and report all agent states
  models              List available Copilot model IDs

Options:
  --help, -h          Show this help message
  --version, -v       Show version
  --daemon            (internal) Run as background daemon
`.trim());
}

function showVersion() {
  console.log(`Coco v${VERSION}`);
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
  const authenticated = await ensureAuthenticated();
  if (!authenticated) Deno.exit(1);
  const result = await startDaemon();
  if (result.already) {
    console.log(`Coco is already running on http://localhost:${result.port}`);
  } else {
    console.log(`Coco is running on http://localhost:${result.port}`);
  }
}

async function cmdStop(): Promise<void> {
  const stopped = await stopDaemon();
  if (stopped) {
    console.log("Coco stopped.");
  } else {
    console.log("Coco is not running.");
  }
}

async function cmdRestart(): Promise<void> {
  const stopped = await stopDaemon();
  if (stopped) console.log("Coco stopped.");
  const authenticated = await ensureAuthenticated();
  if (!authenticated) Deno.exit(1);
  const result = await startDaemon();
  console.log(`Coco is running on http://localhost:${result.port}`);
}

async function cmdStatus(): Promise<void> {
  const state = await getServiceState();
  console.log(formatStatus(state));
  Deno.exit(state.running ? 0 : 1);
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

  // --daemon flag: run as background service
  if (args.includes("--daemon")) {
    const { startServer } = await import("../server/router.ts");
    const authenticated = await ensureAuthenticated();
    if (!authenticated) Deno.exit(1);
    await startServer();
    return;
  }

  const subcommand = args[0];

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
    case "unconfigure":
    case "doctor":
    case "models":
      console.error(`Error: '${subcommand}' not yet implemented.`);
      Deno.exit(1);
      break;
    default:
      // Bare invocation: TUI or status fallback
      if (!Deno.stdout.isTerminal()) {
        const state = await getServiceState();
        console.log(formatStatus(state));
        Deno.exit(0); // bare invocation always exits 0 (use `coco status` for exit-code-based check)
        return;
      }
      // TUI (implemented in T037/T038)
      console.log("Coco — Local AI Gateway");
      console.log("Run `coco start` to start the proxy service.");
      Deno.exit(0);
  }
}

if (import.meta.main) {
  await main();
}

