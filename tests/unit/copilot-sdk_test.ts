import { assertEquals } from "@std/assert";
import {
  __resetCopilotSdkTestDeps,
  __resetCopilotSdkTestState,
  __setCopilotSdkTestDeps,
  fetchGitHubCopilotQuota,
  selectGitHubQuotaSnapshot,
} from "../../gateway/src/copilot-sdk.ts";
import type { AuthToken, TokenStore } from "../../gateway/src/token.ts";

type QuotaSnapshot = {
  entitlement: number;
  remaining: number;
  unlimited: boolean;
  overage_count: number;
  overage_permitted: boolean;
  percent_remaining: number;
  quota_id?: string;
  reset_date?: string;
};

function token(overrides?: Partial<AuthToken>): AuthToken {
  return {
    accessToken: "copilot-token",
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeTokenStore(tokenValue: AuthToken | null): TokenStore {
  return {
    save: () => Promise.resolve(),
    load: () => Promise.resolve(tokenValue),
    clear: () => Promise.resolve(),
    isValid: (value) => !!value && value.expiresAt > Date.now(),
  };
}

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setDeps(options: {
  tokenValue: AuthToken | null;
  fetchImpl?: typeof fetch;
}) {
  __setCopilotSdkTestDeps({
    createTokenStore: () => makeTokenStore(options.tokenValue),
    fetch: options.fetchImpl ?? fetch,
    log: () => Promise.resolve(),
  });
}

Deno.test.afterEach(async () => {
  await __resetCopilotSdkTestState();
  __resetCopilotSdkTestDeps();
});

Deno.test("selectGitHubQuotaSnapshot ignores repeated placeholder quotas", () => {
  const snapshot = selectGitHubQuotaSnapshot({
    chat: {
      entitlement: 1,
      remaining: 0,
      unlimited: false,
      overage_count: 0,
      overage_permitted: false,
      percent_remaining: 100,
    },
    completions: {
      entitlement: 1,
      remaining: 0,
      unlimited: false,
      overage_count: 0,
      overage_permitted: false,
      percent_remaining: 100,
    },
  });

  assertEquals(snapshot, null);
});

Deno.test("selectGitHubQuotaSnapshot prefers the largest real quota", () => {
  const snapshot = selectGitHubQuotaSnapshot({
    chat: {
      entitlement: 30,
      remaining: 20,
      unlimited: false,
      overage_count: 0,
      overage_permitted: false,
      percent_remaining: 67,
    },
    completions: {
      entitlement: 300,
      remaining: 275,
      unlimited: false,
      overage_count: 0,
      overage_permitted: false,
      percent_remaining: 92,
    },
  });

  assertEquals(snapshot, [
    "completions",
    {
      entitlement: 300,
      remaining: 275,
      unlimited: false,
      overage_count: 0,
      overage_permitted: false,
      percent_remaining: 92,
    },
  ]);
});

Deno.test("fetchGitHubCopilotQuota returns error when all snapshots are placeholders", async () => {
  let fetchCalls = 0;
  setDeps({
    tokenValue: token(),
    fetchImpl: () => {
      fetchCalls += 1;
      return Promise.resolve(makeResponse({
        quota_reset_date: "2026-05-07T00:00:00.000Z",
        quota_snapshots: {
          chat: {
            entitlement: 1,
            remaining: 0,
            unlimited: false,
            overage_count: 0,
            overage_permitted: false,
            percent_remaining: 100,
          },
          completions: {
            entitlement: 1,
            remaining: 0,
            unlimited: false,
            overage_count: 0,
            overage_permitted: false,
            percent_remaining: 100,
          },
        },
      }));
    },
  });

  const usage = await fetchGitHubCopilotQuota();
  assertEquals(usage?.status, "error");
  assertEquals(fetchCalls, 1);
});

Deno.test("fetchGitHubCopilotQuota reuses cached data", async () => {
  let fetchCalls = 0;
  setDeps({
    tokenValue: token(),
    fetchImpl: () => {
      fetchCalls += 1;
      return Promise.resolve(makeResponse({
        quota_reset_date: "2026-05-07T00:00:00.000Z",
        quota_snapshots: {
          completions: {
            entitlement: 300,
            remaining: 275,
            unlimited: false,
            overage_count: 0,
            overage_permitted: false,
            percent_remaining: 92,
          },
        },
      }));
    },
  });

  const first = await fetchGitHubCopilotQuota();
  const second = await fetchGitHubCopilotQuota();

  assertEquals(first?.quota.entitlementRequests, 300);
  assertEquals(second?.quota.entitlementRequests, 300);
  assertEquals(fetchCalls, 1);
});

Deno.test("fetchGitHubCopilotQuota resets cache after token change", async () => {
  let currentToken = token({ accessToken: "copilot-token-a" });
  let fetchCalls = 0;

  setDeps({
    tokenValue: null,
    fetchImpl: () => {
      fetchCalls += 1;
      return Promise.resolve(makeResponse({
        quota_reset_date: "2026-05-07T00:00:00.000Z",
        quota_snapshots: {
          completions: {
            entitlement: 120,
            remaining: 100,
            unlimited: false,
            overage_count: 0,
            overage_permitted: false,
            percent_remaining: 83,
          },
        },
      }));
    },
  });
  __setCopilotSdkTestDeps({
    createTokenStore: () => ({
      save: () => Promise.resolve(),
      load: () => Promise.resolve(currentToken),
      clear: () => Promise.resolve(),
      isValid: (value) => !!value && value.expiresAt > Date.now(),
    }),
  });

  const first = await fetchGitHubCopilotQuota();
  currentToken = token({ accessToken: "copilot-token-b" });

  const second = await fetchGitHubCopilotQuota();

  assertEquals(first?.status, "authenticated");
  assertEquals(second?.status, "authenticated");
  assertEquals(fetchCalls, 2);
});

Deno.test("fetchGitHubCopilotQuota maps auth failures to unauthenticated", async () => {
  setDeps({
    tokenValue: token(),
    fetchImpl: () =>
      Promise.resolve(makeResponse({ message: "Unauthorized" }, 401)),
  });

  const usage = await fetchGitHubCopilotQuota();
  assertEquals(usage?.status, "unauthenticated");
});
