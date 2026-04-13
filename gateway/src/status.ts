import { loadConfig } from "./store.ts";
import { getStoredToken, isTokenValid } from "../../cli/src/auth.ts";
import { getDaemonManager, getServiceManager } from "./managers/mod.ts";

interface CopilotUsage {
  used: number;
  total: number;
  remainingPercentage: number;
  status: "authenticated" | "unauthenticated" | "error";
}

/**
 * Fetch GitHub Copilot usage data from the local /v1/usage endpoint
 */
async function fetchCopilotUsage(port: number): Promise<CopilotUsage | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`http://127.0.0.1:${port}/v1/usage`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const github = data.github_copilot;

    if (!github) return null;

    // Show usage data if we have GitHub data, regardless of auth status
    // This allows displaying "0/0" for unauthenticated state
    return {
      used: github.quota.usedRequests,
      total: github.quota.entitlementRequests,
      remainingPercentage: github.quota.remainingPercentage,
      status: github.status,
    };
  } catch {
    return null;
  }
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
  const serviceManager = getServiceManager();
  const daemonManager = getDaemonManager();

  const [serviceInstalled, pid, config, token] = await Promise.all([
    serviceManager.isInstalled().catch(() => false),
    daemonManager.getPid(),
    loadConfig().catch(() => null),
    getStoredToken().catch(() => null),
  ]);

  const port = config?.port ?? null;

  let authStatus: ServiceState["authStatus"] = "unknown";
  try {
    authStatus = isTokenValid(token) ? "authenticated" : "unauthenticated";
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

    // Fetch copilot usage if service is running and we have a port
    if (running && port !== null) {
      const usage = await fetchCopilotUsage(port);
      if (usage) {
        result.copilotUsage = usage;
      }
    }

    return result;
  }

  // Modmux-managed daemon: check PID + /health
  const running = pid !== null;

  // If running, confirm reachability via /health (best-effort)
  if (running && port !== null) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const resp = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        return {
          running: false,
          serviceInstalled,
          pid: null,
          port,
          authStatus,
        };
      }
    } catch {
      // Health check failed — treat as not running
      return { running: false, serviceInstalled, pid: null, port, authStatus };
    }
  }

  const result: ServiceState = {
    running,
    serviceInstalled,
    pid,
    port,
    authStatus,
  };

  // Fetch copilot usage if service is running and we have a port
  if (running && port !== null) {
    const usage = await fetchCopilotUsage(port);
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
