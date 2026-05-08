import { log } from "./log.ts";
import { createTokenStore } from "./token.ts";
import type { AuthToken, TokenStore } from "./token.ts";

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
  entitlement: number;
  remaining: number;
  unlimited: boolean;
  overage_count: number;
  overage_permitted: boolean;
  percent_remaining: number;
  quota_id?: string;
  reset_date?: string;
}

interface GitHubCopilotUserInfo {
  quota_reset_date?: string;
  quota_snapshots?: Record<string, GitHubQuotaSnapshot>;
}

interface CopilotSdkRuntimeDeps {
  log: typeof log;
  now: () => number;
  createTokenStore: typeof createTokenStore;
  fetch: typeof fetch;
}

const defaultCopilotSdkRuntimeDeps: CopilotSdkRuntimeDeps = {
  log,
  now: () => Date.now(),
  createTokenStore,
  fetch,
};

let copilotSdkRuntimeDeps: CopilotSdkRuntimeDeps = {
  ...defaultCopilotSdkRuntimeDeps,
};

export function __setCopilotSdkTestDeps(
  overrides: Partial<CopilotSdkRuntimeDeps>,
): void {
  copilotSdkRuntimeDeps = { ...copilotSdkRuntimeDeps, ...overrides };
}

export function __resetCopilotSdkTestDeps(): void {
  copilotSdkRuntimeDeps = { ...defaultCopilotSdkRuntimeDeps };
}

let cachedQuotaData: GitHubCopilotUsageData | null = null;
let lastFetchTime = 0;
let cachedTokenFingerprint: string | null = null;
const CACHE_DURATION_MS = 60_000;

let tokenStore: TokenStore | null = null;

function getTokenStore(): TokenStore {
  if (!tokenStore) {
    tokenStore = copilotSdkRuntimeDeps.createTokenStore();
  }
  return tokenStore;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuotaSnapshot(value: unknown): value is GitHubQuotaSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.entitlement === "number" &&
    typeof value.remaining === "number" &&
    typeof value.unlimited === "boolean" &&
    typeof value.overage_count === "number" &&
    typeof value.overage_permitted === "boolean" &&
    typeof value.percent_remaining === "number" &&
    (value.quota_id === undefined || typeof value.quota_id === "string") &&
    (value.reset_date === undefined || typeof value.reset_date === "string");
}

function isPlaceholderQuotaSnapshot(snapshot: GitHubQuotaSnapshot): boolean {
  return snapshot.entitlement === 1 &&
    snapshot.remaining === 0 &&
    snapshot.percent_remaining === 100 &&
    snapshot.overage_count === 0;
}

export function selectGitHubQuotaSnapshot(
  quotaSnapshots: Record<string, GitHubQuotaSnapshot>,
): [string, GitHubQuotaSnapshot] | null {
  const quotaEntries = Object.entries(quotaSnapshots);
  if (quotaEntries.length === 0) return null;

  if (
    quotaEntries.length > 1 &&
    quotaEntries.every(([, snapshot]) => isPlaceholderQuotaSnapshot(snapshot))
  ) {
    return null;
  }

  quotaEntries.sort((a, b) => {
    const [, left] = a;
    const [, right] = b;
    if (right.entitlement !== left.entitlement) {
      return right.entitlement - left.entitlement;
    }
    if (right.remaining !== left.remaining) {
      return right.remaining - left.remaining;
    }
    return a[0].localeCompare(b[0]);
  });

  return quotaEntries[0];
}

function getQuotaSnapshots(
  user: GitHubCopilotUserInfo,
): Record<string, GitHubQuotaSnapshot> | null {
  if (!isRecord(user.quota_snapshots)) return null;

  const snapshots: Record<string, GitHubQuotaSnapshot> = {};
  for (const [key, value] of Object.entries(user.quota_snapshots)) {
    if (isQuotaSnapshot(value)) {
      snapshots[key] = value;
    }
  }

  return Object.keys(snapshots).length > 0 ? snapshots : null;
}

function toUsageData(
  user: GitHubCopilotUserInfo,
  selected: [string, GitHubQuotaSnapshot],
): GitHubCopilotUsageData {
  const [, snapshot] = selected;
  const usedRequests = Math.max(snapshot.entitlement - snapshot.remaining, 0);
  return {
    quota: {
      entitlementRequests: snapshot.entitlement,
      usedRequests,
      remainingRequests: Math.max(snapshot.remaining, 0),
      remainingPercentage: snapshot.percent_remaining,
      overage: snapshot.overage_count,
      resetDate: user.quota_reset_date ?? snapshot.reset_date,
    },
    status: "authenticated",
    lastUpdated: new Date().toISOString(),
  };
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

async function loadStoredToken(): Promise<AuthToken | null> {
  return await getTokenStore().load();
}

function tokenFingerprint(token: AuthToken): string {
  return `${token.accessToken}:${token.expiresAt}`;
}

function cacheUsageData(
  fingerprint: string,
  data: GitHubCopilotUsageData,
): GitHubCopilotUsageData {
  cachedQuotaData = data;
  cachedTokenFingerprint = fingerprint;
  lastFetchTime = copilotSdkRuntimeDeps.now();
  return data;
}

async function fetchCopilotUser(
  accessToken: string,
): Promise<GitHubCopilotUserInfo | null> {
  const response = await copilotSdkRuntimeDeps.fetch(
    "https://api.github.com/copilot_internal/user",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "modmux",
      },
    },
  );

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(body || `HTTP ${response.status}`);
    }

    throw new Error(body || `HTTP ${response.status}`);
  }

  const parsed = await response.json() as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Invalid Copilot usage payload");
  }

  return {
    quota_reset_date: typeof parsed.quota_reset_date === "string"
      ? parsed.quota_reset_date
      : undefined,
    quota_snapshots: isRecord(parsed.quota_snapshots)
      ? Object.fromEntries(
        Object.entries(parsed.quota_snapshots).filter(([, value]) =>
          isQuotaSnapshot(value)
        ) as Array<[string, GitHubQuotaSnapshot]>,
      )
      : undefined,
  };
}

async function fetchInternalUsage(
  token: AuthToken,
): Promise<GitHubCopilotUsageData> {
  const fingerprint = tokenFingerprint(token);

  if (
    cachedQuotaData &&
    cachedTokenFingerprint === fingerprint &&
    cachedQuotaData.status === "authenticated" &&
    (copilotSdkRuntimeDeps.now() - lastFetchTime) < CACHE_DURATION_MS
  ) {
    return cachedQuotaData;
  }

  try {
    const user = await fetchCopilotUser(token.accessToken);
    if (!user) {
      return buildUsageData("error");
    }

    const snapshots = getQuotaSnapshots(user);
    if (!snapshots) {
      return buildUsageData("error");
    }

    const selected = selectGitHubQuotaSnapshot(snapshots);
    if (selected === null) {
      return buildUsageData("error");
    }

    return cacheUsageData(fingerprint, toUsageData(user, selected));
  } catch (error) {
    const status = isAuthenticationError(error) ? "unauthenticated" : "error";
    await copilotSdkRuntimeDeps.log("warn", "Failed to fetch Copilot quota", {
      status,
      error: error instanceof Error ? error.message : String(error),
    });
    return buildUsageData(status);
  }
}

export async function initializeCopilotSdkTracking(): Promise<
  GitHubCopilotUsageData["status"]
> {
  const token = await loadStoredToken();
  if (!token || token.expiresAt <= Date.now()) return "unauthenticated";
  return "authenticated";
}

export function shutdownCopilotSdkTracking(): void {
  // Nothing persistent to stop.
}

export async function fetchGitHubCopilotQuota(): Promise<
  GitHubCopilotUsageData | null
> {
  const token = await loadStoredToken();
  if (!token || token.expiresAt <= Date.now()) {
    return buildUsageData("unauthenticated");
  }

  return await fetchInternalUsage(token);
}

export function clearQuotaCache(): void {
  cachedQuotaData = null;
  lastFetchTime = 0;
  cachedTokenFingerprint = null;
}

export function __resetCopilotSdkTestState(): void {
  clearQuotaCache();
  tokenStore = null;
}

export function getCachedQuotaData(): GitHubCopilotUsageData | null {
  const now = Date.now();
  if (cachedQuotaData && (now - lastFetchTime) < CACHE_DURATION_MS) {
    return cachedQuotaData;
  }
  return null;
}
