import { startServer } from "../server/router.ts";
import { authenticate, getStoredToken, isTokenValid } from "./auth.ts";

function showHelp() {
  console.log(`
Claudio - GitHub Copilot Bridge

Usage: claudio [OPTIONS]

Options:
  --help       Show this help message
  --version    Show version
  --server     Start the proxy server (default)
`.trim());
}

function showVersion() {
  console.log("Claudio v0.1.0");
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

  startServer();
}

if (import.meta.main) {
  await main();
}
