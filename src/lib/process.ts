/**
 * Process utilities: binary discovery and PID liveness checks.
 */

/**
 * Search for a binary by name. Checks PATH entries and common tool-specific
 * install locations (npm global, pip user bin).
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
      `${home}/.npm-global/bin`,
      `${home}/go/bin`,
    );
  }
  if (isWindows) {
    const appData = Deno.env.get("APPDATA") ?? "";
    if (appData) dirs.push(`${appData}\\npm`);
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
 * Check whether a process identified by PID is alive.
 * Uses `kill -0` on Unix and PowerShell Get-Process on Windows.
 */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    if (Deno.build.os === "windows") {
      const cmd = new Deno.Command("powershell", {
        args: ["-Command", `Get-Process -Id ${pid} -ErrorAction SilentlyContinue`],
        stdout: "piped",
        stderr: "null",
      });
      const { code } = await cmd.output();
      return code === 0;
    } else {
      const cmd = new Deno.Command("kill", {
        args: ["-0", String(pid)],
        stdout: "null",
        stderr: "null",
      });
      const { code } = await cmd.output();
      return code === 0;
    }
  } catch {
    return false;
  }
}
