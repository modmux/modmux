/**
 * Windows elevation handler for CLI commands.
 * Handles automatic re-execution of CLI with elevated privileges when needed.
 */

import {
  isElevated,
  reExecuteElevated,
  shouldRequestElevation,
} from "@modmux/gateway";

/**
 * Handle elevation for a CLI command if running on non-elevated Windows.
 * This should be called at the start of commands that require admin privileges.
 *
 * If elevation is needed:
 * 1. Re-executes the current command with elevated privileges
 * 2. Exits with the elevated process's exit code
 *
 * If already elevated or not on Windows:
 * 1. Returns normally (no action needed)
 *
 * @returns true if elevation was requested (caller should not continue), false if caller should proceed
 */
export async function handleElevation(): Promise<boolean> {
  if (!shouldRequestElevation()) {
    return false;
  }

  const elevated = await isElevated();
  if (elevated) {
    return false;
  }

  try {
    const exePath = Deno.execPath();
    const args = Deno.args;
    const exitCode = await reExecuteElevated(exePath, args);
    Deno.exit(exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("cancelled")) {
      console.error(
        "Error: Modmux requires administrator privileges to start the daemon.",
      );
      console.error("The UAC prompt was cancelled.");
      Deno.exit(1);
    } else {
      console.error(`Error: ${message}`);
      Deno.exit(1);
    }
  }
}
