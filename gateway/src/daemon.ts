import { basename, join } from "@std/path";
import { findFreePort, spawnDetached } from "./background-process.ts";
import { syncConfiguredAgentsToPort } from "./config.ts";
import { configDir, loadConfig } from "./store.ts";
import { isProcessAlive } from "./process.ts";
import { log } from "./log.ts";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

function legacyDir(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".modmux");
}

function pidPath(): string {
  return join(configDir(), "modmux.pid");
}

function legacyPidPath(): string {
  return join(legacyDir(), "modmux.pid");
}

// ---------------------------------------------------------------------------
// PID file helpers
// ---------------------------------------------------------------------------

async function writePid(pid: number): Promise<void> {
  await Deno.mkdir(configDir(), { recursive: true });
  await Deno.writeTextFile(pidPath(), `${pid}\n`);
}

async function readPid(): Promise<number | null> {
  for (const path of [pidPath(), legacyPidPath()]) {
    try {
      const raw = await Deno.readTextFile(path);
      const pid = parseInt(raw.trim(), 10);
      if (!isNaN(pid)) return pid;
    } catch {
      // keep looking
    }
  }
  return null;
}

async function removePid(): Promise<void> {
  for (const path of [pidPath(), legacyPidPath()]) {
    try {
      await Deno.remove(path);
    } catch {
      // Ignore — file may not exist
    }
  }
}

function isDenoExecutable(path: string): boolean {
  const name = basename(path).toLowerCase();
  return name === "deno" || name === "deno.exe";
}

function daemonSpawnArgs(self: string): string[] {
  if (isDenoExecutable(self)) {
    return ["run", "--allow-all", Deno.mainModule, "--daemon"];
  }
  return ["--daemon"];
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
    await syncConfiguredAgentsToPort(port, config);
  }

  // Self-spawn current CLI entrypoint with --daemon
  const self = Deno.execPath();
  const pid = await spawnDetached(self, daemonSpawnArgs(self));
  await writePid(pid);

  // Avoid reporting success when the child exits immediately (common spawn issue).
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await isProcessAlive(pid)) {
      return { already: false, port };
    }
  }

  await removePid();
  throw new Error(
    "Failed to start daemon process. Check ~/.modmux/modmux.log for details.",
  );
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
