import { dirname, join } from "@std/path";
import { configDir } from "./store.ts";
import { log } from "./log.ts";
import type { GitHubCopilotUsageData } from "./copilot-sdk.ts";

interface StatusBuckets {
  "2xx": number;
  "4xx": number;
  "5xx": number;
}

interface LatencyMetrics {
  count: number;
  min: number;
  max: number;
  avg: number;
}

export interface EndpointMetrics {
  calls: number;
  status: StatusBuckets;
  latency_ms: LatencyMetrics;
}

export interface UsageMetricsSnapshot {
  process: {
    started_at: string;
    updated_at: string;
  };
  totals: {
    requests: number;
    success: number;
    errors: number;
  };
  endpoints: Record<string, EndpointMetrics>;
  models: Record<string, number>;
  agents: Record<string, number>;
  github_copilot?: GitHubCopilotUsageData;
}

export interface UsageMetricsOptions {
  persist?: boolean;
  snapshotIntervalMs?: number;
  filePath?: string | null;
}

interface UsageMetricsRuntimeOptions {
  persist: boolean;
  snapshotIntervalMs: number;
  filePath: string;
}

interface UsageMetricDimensions {
  model?: string;
  agent?: string;
}

interface InternalState {
  startedAt: Date;
  updatedAt: Date;
  totals: {
    requests: number;
    success: number;
    errors: number;
  };
  endpoints: Record<string, EndpointMetrics>;
  models: Record<string, number>;
  agents: Record<string, number>;
}

let state: InternalState = createInitialState();
let options: UsageMetricsRuntimeOptions = defaultOptions();
let snapshotIntervalId: number | null = null;

async function fetchGitHubCopilotQuota(): Promise<
  GitHubCopilotUsageData | null
> {
  const { fetchGitHubCopilotQuota } = await import("./copilot-sdk.ts");
  return await fetchGitHubCopilotQuota();
}

async function shutdownCopilotSdkTracking(): Promise<void> {
  const { shutdownCopilotSdkTracking } = await import("./copilot-sdk.ts");
  await shutdownCopilotSdkTracking();
}

function createInitialState(): InternalState {
  const now = new Date();
  return {
    startedAt: now,
    updatedAt: now,
    totals: {
      requests: 0,
      success: 0,
      errors: 0,
    },
    endpoints: {},
    models: {},
    agents: {},
  };
}

function defaultOptions(): UsageMetricsRuntimeOptions {
  return {
    persist: false,
    snapshotIntervalMs: 60_000,
    filePath: join(configDir(), "usage.json"),
  };
}

function resolveOptions(
  initOptions?: UsageMetricsOptions,
): UsageMetricsRuntimeOptions {
  const defaults = defaultOptions();

  let filePath = defaults.filePath;
  if (
    typeof initOptions?.filePath === "string" && initOptions.filePath.trim()
  ) {
    filePath = initOptions.filePath;
  }

  return {
    persist: initOptions?.persist ?? defaults.persist,
    snapshotIntervalMs: initOptions?.snapshotIntervalMs ??
      defaults.snapshotIntervalMs,
    filePath,
  };
}

function createEndpointMetrics(): EndpointMetrics {
  return {
    calls: 0,
    status: { "2xx": 0, "4xx": 0, "5xx": 0 },
    latency_ms: { count: 0, min: 0, max: 0, avg: 0 },
  };
}

function classifyStatus(status: number): keyof StatusBuckets | null {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return null;
}

function updateLatency(metrics: LatencyMetrics, elapsedMs: number): void {
  const latency = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
  metrics.count += 1;

  if (metrics.count === 1) {
    metrics.min = latency;
    metrics.max = latency;
    metrics.avg = latency;
    return;
  }

  metrics.min = Math.min(metrics.min, latency);
  metrics.max = Math.max(metrics.max, latency);
  metrics.avg = ((metrics.avg * (metrics.count - 1)) + latency) / metrics.count;
}

function incrementDimension(
  map: Record<string, number>,
  key: string | undefined,
): void {
  if (!key || !key.trim()) return;
  map[key] = (map[key] ?? 0) + 1;
}

async function readPersistedSnapshot(
  path: string,
): Promise<UsageMetricsSnapshot | null> {
  try {
    const raw = await Deno.readTextFile(path);
    const parsed = JSON.parse(raw) as UsageMetricsSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;

    await log("warn", "Failed to read persisted usage metrics", {
      error: err instanceof Error ? err.message : String(err),
      path,
    });
    return null;
  }
}

async function persistSnapshot(): Promise<void> {
  if (!options.persist) return;

  try {
    await Deno.mkdir(dirname(options.filePath), { recursive: true });
    await Deno.writeTextFile(
      options.filePath,
      JSON.stringify(getUsageMetricsSnapshot(), null, 2) + "\n",
    );
  } catch (err) {
    await log("warn", "Failed to persist usage metrics", {
      error: err instanceof Error ? err.message : String(err),
      path: options.filePath,
    });
  }
}

export async function initializeUsageMetrics(
  initOptions?: UsageMetricsOptions,
): Promise<void> {
  options = resolveOptions(initOptions);

  if (snapshotIntervalId !== null) {
    clearInterval(snapshotIntervalId);
    snapshotIntervalId = null;
  }

  if (options.persist) {
    const persisted = await readPersistedSnapshot(options.filePath);
    if (persisted) {
      state = {
        startedAt: new Date(persisted.process.started_at),
        updatedAt: new Date(persisted.process.updated_at),
        totals: { ...persisted.totals },
        endpoints: { ...persisted.endpoints },
        models: { ...persisted.models },
        agents: { ...persisted.agents },
      };
    }

    snapshotIntervalId = setInterval(() => {
      void persistSnapshot();
    }, options.snapshotIntervalMs);
  }
}

export async function shutdownUsageMetrics(): Promise<void> {
  if (snapshotIntervalId !== null) {
    clearInterval(snapshotIntervalId);
    snapshotIntervalId = null;
  }

  await persistSnapshot();

  // Shutdown GitHub usage tracking
  await shutdownCopilotSdkTracking();
}

export function recordUsage(
  endpoint: string,
  status: number,
  elapsedMs: number,
  dimensions?: UsageMetricDimensions,
): void {
  const endpointMetrics = state.endpoints[endpoint] ?? createEndpointMetrics();
  endpointMetrics.calls += 1;

  const bucket = classifyStatus(status);
  if (bucket !== null) {
    endpointMetrics.status[bucket] += 1;
  }

  updateLatency(endpointMetrics.latency_ms, elapsedMs);
  state.endpoints[endpoint] = endpointMetrics;

  state.totals.requests += 1;
  if (status >= 200 && status < 300) {
    state.totals.success += 1;
  } else if (status >= 400) {
    state.totals.errors += 1;
  }

  incrementDimension(state.models, dimensions?.model);
  incrementDimension(state.agents, dimensions?.agent);
  state.updatedAt = new Date();
}

export function getUsageMetricsSnapshot(): UsageMetricsSnapshot {
  const endpoints: Record<string, EndpointMetrics> = {};
  for (const [endpoint, metrics] of Object.entries(state.endpoints)) {
    endpoints[endpoint] = {
      calls: metrics.calls,
      status: { ...metrics.status },
      latency_ms: {
        count: metrics.latency_ms.count,
        min: Number(metrics.latency_ms.min.toFixed(3)),
        max: Number(metrics.latency_ms.max.toFixed(3)),
        avg: Number(metrics.latency_ms.avg.toFixed(3)),
      },
    };
  }

  return {
    process: {
      started_at: state.startedAt.toISOString(),
      updated_at: state.updatedAt.toISOString(),
    },
    totals: { ...state.totals },
    endpoints,
    models: { ...state.models },
    agents: { ...state.agents },
  };
}

export async function getUsageMetricsSnapshotWithGitHub(): Promise<
  UsageMetricsSnapshot
> {
  const snapshot = getUsageMetricsSnapshot();

  try {
    await log(
      "info",
      "Attempting to fetch GitHub Copilot data for usage snapshot",
    );
    const githubData = await fetchGitHubCopilotQuota();
    if (githubData) {
      snapshot.github_copilot = githubData;
      await log(
        "info",
        "Successfully included GitHub Copilot data in usage snapshot",
        {
          status: githubData.status,
          usedRequests: githubData.quota.usedRequests,
        },
      );
    } else {
      await log(
        "warn",
        "GitHub Copilot data was null, not including in snapshot",
      );
    }
  } catch (error) {
    await log(
      "error",
      "Failed to fetch GitHub Copilot data for usage snapshot",
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    );
  }

  return snapshot;
}
