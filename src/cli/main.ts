import { startServer } from "../server/router.ts";
import { authenticate, getStoredToken, isTokenValid } from "./auth.ts";
import { VERSION } from "../version.ts";
import {
  findClaudeBinary,
  launchClaudeCode,
  printInstallInstructions,
} from "./launch.ts";
import { getLatestSessionId } from "./session.ts";

// Flags consumed by Claudio itself; everything else is forwarded verbatim to claude.
const CLAUDIO_FLAGS = new Set(["--help", "-h", "--version", "-v", "--server"]);

function showHelp() {
  console.log(`
Claudio - GitHub Copilot Bridge

Usage: claudio [OPTIONS] [CLAUDE_ARGS...]

Options:
  --help       Show this help message
  --version    Show version
  --server     Start the proxy server (default)

Any options not listed above are forwarded verbatim to claude.
For example: claudio --dark-mode passes --dark-mode to claude.
`.trim());
}

function showVersion() {
  console.log(`Claudio v${VERSION}`);
}

async function ensureAuthenticated(): Promise<boolean> {
  const stored = await getStoredToken();
  if (isTokenValid(stored)) {
    return true;
  }

  // No valid stored token — run the OAuth device flow
  try {
    await authenticate();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Authentication failed: ${message}`);
    return false;
  }
}

async function main() {
  const args = Deno.args;
  const flags = {
    help: args.includes("--help") || args.includes("-h"),
    version: args.includes("--version") || args.includes("-v"),
  };

  if (flags.help) {
    showHelp();
    Deno.exit(0);
  }

  if (flags.version) {
    showVersion();
    Deno.exit(0);
  }

  const authenticated = await ensureAuthenticated();
  if (!authenticated) {
    Deno.exit(1);
  }

  const { port, stop } = startServer();

  const forwardedArgs = args.filter((a) => !CLAUDIO_FLAGS.has(a));
  const binary = await findClaudeBinary();

  if (!binary) {
    printInstallInstructions();
    await stop();
    Deno.exit(1);
  }

  if (Deno.stdout.isTerminal()) {
    console.clear();
  }

  let exitCode = 1;
  try {
    exitCode = await launchClaudeCode(binary, port, forwardedArgs);
  } finally {
    await stop();
  }

  if (exitCode === 0) {
    const sessionId = await getLatestSessionId();
    if (sessionId) {
      console.log(`\nRun \`claudio --resume ${sessionId}\` to resume.`);
    } else {
      console.log("\nRun `claudio` to resume.");
    }
  }

  Deno.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
