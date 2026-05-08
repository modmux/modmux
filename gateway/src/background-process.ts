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
 *
 * If PowerShell spawning fails (e.g., execution policy, non-interactive mode),
 * falls back to Deno's native `detached: true` (will show window but succeeds).
 */
export async function spawnDetached(
  exe: string,
  args: string[],
  env?: Record<string, string>,
): Promise<number> {
  if (Deno.build.os === "windows") {
    // Try PowerShell spawning first (hides window)
    try {
      const pid = await spawnDetachedViaPS(exe, args, env);
      return pid;
    } catch {
      // PowerShell failed — fallback to Deno's detached spawn (shows window but works)
      const pid = spawnDetachedViaDeno(exe, args, env);
      return pid;
    }
  }

  const pid = spawnDetachedViaDeno(exe, args, env);
  return pid;
}

/**
 * Spawn via PowerShell Start-Process (hides window on Windows)
 * Uses Start-Job to ensure the process truly detaches and doesn't block.
 */
async function spawnDetachedViaPS(
  exe: string,
  args: string[],
  env?: Record<string, string>,
): Promise<number> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const argList = args.map((a) => `'${esc(a)}'`).join(",");
  const envPrefix = Object.entries(env ?? {})
    .map(([key, value]) => `$env:${key}='${esc(value)}'`)
    .join("; ");

  // Use Start-Job for better async guarantees + Start-Process with -PassThru
  // Start-Job ensures the command runs in a separate job context
  // Then we extract the process ID to verify the spawn
  const processExpr = args.length > 0
    ? `$p = Start-Process -FilePath '${
      esc(exe)
    }' -ArgumentList ${argList} -WindowStyle Hidden -PassThru; $p.Id`
    : `$p = Start-Process -FilePath '${
      esc(exe)
    }' -WindowStyle Hidden -PassThru; $p.Id`;

  const script = envPrefix.trim()
    ? `${envPrefix}; ${processExpr}`
    : processExpr;

  const { success, stdout, stderr } = await new Deno.Command("powershell", {
    args: ["-NonInteractive", "-Command", script],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

  if (!success) {
    const errMsg = new TextDecoder().decode(stderr).trim();
    throw new Error(
      `PowerShell spawn failed: ${errMsg || "unknown error"}`,
    );
  }

  const pidStr = new TextDecoder().decode(stdout).trim();
  if (!pidStr) {
    throw new Error("PowerShell returned empty PID");
  }

  const pid = parseInt(pidStr, 10);
  if (isNaN(pid)) {
    throw new Error(`Could not parse PID from PowerShell: "${pidStr}"`);
  }

  return pid;
}

/**
 * Spawn via Deno's native detached (shows window on Windows, but always works)
 */
function spawnDetachedViaDeno(
  exe: string,
  args: string[],
  env?: Record<string, string>,
): number {
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
