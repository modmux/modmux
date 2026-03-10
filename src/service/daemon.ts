import { join } from "@std/path";
import { loadConfig, saveConfig } from "../config/store.ts";
import { isProcessAlive } from "../lib/process.ts";
import { log } from "../lib/log.ts";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

function cocoDir(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".coco");
}

function pidPath(): string {
  return join(cocoDir(), "coco.pid");
}

// ---------------------------------------------------------------------------
// PID file helpers
// ---------------------------------------------------------------------------

async function writePid(pid: number): Promise<void> {
  await Deno.mkdir(cocoDir(), { recursive: true });
  await Deno.writeTextFile(pidPath(), `${pid}\n`);
}

async function readPid(): Promise<number | null> {
  try {
    const raw = await Deno.readTextFile(pidPath());
    const pid = parseInt(raw.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

async function removePid(): Promise<void> {
  try {
    await Deno.remove(pidPath());
  } catch {
    // Ignore — file may not exist
  }
}

// ---------------------------------------------------------------------------
// Port conflict resolution
// ---------------------------------------------------------------------------

/**
 * Find the first free TCP port starting at `preferred`, scanning upward.
 * Tries up to 20 candidates before giving up.
 */
function findFreePort(preferred: number): number {
  for (let port = preferred; port < preferred + 20; port++) {
    try {
      const listener = Deno.listen({ hostname: "127.0.0.1", port });
      listener.close();
      return port;
    } catch {
      // Port occupied — try next
    }
  }
  throw new Error(`No free port found in range ${preferred}–${preferred + 19}`);
}

// ---------------------------------------------------------------------------
// Public daemon API
// ---------------------------------------------------------------------------

export interface StartResult {
  already: boolean;
  port: number;
}

/**
 * Spawn the background daemon process using the self-spawn pattern.
 * The parent writes the PID to disk, then returns immediately.
 * The child runs with --daemon flag and keeps the process alive.
 */
export async function startDaemon(): Promise<StartResult> {
  // Check if already running
  const existingPid = await readPid();
  if (existingPid !== null && await isProcessAlive(existingPid)) {
    const config = await loadConfig();
    return { already: true, port: config.port };
  }

  // Stale PID — clean up
  if (existingPid !== null) {
    await removePid();
  }

  const config = await loadConfig();
  const port = findFreePort(config.port);

  if (port !== config.port) {
    log("info", `Port ${config.port} occupied; using ${port}`);
    await saveConfig({ ...config, port });
  }

  // Self-spawn: coco --daemon
  const self = Deno.execPath();
  const child = new Deno.Command(self, {
    args: ["run", "--allow-all", Deno.mainModule, "--daemon"],
    stdin: "null",
    stdout: "null",
    stderr: "null",
    detached: true,
  }).spawn();

  await writePid(child.pid);
  child.unref();

  return { already: false, port };
}

/**
 * Send SIGTERM to the daemon and remove the PID file.
 * Returns true if the daemon was running and was stopped.
 */
export async function stopDaemon(): Promise<boolean> {
  const pid = await readPid();
  if (pid === null || !isProcessAlive(pid)) {
    await removePid();
    return false;
  }

  try {
    Deno.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited
  }

  // Wait up to 3s for process to exit
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (!await isProcessAlive(pid)) break;
  }

  await removePid();
  return true;
}

/**
 * Returns the PID of the running daemon, or null if not running.
 */
export async function getDaemonPid(): Promise<number | null> {
  const pid = await readPid();
  if (pid !== null && await isProcessAlive(pid)) return pid;
  if (pid !== null) await removePid();
  return null;
}
