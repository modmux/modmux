/**
 * Launch Claude Code as a subprocess with the Claudio proxy as its backend.
 */

/**
 * Find the absolute path of the `claude` binary, or return `null` if not found.
 *
 * Strategy:
 * 1. Try `which claude` (macOS/Linux) / `where claude` (Windows)
 * 2. Fall back to known npm global install paths
 */
export async function findClaudeBinary(): Promise<string | null> {
  const isWindows = Deno.build.os === "windows";
  const cmd = isWindows ? "where" : "which";

  try {
    const result = await new Deno.Command(cmd, {
      args: ["claude"],
    }).output();

    if (result.success) {
      const path = new TextDecoder()
        .decode(result.stdout)
        .trim()
        .split("\n")[0]
        .trim();
      if (path) return path;
    }
  } catch {
    // which/where binary not found or failed — fall through to fallbacks
  }

  // Fall back to known npm global install paths
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";

  const fallbackPaths = [
    `${home}/.npm-global/bin/claude`,
    `${home}/.local/share/npm/bin/claude`,
  ];

  for (const p of fallbackPaths) {
    try {
      await Deno.stat(p);
      return p;
    } catch {
      // path does not exist
    }
  }

  return null;
}

/**
 * Print calm, minimal installation instructions for Claude Code.
 */
export function printInstallInstructions(): void {
  console.log(
    `Claude Code is not installed. To install it, run:\n\n  npm install -g @anthropic-ai/claude-code\n\nOr download it from: https://claude.ai/download`,
  );
}

/**
 * Launch the Claude Code binary as a subprocess, wiring it to the Claudio proxy.
 *
 * - stdio is fully inherited (interactive terminal use)
 * - ANTHROPIC_BASE_URL is set to point at the local proxy
 * - ANTHROPIC_API_KEY is set to a placeholder non-empty value
 * - Returns the subprocess exit code (or 1 if killed by signal / spawn failure)
 */
export async function launchClaudeCode(
  binaryPath: string,
  port: number,
  forwardedArgs: string[],
): Promise<number> {
  try {
    const env = { ...Deno.env.toObject() };
    delete env["ANTHROPIC_API_KEY"];
    env["ANTHROPIC_BASE_URL"] = `http://127.0.0.1:${port}`;
    env["ANTHROPIC_AUTH_TOKEN"] = "claudio";

    const child = new Deno.Command(binaryPath, {
      args: forwardedArgs,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env,
    }).spawn();

    const status = await child.status;
    return status.code ?? 1;
  } catch (err) {
    if (err instanceof Deno.errors.PermissionDenied) {
      console.error("claude: permission denied");
    } else {
      console.error(
        `Failed to launch claude: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return 1;
  }
}
