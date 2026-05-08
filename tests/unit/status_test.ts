import { assertEquals, assertStringIncludes } from "@std/assert";
import { DEFAULT_CONFIG, formatStatus, ServiceState } from "@modmux/gateway";
import type {
  DaemonManager,
  ServiceManager,
} from "../../gateway/src/managers/interfaces.ts";
import {
  __resetStatusTestDeps,
  __setStatusTestDeps,
  getServiceState,
} from "../../gateway/src/status.ts";

const mockUsage = {
  quota: {
    entitlementRequests: 100,
    usedRequests: 12,
    remainingRequests: 88,
    remainingPercentage: 88,
    overage: 0,
  },
  status: "authenticated" as const,
  lastUpdated: "2026-05-07T00:00:00.000Z",
};

function makeServiceManager(
  installed: boolean,
  running: boolean,
): ServiceManager {
  return {
    isInstalled: () => Promise.resolve(installed),
    isRunning: () => Promise.resolve(running),
    install: () => Promise.reject(new Error("not used")),
    uninstall: () => Promise.reject(new Error("not used")),
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
}

function makeDaemonManager(pid: number | null): DaemonManager {
  return {
    isRunning: () => Promise.resolve(pid !== null),
    getPid: () => Promise.resolve(pid),
    start: () => Promise.reject(new Error("not used")),
    stop: () => Promise.resolve(false),
  };
}

Deno.test.afterEach(() => {
  __resetStatusTestDeps();
});

function baseState(overrides: Partial<ServiceState>): ServiceState {
  return {
    running: false,
    serviceInstalled: false,
    pid: null,
    port: 11434,
    authStatus: "authenticated",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Service line
// ---------------------------------------------------------------------------

Deno.test("formatStatus — service not installed shows 'Not installed'", () => {
  const out = formatStatus(baseState({ serviceInstalled: false }), [], "0.5.0");
  assertStringIncludes(out, "Service:  Not installed");
});

Deno.test("formatStatus — service installed shows 'Installed'", () => {
  const out = formatStatus(baseState({ serviceInstalled: true }), [], "0.5.0");
  assertStringIncludes(out, "Service:  Installed");
});

// ---------------------------------------------------------------------------
// State line
// ---------------------------------------------------------------------------

Deno.test("formatStatus — not installed, not running → State: Not running", () => {
  const out = formatStatus(
    baseState({ serviceInstalled: false, running: false }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "State:    Not running");
});

Deno.test("formatStatus — installed, stopped → State: Stopped", () => {
  const out = formatStatus(
    baseState({ serviceInstalled: true, running: false }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "State:    Stopped");
});

Deno.test("formatStatus — service running → State: Running at http://localhost:<port>", () => {
  const out = formatStatus(
    baseState({ serviceInstalled: true, running: true, port: 11434 }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "State:    Running at http://localhost:11434");
});

Deno.test("formatStatus — daemon running (no service) → State: Running at http://localhost:<port>", () => {
  const out = formatStatus(
    baseState({ serviceInstalled: false, running: true, port: 8080 }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "State:    Running at http://localhost:8080");
});

// ---------------------------------------------------------------------------
// Agents line
// ---------------------------------------------------------------------------

Deno.test("formatStatus — no agents configured → Agents: none", () => {
  const out = formatStatus(baseState({}), [], "0.5.0");
  assertStringIncludes(out, "Agents:   none");
});

Deno.test("formatStatus — agents list rendered comma-separated", () => {
  const out = formatStatus(baseState({}), ["claude-code", "cline"], "0.5.0");
  assertStringIncludes(out, "Agents:   claude-code, cline");
});

Deno.test("formatStatus — single agent rendered without trailing comma", () => {
  const out = formatStatus(baseState({}), ["codex"], "0.5.0");
  assertStringIncludes(out, "Agents:   codex");
});

// ---------------------------------------------------------------------------
// Copilot line
// ---------------------------------------------------------------------------

Deno.test("formatStatus — authenticated shows Authenticated", () => {
  const out = formatStatus(
    baseState({ authStatus: "authenticated" }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "Copilot:  Authenticated");
});

Deno.test("formatStatus — unauthenticated shows Not authenticated", () => {
  const out = formatStatus(
    baseState({ authStatus: "unauthenticated" }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "Copilot:  Not authenticated");
});

Deno.test("formatStatus — unknown auth shows Unknown", () => {
  const out = formatStatus(baseState({ authStatus: "unknown" }), [], "0.5.0");
  assertStringIncludes(out, "Copilot:  Unknown");
});

// ---------------------------------------------------------------------------
// Usage line
// ---------------------------------------------------------------------------

Deno.test("formatStatus — authenticated usage shows request counts", () => {
  const out = formatStatus(
    baseState({
      copilotUsage: {
        used: 12,
        total: 100,
        remainingPercentage: 88,
        status: "authenticated",
      },
    }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "Usage:    12/100 requests (88% remaining)");
});

Deno.test("formatStatus — usage error stays distinct from auth status", () => {
  const out = formatStatus(
    baseState({
      authStatus: "authenticated",
      copilotUsage: {
        used: 0,
        total: 0,
        remainingPercentage: 0,
        status: "error",
      },
    }),
    [],
    "0.5.0",
  );
  assertStringIncludes(out, "Copilot:  Authenticated");
  assertStringIncludes(out, "Usage:    Not available (error)");
});

// ---------------------------------------------------------------------------
// Version line
// ---------------------------------------------------------------------------

Deno.test("formatStatus — version shows current version", () => {
  const out = formatStatus(baseState({}), [], "0.5.0");
  assertStringIncludes(out, "Version:  v0.5.0");
});

// ---------------------------------------------------------------------------
// Overall structure
// ---------------------------------------------------------------------------

Deno.test("formatStatus — output contains all five label lines", () => {
  const state = baseState({
    serviceInstalled: true,
    running: true,
    port: 11434,
    authStatus: "authenticated",
  });
  const out = formatStatus(state, ["claude-code"], "0.5.0");
  const lines = out.split("\n");
  assertEquals(lines.length, 5);
  assertStringIncludes(lines[0], "Service:");
  assertStringIncludes(lines[1], "State:");
  assertStringIncludes(lines[2], "Agents:");
  assertStringIncludes(lines[3], "Copilot:");
  assertStringIncludes(lines[4], "Version:");
});

Deno.test("formatStatus — output includes usage line when quota data is available", () => {
  const out = formatStatus(
    baseState({
      serviceInstalled: true,
      running: true,
      port: 11434,
      authStatus: "authenticated",
      copilotUsage: {
        used: 8,
        total: 50,
        remainingPercentage: 84,
        status: "authenticated",
      },
    }),
    ["claude-code"],
    "0.5.0",
  );
  const lines = out.split("\n");
  assertEquals(lines.length, 6);
  assertStringIncludes(lines[4], "Usage:");
  assertStringIncludes(lines[5], "Version:");
});

Deno.test("getServiceState — includes usage when service is running", async () => {
  __setStatusTestDeps({
    loadConfig: () =>
      Promise.resolve({
        ...DEFAULT_CONFIG,
        port: 4321,
      }),
    getServiceManager: () => makeServiceManager(true, true),
    getDaemonManager: () => makeDaemonManager(null),
    getStoredToken: () => Promise.resolve(null),
    isTokenValid: () => false,
    fetch: () =>
      Promise.resolve(new Response('{"status":"ok"}', { status: 200 })),
    fetchGitHubCopilotQuota: () => Promise.resolve(mockUsage),
  });

  const state = await getServiceState();
  assertEquals(state.running, true);
  assertEquals(state.serviceInstalled, true);
  assertEquals(state.copilotUsage, {
    used: 12,
    total: 100,
    remainingPercentage: 88,
    status: "authenticated",
  });
});

Deno.test("getServiceState — includes usage when daemon health check fails", async () => {
  __setStatusTestDeps({
    loadConfig: () =>
      Promise.resolve({
        ...DEFAULT_CONFIG,
        port: 4321,
      }),
    getServiceManager: () => makeServiceManager(false, false),
    getDaemonManager: () => makeDaemonManager(9876),
    getStoredToken: () => Promise.resolve(null),
    isTokenValid: () => false,
    fetch: () => Promise.reject(new Error("connection refused")),
    fetchGitHubCopilotQuota: () => Promise.resolve(mockUsage),
  });

  const state = await getServiceState();
  // Even if health check fails, if PID exists, we consider it running
  // (health check is best-effort; process liveness is more reliable)
  assertEquals(state.running, true);
  assertEquals(state.pid, 9876);
  assertEquals(state.copilotUsage, {
    used: 12,
    total: 100,
    remainingPercentage: 88,
    status: "authenticated",
  });
});
