import { assertEquals } from "@std/assert";
import {
  __resetGitHubUsageTestDeps,
  __resetGitHubUsageTestState,
  __setGitHubUsageTestDeps,
  buildGitHubUsageClientOptions,
  fetchGitHubCopilotQuota,
  selectGitHubQuotaSnapshot,
  shutdownGitHubUsageTracking,
} from "../../gateway/src/github-usage.ts";
import { DEFAULT_CONFIG } from "@modmux/gateway";

class MockCopilotClient {
  startCalls = 0;
  stopCalls = 0;
  quotaCalls = 0;

  constructor(
    private readonly snapshotsFactory: () => Record<string, {
      entitlementRequests: number;
      usedRequests: number;
      remainingPercentage: number;
      overage: number;
    }>,
  ) {}

  start(): Promise<void> {
    this.startCalls += 1;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopCalls += 1;
    return Promise.resolve();
  }

  rpc = {
    account: {
      getQuota: (): Promise<{
        quotaSnapshots: Record<string, {
          entitlementRequests: number;
          usedRequests: number;
          remainingPercentage: number;
          overage: number;
        }>;
      }> => {
        this.quotaCalls += 1;
        return Promise.resolve({ quotaSnapshots: this.snapshotsFactory() });
      },
    },
  };
}

function githubUsageConfig() {
  return {
    ...DEFAULT_CONFIG,
    githubUsage: {
      backend: "external-cli" as const,
      cliUrl: null,
      autoStart: true,
      preferredPort: 4321,
    },
  };
}

Deno.test.afterEach(async () => {
  await shutdownGitHubUsageTracking();
  await __resetGitHubUsageTestState();
  __resetGitHubUsageTestDeps();
});

Deno.test("buildGitHubUsageClientOptions returns null for missing cliUrl", () => {
  const options = buildGitHubUsageClientOptions(null);
  assertEquals(options, null);
});

Deno.test("buildGitHubUsageClientOptions returns external cliUrl only", () => {
  const options = buildGitHubUsageClientOptions("127.0.0.1:4321");

  assertEquals(options, { cliUrl: "127.0.0.1:4321" });
});

Deno.test("selectGitHubQuotaSnapshot ignores repeated placeholder quotas", () => {
  const snapshot = selectGitHubQuotaSnapshot({
    chat: {
      entitlementRequests: 1,
      usedRequests: 0,
      remainingPercentage: 100,
      overage: 0,
    },
    completions: {
      entitlementRequests: 1,
      usedRequests: 0,
      remainingPercentage: 100,
      overage: 0,
    },
    premium_interactions: {
      entitlementRequests: 1,
      usedRequests: 0,
      remainingPercentage: 100,
      overage: 0,
    },
  });

  assertEquals(snapshot, null);
});

Deno.test("selectGitHubQuotaSnapshot prefers the largest real quota", () => {
  const snapshot = selectGitHubQuotaSnapshot({
    chat: {
      entitlementRequests: 30,
      usedRequests: 10,
      remainingPercentage: 67,
      overage: 0,
    },
    completions: {
      entitlementRequests: 300,
      usedRequests: 25,
      remainingPercentage: 92,
      overage: 0,
    },
  });

  assertEquals(snapshot, [
    "completions",
    {
      entitlementRequests: 300,
      usedRequests: 25,
      remainingPercentage: 92,
      overage: 0,
    },
  ]);
});

Deno.test("fetchGitHubCopilotQuota returns error when all snapshots are placeholders", async () => {
  const client = new MockCopilotClient(() => ({
    chat: {
      entitlementRequests: 1,
      usedRequests: 0,
      remainingPercentage: 100,
      overage: 0,
    },
    completions: {
      entitlementRequests: 1,
      usedRequests: 0,
      remainingPercentage: 100,
      overage: 0,
    },
  }));

  __setGitHubUsageTestDeps({
    loadConfig: () => Promise.resolve(githubUsageConfig()),
    ensureGitHubUsageSidecarStarted: () =>
      Promise.resolve({
        cliUrl: "127.0.0.1:4321",
        statusHint: null,
      }),
    resolveConfiguredGitHubUsageCliUrl: () => Promise.resolve("127.0.0.1:4321"),
    createClient: () => client,
    log: () => Promise.resolve(),
  });

  const usage = await fetchGitHubCopilotQuota();
  assertEquals(usage?.status, "error");
  assertEquals(client.startCalls, 1);
  assertEquals(client.quotaCalls, 1);
});

Deno.test("fetchGitHubCopilotQuota reuses cached data for the same cliUrl", async () => {
  const client = new MockCopilotClient(() => ({
    completions: {
      entitlementRequests: 300,
      usedRequests: 25,
      remainingPercentage: 92,
      overage: 0,
    },
  }));

  __setGitHubUsageTestDeps({
    loadConfig: () => Promise.resolve(githubUsageConfig()),
    ensureGitHubUsageSidecarStarted: () =>
      Promise.resolve({
        cliUrl: "127.0.0.1:4321",
        statusHint: null,
      }),
    resolveConfiguredGitHubUsageCliUrl: () => Promise.resolve("127.0.0.1:4321"),
    createClient: () => client,
    log: () => Promise.resolve(),
  });

  const first = await fetchGitHubCopilotQuota();
  const second = await fetchGitHubCopilotQuota();

  assertEquals(first?.quota.entitlementRequests, 300);
  assertEquals(second?.quota.entitlementRequests, 300);
  assertEquals(client.startCalls, 1);
  assertEquals(client.quotaCalls, 1);
});

Deno.test("fetchGitHubCopilotQuota resets the client when the resolved cliUrl changes", async () => {
  let currentCliUrl = "127.0.0.1:4321";
  const createdClients: MockCopilotClient[] = [];

  __setGitHubUsageTestDeps({
    loadConfig: () => Promise.resolve(githubUsageConfig()),
    ensureGitHubUsageSidecarStarted: () =>
      Promise.resolve({
        cliUrl: currentCliUrl,
        statusHint: null,
      }),
    resolveConfiguredGitHubUsageCliUrl: () => Promise.resolve(currentCliUrl),
    createClient: () => {
      const client = new MockCopilotClient(() => ({
        completions: {
          entitlementRequests: currentCliUrl.endsWith("4321") ? 300 : 150,
          usedRequests: currentCliUrl.endsWith("4321") ? 25 : 10,
          remainingPercentage: currentCliUrl.endsWith("4321") ? 92 : 93,
          overage: 0,
        },
      }));
      createdClients.push(client);
      return client;
    },
    log: () => Promise.resolve(),
  });

  const first = await fetchGitHubCopilotQuota();
  currentCliUrl = "127.0.0.1:5000";
  const second = await fetchGitHubCopilotQuota();

  assertEquals(first?.quota.entitlementRequests, 300);
  assertEquals(second?.quota.entitlementRequests, 150);
  assertEquals(createdClients.length, 2);
  assertEquals(createdClients[0].stopCalls, 1);
  assertEquals(createdClients[1].startCalls, 1);
});
