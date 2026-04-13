/**
 * Shared helpers for detached background processes and local port discovery.
 */

/**
 * Find the first free TCP port starting at `preferred`, scanning upward.
 * Tries up to 20 candidates before giving up.
 */
export function findFreePort(preferred: number): number {
  for (let port = preferred; port < preferred + 20; port++) {
    try {
      const listener = Deno.listen({ hostname: "127.0.0.1", port });
      listener.close();
      return port;
    } catch {
      // Port occupied — try next
    }
  }
  throw new Error(`No free port found in range ${preferred}-{preferred + 19}`);
}

/**
 * Spawn a detached background process and return its PID.
 *
 * On Windows, Deno-compiled binaries are console-subsystem executables.
 * Spawning them with `detached: true` causes the Deno runtime to call
 * `AllocConsole()` (it has no inherited console), which flashes a visible
 * terminal window. Work around this by routing through PowerShell
 * `Start-Process -WindowStyle Hidden`, which sets SW_HIDE in STARTUPINFO
 * so the console window is never shown.
 */
export async function spawnDetached(
  exe: string,
  args: string[],
  env?: Record<string, string>,
): Promise<number> {
  if (Deno.build.os === "windows") {
    const esc = (s: string) => s.replace(/'/g, "''");
    const argList = args.map((a) => `'${esc(a)}'`).join(",");
    const envPrefix = Object.entries(env ?? {})
      .map(([key, value]) => `$env:${key}='${esc(value)}'`)
      .join("; ");
    const processExpr = args.length > 0
      ? `(Start-Process -FilePath '${
        esc(exe)
      }' -ArgumentList ${argList} -WindowStyle Hidden -PassThru).Id`
      : `(Start-Process -FilePath '${
        esc(exe)
      }' -WindowStyle Hidden -PassThru).Id`;
    const script = envPrefix.trim()
      ? `${envPrefix}; ${processExpr}`
      : processExpr;
    const { success, stdout } = await new Deno.Command("powershell", {
      args: ["-NonInteractive", "-Command", script],
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!success) {
      throw new Error("Failed to spawn detached process via PowerShell");
    }
    const pid = parseInt(new TextDecoder().decode(stdout).trim(), 10);
    if (isNaN(pid)) {
      throw new Error("Could not read detached process PID from PowerShell");
    }
    return pid;
  }

  const child = new Deno.Command(exe, {
    args,
    env,
    stdin: "null",
    stdout: "null",
    stderr: "null",
    detached: true,
  }).spawn();
  child.unref();
  return child.pid;
}
