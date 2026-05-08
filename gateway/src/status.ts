import { loadConfig } from "./store.ts";
import { getStoredToken, isTokenValid } from "../../cli/src/auth.ts";
import { getDaemonManager, getServiceManager } from "./managers/mod.ts";
import type { GitHubCopilotUsageData } from "./copilot-sdk.ts";

interface CopilotUsage {
  used: number;
  total: number;
  remainingPercentage: number;
  status: "authenticated" | "unauthenticated" | "error";
}

interface StatusRuntimeDeps {
  loadConfig: typeof loadConfig;
  getStoredToken: typeof getStoredToken;
  isTokenValid: typeof isTokenValid;
  getServiceManager: typeof getServiceManager;
  getDaemonManager: typeof getDaemonManager;
  fetch: typeof fetch;
  fetchGitHubCopilotQuota: () => Promise<GitHubCopilotUsageData | null>;
}

async function defaultFetchGitHubCopilotQuota(): Promise<
  GitHubCopilotUsageData | null
> {
  const { fetchGitHubCopilotQuota } = await import("./copilot-sdk.ts");
  return await fetchGitHubCopilotQuota();
}

const defaultStatusRuntimeDeps: StatusRuntimeDeps = {
  loadConfig,
  getStoredToken,
  isTokenValid,
  getServiceManager,
  getDaemonManager,
  fetch,
  fetchGitHubCopilotQuota: defaultFetchGitHubCopilotQuota,
};

let statusRuntimeDeps: StatusRuntimeDeps = { ...defaultStatusRuntimeDeps };

export function __setStatusTestDeps(
  overrides: Partial<StatusRuntimeDeps>,
): void {
  statusRuntimeDeps = { ...statusRuntimeDeps, ...overrides };
}

export function __resetStatusTestDeps(): void {
  statusRuntimeDeps = { ...defaultStatusRuntimeDeps };
}

function toCopilotUsage(data: GitHubCopilotUsageData): CopilotUsage {
  return {
    used: data.quota.usedRequests,
    total: data.quota.entitlementRequests,
    remainingPercentage: data.quota.remainingPercentage,
    status: data.status,
  };
}

async function fetchCopilotUsage(): Promise<CopilotUsage | null> {
  const usage = await statusRuntimeDeps.fetchGitHubCopilotQuota();
  return usage ? toCopilotUsage(usage) : null;
}

export interface ServiceState {
  running: boolean;
  serviceInstalled: boolean;
  pid: number | null;
  port: number | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  copilotUsage?: {
    used: number;
    total: number;
    remainingPercentage: number;
    status: "authenticated" | "unauthenticated" | "error";
  };
}

/**
 * Compute the current service state by:
 * 1. Checking whether the OS service is installed
 * 2. If installed — checking service running state via OS manager
 * 3. If not installed — reading the PID file and checking liveness + /health
 * 4. Reading Modmux config for the port
 * 5. Checking stored token validity
 */
export async function getServiceState(): Promise<ServiceState> {
  const serviceManager = statusRuntimeDeps.getServiceManager();
  const daemonManager = statusRuntimeDeps.getDaemonManager();

  const [serviceInstalled, pid, config, token] = await Promise.all([
    serviceManager.isInstalled().catch(() => false),
    daemonManager.getPid(),
    statusRuntimeDeps.loadConfig().catch(() => null),
    statusRuntimeDeps.getStoredToken().catch(() => null),
  ]);

  const port = config?.port ?? null;

  let authStatus: ServiceState["authStatus"] = "unknown";
  try {
    authStatus = statusRuntimeDeps.isTokenValid(token)
      ? "authenticated"
      : "unauthenticated";
  } catch {
    authStatus = "unknown";
  }

  if (serviceInstalled) {
    const running = await serviceManager.isRunning().catch(() => false);
    const result: ServiceState = {
      running,
      serviceInstalled,
      pid: null,
      port,
      authStatus,
    };

    if (port !== null) {
      const usage = await fetchCopilotUsage();
      if (usage) {
        result.copilotUsage = usage;
      }
    }

    return result;
  }

  // Modmux-managed daemon: check PID + /health (on non-Windows)
  const running = pid !== null;

  // On non-Windows, try to confirm reachability via /health (best-effort).
  // Windows network initialization is slower, making health checks unreliable.
  // We already have robust process detection (Get-Process + tasklist),
  // so skipping health checks on Windows is safe and avoids timeouts.
  // Health check failures don't override PID-based detection anyway.
  if (running && port !== null && Deno.build.os !== "windows") {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      try {
        const resp = await statusRuntimeDeps.fetch(
          `http://127.0.0.1:${port}/health`,
          { signal: controller.signal },
        );
        if (!resp.ok) {
          throw new Error(`health check returned ${resp.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Health check failed — ignore (best-effort only).
      // Process is verified alive, so a health check failure is likely a
      // transient networking or server initialization issue.
    }
  }

  const effectivePid = running ? pid : null;
  const result: ServiceState = {
    running,
    serviceInstalled,
    pid: effectivePid,
    port,
    authStatus,
  };

  if (port !== null) {
    const usage = await fetchCopilotUsage();
    if (usage) {
      result.copilotUsage = usage;
    }
  }

  return result;
}

/**
 * Format a ServiceState for human-readable `modmux status` output.
 * agents: list of configured agent names from Modmux config entries
 * version: application version string to display
 */
export function formatStatus(
  state: ServiceState,
  agents: string[],
  version: string,
): string {
  const serviceLine = state.serviceInstalled
    ? "Service:  Installed"
    : "Service:  Not installed";

  let stateLine: string;
  if (state.running && state.port !== null) {
    stateLine = `State:    Running at http://localhost:${state.port}`;
  } else if (state.serviceInstalled) {
    stateLine = "State:    Stopped";
  } else {
    stateLine = "State:    Not running";
  }

  const agentsLine = agents.length > 0
    ? `Agents:   ${agents.join(", ")}`
    : "Agents:   none";

  const authLine = state.authStatus === "authenticated"
    ? "Copilot:  Authenticated \u2713"
    : state.authStatus === "unauthenticated"
    ? "Copilot:  Not authenticated"
    : "Copilot:  Unknown";

  const versionLine = `Version:  v${version}`;

  // Add usage line when available
  let usageLine = "";
  if (state.copilotUsage) {
    const { used, total, remainingPercentage, status } = state.copilotUsage;
    if (status === "authenticated") {
      usageLine = `Usage:    ${used}/${total} requests (${
        remainingPercentage.toFixed(0)
      }% remaining)`;
    } else {
      usageLine = `Usage:    Not available (${status})`;
    }
  }

  const lines = [serviceLine, stateLine, agentsLine, authLine];
  if (usageLine) lines.push(usageLine);
  lines.push(versionLine);

  return lines.join("\n");
}
