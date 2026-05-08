/**
 * Process utilities: binary discovery and PID liveness checks.
 */

/**
 * Search for a binary by name. Checks PATH entries and common tool-specific
 * install locations (local bin, go bin).
 * Returns the absolute path if found, otherwise null.
 */
export async function findBinary(name: string): Promise<string | null> {
  const isWindows = Deno.build.os === "windows";
  const separator = isWindows ? ";" : ":";
  const pathEnv = Deno.env.get("PATH") ?? "";
  const dirs = pathEnv.split(separator).filter(Boolean);

  // Extra locations not always on PATH
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
  if (home) {
    dirs.push(
      `${home}/.local/bin`,
      `${home}/go/bin`,
    );
  }
  if (isWindows) {
    // Add Windows-specific paths if needed
  }

  const exts = isWindows ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = `${dir}${isWindows ? "\\" : "/"}${name}${ext}`;
      try {
        const info = await Deno.stat(candidate);
        if (info.isFile) return candidate;
      } catch {
        // not found here
      }
    }
  }
  return null;
}

/**
 * Search for the first available binary in priority order.
 */
export async function findFirstBinary(
  names: readonly string[],
): Promise<string | null> {
  for (const name of names) {
    const found = await findBinary(name);
    if (found) return found;
  }
  return null;
}

/**
 * Check whether a process identified by PID is alive.
 * Uses `kill -0` on Unix and PowerShell Get-Process on Windows.
 * On Windows, also tries Tasklist as a fallback for robustness.
 */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    if (Deno.build.os === "windows") {
      // Try Get-Process first (more reliable)
      try {
        const cmd = new Deno.Command("powershell", {
          args: [
            "-NonInteractive",
            "-Command",
            `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Out-Null; $?`,
          ],
          stdout: "piped",
          stderr: "null",
        });
        const output = await cmd.output();
        const result = new TextDecoder().decode(output.stdout).trim();
        const isAlive = result === "True" || output.code === 0;
        console.debug(
          `[process] Get-Process check: PID ${pid} alive=${isAlive}`,
        );
        return isAlive;
      } catch (e) {
        console.debug(
          `[process] Get-Process failed (${e}), trying Tasklist fallback`,
        );
        // Fallback: try tasklist
        const cmd = new Deno.Command("tasklist", {
          args: ["/FI", `"PID eq ${pid}"`],
          stdout: "piped",
          stderr: "null",
        });
        const output = await cmd.output();
        const result = new TextDecoder().decode(output.stdout);
        const isAlive = result.includes(String(pid));
        console.debug(
          `[process] Tasklist fallback: PID ${pid} alive=${isAlive}`,
        );
        return isAlive;
      }
    } else {
      const cmd = new Deno.Command("kill", {
        args: ["-0", String(pid)],
        stdout: "null",
        stderr: "null",
      });
      const { code } = await cmd.output();
      return code === 0;
    }
  } catch (e) {
    console.debug(`[process] isProcessAlive check failed: ${e}`);
    return false;
  }
}
