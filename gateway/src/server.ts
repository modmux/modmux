import { stopClient } from "./copilot.ts";
import {
  ensureGitHubUsageSidecarStarted,
  stopGitHubUsageSidecar,
} from "./copilot-sidecar.ts";
import { shutdownUsageMetrics } from "./usage-metrics.ts";
import { loadConfig, saveConfig } from "./store.ts";
import { log, setLogLevel } from "./log.ts";

interface ServerRuntimeDeps {
  loadConfig: typeof loadConfig;
  saveConfig: typeof saveConfig;
  setLogLevel: typeof setLogLevel;
  ensureGitHubUsageSidecarStarted: typeof ensureGitHubUsageSidecarStarted;
  shutdownUsageMetrics: typeof shutdownUsageMetrics;
  stopGitHubUsageSidecar: typeof stopGitHubUsageSidecar;
  stopClient: typeof stopClient;
  log: typeof log;
}

const defaultServerRuntimeDeps: ServerRuntimeDeps = {
  loadConfig,
  saveConfig,
  setLogLevel,
  ensureGitHubUsageSidecarStarted,
  shutdownUsageMetrics,
  stopGitHubUsageSidecar,
  stopClient,
  log,
};

let serverRuntimeDeps: ServerRuntimeDeps = { ...defaultServerRuntimeDeps };

export function __setServerTestDeps(
  overrides: Partial<ServerRuntimeDeps>,
): void {
  serverRuntimeDeps = { ...serverRuntimeDeps, ...overrides };
}

export function __resetServerTestDeps(): void {
  serverRuntimeDeps = { ...defaultServerRuntimeDeps };
}

export interface ServerConfig {
  port: number;
  hostname: string;
  usageMetrics: {
    persist: boolean;
    snapshotIntervalMs: number;
    filePath: string | null;
  };
}

export async function getConfig(): Promise<ServerConfig> {
  const config = await serverRuntimeDeps.loadConfig();
  serverRuntimeDeps.setLogLevel(config.logLevel);

  return {
    port: config.port,
    hostname: "127.0.0.1",
    usageMetrics: config.usageMetrics,
  };
}

export async function initializeServerRuntime(): Promise<void> {
  const config = await serverRuntimeDeps.loadConfig();
  serverRuntimeDeps.setLogLevel(config.logLevel);
  await serverRuntimeDeps.ensureGitHubUsageSidecarStarted(config.githubUsage);

  await serverRuntimeDeps.saveConfig({
    ...config,
    lastStarted: new Date().toISOString(),
  });
}

export async function shutdown(): Promise<void> {
  serverRuntimeDeps.log("info", "Server shutting down");
  await serverRuntimeDeps.shutdownUsageMetrics();
  await serverRuntimeDeps.stopGitHubUsageSidecar();
  await serverRuntimeDeps.stopClient();
}

export function addShutdownHandler(): void {
  Deno.addSignalListener("SIGTERM", async () => {
    await shutdown();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGINT", async () => {
    await shutdown();
    Deno.exit(0);
  });
}
