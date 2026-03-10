import { loadConfig } from "../config/store.ts";
import { getDaemonPid } from "./daemon.ts";
import { getStoredToken, isTokenValid } from "../cli/auth.ts";

export interface ServiceState {
  running: boolean;
  pid: number | null;
  port: number | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
}

/**
 * Compute the current service state by:
 * 1. Reading the PID file and checking liveness
 * 2. Reading CocoConfig for the port
 * 3. Checking stored token validity
 */
export async function getServiceState(): Promise<ServiceState> {
  const [pid, config, token] = await Promise.all([
    getDaemonPid(),
    loadConfig().catch(() => null),
    getStoredToken().catch(() => null),
  ]);

  const running = pid !== null;
  const port = config?.port ?? null;

  let authStatus: ServiceState["authStatus"] = "unknown";
  try {
    authStatus = isTokenValid(token) ? "authenticated" : "unauthenticated";
  } catch {
    authStatus = "unknown";
  }

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
        return { running: false, pid: null, port, authStatus };
      }
    } catch {
      // Health check failed — treat as not running
      return { running: false, pid: null, port, authStatus };
    }
  }

  return { running, pid, port, authStatus };
}

/**
 * Format a ServiceState for human-readable `coco status` output.
 */
export function formatStatus(state: ServiceState): string {
  const statusLine = state.running && state.port !== null
    ? `Status:  Running on http://localhost:${state.port}`
    : "Status:  Not running";

  const authLine = state.authStatus === "authenticated"
    ? "Copilot: Authenticated ✓"
    : state.authStatus === "unauthenticated"
    ? "Copilot: Not authenticated"
    : "Copilot: Unknown";

  return `${statusLine}\n${authLine}`;
}
