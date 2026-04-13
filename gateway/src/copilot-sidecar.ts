import { join } from "@std/path";
import { findFreePort, spawnDetached } from "./background-process.ts";
import { log } from "./log.ts";
import { findFirstBinary, isProcessAlive } from "./process.ts";
import type { GitHubUsageConfig } from "./store.ts";
import { configDir } from "./store.ts";
import { createTokenStore } from "./token.ts";

export interface CopilotSidecarState {
  pid: number;
  port: number;
  startedAt: string;
}

export interface GitHubUsageRuntimeTarget {
  cliUrl: string | null;
  statusHint: "unauthenticated" | "error" | null;
}

interface SidecarRuntimeDeps {
  createTokenStore: typeof createTokenStore;
  findFirstBinary: typeof findFirstBinary;
  findFreePort: typeof findFreePort;
  isProcessAlive: typeof isProcessAlive;
  spawnDetached: typeof spawnDetached;
  log: typeof log;
  connect: (
    options: { hostname: string; port: number },
  ) => Promise<{ close(): void }>;
  kill: typeof Deno.kill;
  sleep: (ms: number) => Promise<void>;
}

const defaultSidecarRuntimeDeps: SidecarRuntimeDeps = {
  createTokenStore,
  findFirstBinary,
  findFreePort,
  isProcessAlive,
  spawnDetached,
  log,
  connect: Deno.connect,
  kill: Deno.kill,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let sidecarRuntimeDeps: SidecarRuntimeDeps = { ...defaultSidecarRuntimeDeps };

export function __setCopilotSidecarTestDeps(
  overrides: Partial<SidecarRuntimeDeps>,
): void {
  sidecarRuntimeDeps = { ...sidecarRuntimeDeps, ...overrides };
}

export function __resetCopilotSidecarTestDeps(): void {
  sidecarRuntimeDeps = { ...defaultSidecarRuntimeDeps };
}

function sidecarStatePath(): string {
  return join(configDir(), "copilot-sidecar.json");
}

export function buildManagedGitHubUsageCliUrl(port: number): string {
  return `127.0.0.1:${port}`;
}

export function findAvailableCopilotSidecarPort(preferredPort: number): number {
  return sidecarRuntimeDeps.findFreePort(preferredPort);
}

async function getStoredGitHubToken(): Promise<string | null> {
  const tokenStore = sidecarRuntimeDeps.createTokenStore();
  const authToken = await tokenStore.load().catch(() => null);
  if (!authToken || !tokenStore.isValid(authToken)) {
    return null;
  }
  return authToken.accessToken;
}

export async function readCopilotSidecarState(): Promise<
  CopilotSidecarState | null
> {
  try {
    const raw = await Deno.readTextFile(sidecarStatePath());
    const parsed = JSON.parse(raw) as Partial<CopilotSidecarState>;
    if (
      typeof parsed.pid !== "number" || Number.isNaN(parsed.pid) ||
      typeof parsed.port !== "number" || Number.isNaN(parsed.port) ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      port: parsed.port,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export async function writeCopilotSidecarState(
  state: CopilotSidecarState,
): Promise<void> {
  await Deno.mkdir(configDir(), { recursive: true });
  await Deno.writeTextFile(
    sidecarStatePath(),
    JSON.stringify(state, null, 2) + "\n",
  );
}

export async function removeCopilotSidecarState(): Promise<void> {
  try {
    await Deno.remove(sidecarStatePath());
  } catch {
    // Ignore — file may not exist
  }
}

async function isPortReachable(port: number): Promise<boolean> {
  try {
    const conn = await sidecarRuntimeDeps.connect({
      hostname: "127.0.0.1",
      port,
    });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

async function waitForPort(port: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (await isPortReachable(port)) {
      return true;
    }
    await sidecarRuntimeDeps.sleep(100);
  }
  return false;
}

async function stopSidecarPid(pid: number): Promise<void> {
  if (!await sidecarRuntimeDeps.isProcessAlive(pid)) return;
  try {
    sidecarRuntimeDeps.kill(pid, "SIGTERM");
  } catch {
    // Process may already be gone
  }

  for (let i = 0; i < 30; i++) {
    if (!await sidecarRuntimeDeps.isProcessAlive(pid)) {
      return;
    }
    await sidecarRuntimeDeps.sleep(100);
  }
}

export async function resolveConfiguredGitHubUsageCliUrl(
  githubUsage: GitHubUsageConfig,
): Promise<string | null> {
  if (githubUsage.backend !== "external-cli") {
    return null;
  }
  if (!githubUsage.autoStart) {
    return githubUsage.cliUrl;
  }
  const state = await readCopilotSidecarState();
  if (state === null) return null;
  if (!await sidecarRuntimeDeps.isProcessAlive(state.pid)) {
    await removeCopilotSidecarState();
    return null;
  }
  if (!await isPortReachable(state.port)) {
    await removeCopilotSidecarState();
    return null;
  }
  return buildManagedGitHubUsageCliUrl(state.port);
}

export async function ensureGitHubUsageSidecarStarted(
  githubUsage: GitHubUsageConfig,
): Promise<GitHubUsageRuntimeTarget> {
  if (githubUsage.backend !== "external-cli") {
    return { cliUrl: null, statusHint: "error" };
  }
  if (!githubUsage.autoStart) {
    return {
      cliUrl: githubUsage.cliUrl,
      statusHint: githubUsage.cliUrl === null ? "error" : null,
    };
  }

  const existingState = await readCopilotSidecarState();
  if (existingState !== null) {
    const alive = await sidecarRuntimeDeps.isProcessAlive(existingState.pid);
    const reachable = alive && await isPortReachable(existingState.port);
    if (reachable) {
      return {
        cliUrl: buildManagedGitHubUsageCliUrl(existingState.port),
        statusHint: null,
      };
    }
    if (alive) {
      await stopSidecarPid(existingState.pid);
    }
    await removeCopilotSidecarState();
  }

  const githubToken = await getStoredGitHubToken();
  if (githubToken === null) {
    await sidecarRuntimeDeps.log(
      "info",
      "Copilot sidecar not started: no valid stored token",
    );
    return { cliUrl: null, statusHint: "unauthenticated" };
  }

  const binaryPath = await sidecarRuntimeDeps.findFirstBinary(["copilot"]);
  if (binaryPath === null) {
    await sidecarRuntimeDeps.log(
      "warn",
      "Copilot sidecar not started: copilot binary not found",
    );
    return { cliUrl: null, statusHint: "error" };
  }

  const port = findAvailableCopilotSidecarPort(githubUsage.preferredPort);
  const args = [
    "--port",
    String(port),
    "--headless",
    "--auth-token-env",
    "MODMUX_GITHUB_USAGE_TOKEN",
  ];

  let pid: number | null = null;
  try {
    pid = await sidecarRuntimeDeps.spawnDetached(binaryPath, args, {
      MODMUX_GITHUB_USAGE_TOKEN: githubToken,
    });

    const ready = await waitForPort(port);
    if (!ready) {
      throw new Error(`Timed out waiting for Copilot sidecar on port ${port}`);
    }

    await writeCopilotSidecarState({
      pid,
      port,
      startedAt: new Date().toISOString(),
    });

    await sidecarRuntimeDeps.log("info", "Copilot sidecar started", {
      pid,
      port,
      binaryPath,
    });

    return {
      cliUrl: buildManagedGitHubUsageCliUrl(port),
      statusHint: null,
    };
  } catch (error) {
    if (pid !== null) {
      await stopSidecarPid(pid);
    }
    await removeCopilotSidecarState();
    await sidecarRuntimeDeps.log("warn", "Failed to start Copilot sidecar", {
      error: error instanceof Error ? error.message : String(error),
      binaryPath,
      preferredPort: githubUsage.preferredPort,
    });
    return { cliUrl: null, statusHint: "error" };
  }
}

export async function stopGitHubUsageSidecar(): Promise<void> {
  const state = await readCopilotSidecarState();
  if (state === null) return;
  await stopSidecarPid(state.pid);
  await removeCopilotSidecarState();
  await sidecarRuntimeDeps.log("info", "Copilot sidecar stopped", {
    pid: state.pid,
    port: state.port,
  });
}
