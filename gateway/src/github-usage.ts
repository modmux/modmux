import { CopilotClient } from "@github/copilot-sdk";
import {
  ensureGitHubUsageSidecarStarted,
  resolveConfiguredGitHubUsageCliUrl,
} from "./copilot-sidecar.ts";
import { log } from "./log.ts";
import { loadConfig } from "./store.ts";
import type { GitHubUsageConfig } from "./store.ts";

// Types for GitHub Copilot quota information
export interface GitHubCopilotQuota {
  entitlementRequests: number;
  usedRequests: number;
  remainingRequests: number;
  remainingPercentage: number;
  overage: number;
  resetDate?: string;
}

export interface GitHubCopilotUsageData {
  quota: GitHubCopilotQuota;
  status: "authenticated" | "unauthenticated" | "error";
  lastUpdated: string;
}

interface GitHubQuotaSnapshot {
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  overage: number;
  resetDate?: string;
}

interface CopilotClientInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  rpc: {
    account: {
      getQuota(): Promise<{
        quotaSnapshots: Record<string, GitHubQuotaSnapshot>;
      }>;
    };
  };
}

interface GitHubUsageRuntimeDeps {
  loadConfig: typeof loadConfig;
  ensureGitHubUsageSidecarStarted: typeof ensureGitHubUsageSidecarStarted;
  resolveConfiguredGitHubUsageCliUrl: typeof resolveConfiguredGitHubUsageCliUrl;
  log: typeof log;
  now: () => number;
  createClient: (options: { cliUrl: string }) => CopilotClientInstance;
}

const defaultGitHubUsageRuntimeDeps: GitHubUsageRuntimeDeps = {
  loadConfig,
  ensureGitHubUsageSidecarStarted,
  resolveConfiguredGitHubUsageCliUrl,
  log,
  now: () => Date.now(),
  createClient: (options) =>
    new CopilotClient(options) as unknown as CopilotClientInstance,
};

let githubUsageRuntimeDeps: GitHubUsageRuntimeDeps = {
  ...defaultGitHubUsageRuntimeDeps,
};

export function __setGitHubUsageTestDeps(
  overrides: Partial<GitHubUsageRuntimeDeps>,
): void {
  githubUsageRuntimeDeps = { ...githubUsageRuntimeDeps, ...overrides };
}

export function __resetGitHubUsageTestDeps(): void {
  githubUsageRuntimeDeps = { ...defaultGitHubUsageRuntimeDeps };
}

// Cache for quota data
let cachedQuotaData: GitHubCopilotUsageData | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION_MS = 60_000; // 60 seconds, following opencode-copilot-plus pattern

// Copilot SDK client instance
let copilotClient: CopilotClient | null = null;
let copilotClientConfigKey: string | null = null;

function emptyQuota(): GitHubCopilotQuota {
  return {
    entitlementRequests: 0,
    usedRequests: 0,
    remainingRequests: 0,
    remainingPercentage: 0,
    overage: 0,
  };
}

function buildUsageData(
  status: GitHubCopilotUsageData["status"],
): GitHubCopilotUsageData {
  return {
    quota: emptyQuota(),
    status,
    lastUpdated: new Date().toISOString(),
  };
}

function isPlaceholderQuotaSnapshot(snapshot: GitHubQuotaSnapshot): boolean {
  return snapshot.entitlementRequests === 1 &&
    snapshot.usedRequests === 0 &&
    snapshot.remainingPercentage === 100 &&
    snapshot.overage === 0;
}

export function selectGitHubQuotaSnapshot(
  quotaSnapshots: Record<string, GitHubQuotaSnapshot>,
): [string, GitHubQuotaSnapshot] | null {
  const quotaEntries = Object.entries(quotaSnapshots);
  if (quotaEntries.length === 0) {
    return null;
  }

  if (
    quotaEntries.length > 1 &&
    quotaEntries.every(([, snapshot]) => isPlaceholderQuotaSnapshot(snapshot))
  ) {
    return null;
  }

  quotaEntries.sort((a, b) => {
    const [, left] = a;
    const [, right] = b;
    if (right.entitlementRequests !== left.entitlementRequests) {
      return right.entitlementRequests - left.entitlementRequests;
    }
    if (right.usedRequests !== left.usedRequests) {
      return right.usedRequests - left.usedRequests;
    }
    return a[0].localeCompare(b[0]);
  });

  return quotaEntries[0];
}

function isAuthenticationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("authentication") ||
    message.includes("invalid token") ||
    message.includes("expired token") ||
    message.includes("not logged in");
}

async function resetCopilotClient(): Promise<void> {
  if (!copilotClient) return;
  try {
    await copilotClient.stop();
  } catch (error) {
    await githubUsageRuntimeDeps.log(
      "warn",
      "Error resetting GitHub Copilot usage client",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  } finally {
    copilotClient = null;
    copilotClientConfigKey = null;
  }
}

function getClientConfigKey(cliUrl: string): string {
  return `external-cli:${cliUrl}`;
}

async function getGitHubUsageConfig(): Promise<{
  backend: GitHubUsageConfig["backend"];
  cliUrl: string | null;
  autoStart: boolean;
  preferredPort: number;
}> {
  const config = await githubUsageRuntimeDeps.loadConfig();
  return config.githubUsage;
}

export function buildGitHubUsageClientOptions(
  cliUrl: string | null,
): { cliUrl: string } | null {
  if (cliUrl === null) {
    return null;
  }
  // External Copilot CLI servers manage their own authentication.
  return { cliUrl };
}

/**
 * Initialize the GitHub Copilot SDK client for usage tracking
 */
export async function initializeGitHubUsageTracking(): Promise<
  GitHubCopilotUsageData["status"]
> {
  const githubUsage = await getGitHubUsageConfig();
  const runtimeTarget = await githubUsageRuntimeDeps
    .ensureGitHubUsageSidecarStarted(
      githubUsage,
    );
  const clientOptions = buildGitHubUsageClientOptions(runtimeTarget.cliUrl);
  if (clientOptions === null) {
    await resetCopilotClient();
    await githubUsageRuntimeDeps.log(
      "info",
      "GitHub Copilot usage tracking backend unavailable",
      {
        backend: githubUsage.backend,
        autoStart: githubUsage.autoStart,
        cliUrl: githubUsage.cliUrl,
        status: runtimeTarget.statusHint ?? "error",
      },
    );
    return runtimeTarget.statusHint ?? "error";
  }

  const configKey = getClientConfigKey(clientOptions.cliUrl);
  if (copilotClient && copilotClientConfigKey === configKey) {
    return "authenticated";
  }
  if (copilotClient && copilotClientConfigKey !== configKey) {
    await resetCopilotClient();
  }

  try {
    copilotClient = githubUsageRuntimeDeps.createClient(
      clientOptions,
    ) as unknown as CopilotClient;
    await copilotClient.start();
    copilotClientConfigKey = configKey;
    await githubUsageRuntimeDeps.log(
      "info",
      "GitHub Copilot usage tracking initialized",
    );
    return "authenticated";
  } catch (error) {
    const status = isAuthenticationError(error) ? "unauthenticated" : "error";
    await githubUsageRuntimeDeps.log(
      "warn",
      "Failed to initialize GitHub Copilot usage tracking",
      {
        backend: githubUsage.backend,
        cliUrl: clientOptions.cliUrl,
        status,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    copilotClient = null;
    copilotClientConfigKey = null;
    return status;
  }
}

/**
 * Shutdown the GitHub Copilot SDK client
 */
export async function shutdownGitHubUsageTracking(): Promise<void> {
  if (!copilotClient) {
    return;
  }

  try {
    await copilotClient.stop();
    copilotClient = null;
    await githubUsageRuntimeDeps.log(
      "info",
      "GitHub Copilot usage tracking shutdown",
    );
  } catch (error) {
    await githubUsageRuntimeDeps.log(
      "warn",
      "Error shutting down GitHub Copilot usage tracking",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

/**
 * Fetch GitHub Copilot quota data via the SDK
 * Returns cached data if fresh (< 60 seconds old)
 */
export async function fetchGitHubCopilotQuota(): Promise<
  GitHubCopilotUsageData | null
> {
  const now = githubUsageRuntimeDeps.now();
  const githubUsage = await getGitHubUsageConfig();
  const resolvedCliUrl = await githubUsageRuntimeDeps
    .resolveConfiguredGitHubUsageCliUrl(githubUsage);
  const configKey = resolvedCliUrl !== null
    ? getClientConfigKey(resolvedCliUrl)
    : `${githubUsage.backend}:${githubUsage.autoStart ? "auto" : "manual"}`;

  // Return cached data if still fresh
  if (
    cachedQuotaData && cachedQuotaData.status === "authenticated" &&
    copilotClientConfigKey === configKey &&
    (now - lastFetchTime) < CACHE_DURATION_MS
  ) {
    return cachedQuotaData;
  }

  // Initialize client if needed
  if (copilotClient && copilotClientConfigKey !== configKey) {
    await resetCopilotClient();
  }

  if (!copilotClient) {
    const status = await initializeGitHubUsageTracking();
    if (!copilotClient) {
      const usageData = buildUsageData(
        status === "authenticated" ? "error" : status,
      );
      cachedQuotaData = usageData;
      copilotClientConfigKey = configKey;
      lastFetchTime = now;
      return usageData;
    }
  }

  try {
    await githubUsageRuntimeDeps.log(
      "info",
      "Attempting to fetch GitHub Copilot quota data",
    );

    // Call the RPC method to get quota information
    const result = await copilotClient.rpc.account.getQuota();
    await githubUsageRuntimeDeps.log(
      "info",
      "Successfully received quota result",
      {
        result: JSON.stringify(result),
      },
    );

    // The result has quotaSnapshots as a Record<string, QuotaSnapshot>
    // We'll aggregate all quotas or pick the first/main one
    const selectedQuotaSnapshot = selectGitHubQuotaSnapshot(
      result.quotaSnapshots,
    );
    if (selectedQuotaSnapshot === null) {
      throw new Error("No usable quota snapshots available");
    }

    const [quotaId, snapshot] = selectedQuotaSnapshot;
    await githubUsageRuntimeDeps.log("info", "Using quota snapshot", {
      quotaId,
      snapshot,
    });

    const remainingRequests = Math.max(
      snapshot.entitlementRequests - snapshot.usedRequests,
      0,
    );

    const usageData: GitHubCopilotUsageData = {
      quota: {
        entitlementRequests: snapshot.entitlementRequests,
        usedRequests: snapshot.usedRequests,
        remainingRequests,
        remainingPercentage: snapshot.remainingPercentage,
        overage: Math.max(
          snapshot.usedRequests - snapshot.entitlementRequests,
          0,
        ),
        // resetDate is not provided in the snapshot, would need separate API call
      },
      status: "authenticated",
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result
    cachedQuotaData = usageData;
    copilotClientConfigKey = configKey;
    lastFetchTime = now;

    await githubUsageRuntimeDeps.log(
      "info",
      "Successfully fetched GitHub Copilot quota",
      {
        quotaId,
        usedRequests: usageData.quota.usedRequests,
        entitlementRequests: usageData.quota.entitlementRequests,
        remainingPercentage: usageData.quota.remainingPercentage,
      },
    );

    return usageData;
  } catch (error) {
    const status = isAuthenticationError(error) ? "unauthenticated" : "error";
    await githubUsageRuntimeDeps.log(
      "error",
      "Failed to fetch GitHub Copilot quota",
      {
        status,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    );

    await resetCopilotClient();

    const errorData = buildUsageData(status);

    // Cache the error state briefly to avoid hammering the API
    cachedQuotaData = errorData;
    copilotClientConfigKey = configKey;
    lastFetchTime = now;

    return errorData;
  }
}

/**
 * Clear the quota data cache, forcing a fresh fetch on next request
 */
export function clearQuotaCache(): void {
  cachedQuotaData = null;
  lastFetchTime = 0;
  copilotClientConfigKey = null;
}

export async function __resetGitHubUsageTestState(): Promise<void> {
  await resetCopilotClient();
  clearQuotaCache();
}

/**
 * Get cached quota data without making a network request
 * Returns null if no cached data exists
 */
export function getCachedQuotaData(): GitHubCopilotUsageData | null {
  const now = Date.now();

  if (cachedQuotaData && (now - lastFetchTime) < CACHE_DURATION_MS) {
    return cachedQuotaData;
  }

  return null;
}
