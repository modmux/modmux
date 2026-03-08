import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  NetworkError,
  RateLimitError,
  SubscriptionRequiredError,
  TokenInvalidError,
} from "../../src/lib/errors.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_GITHUB_TOKEN = "ghp_fake_test_token";

function makeTokenResponse(
  overrides: Partial<
    { token: string; expires_at: string; refresh_in: number }
  > = {},
): Response {
  const body = {
    token: "tid=test123;exp=9999999999",
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min from now
    refresh_in: 1500,
    ...overrides,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Test: getToken() with no cache → fetches once and caches
// ---------------------------------------------------------------------------

Deno.test("getToken() - no cache → makes one fetch and caches result", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(makeTokenResponse());
  }) as typeof globalThis.fetch;

  try {
    const token1 = await getToken();
    const token2 = await getToken(); // second call — should use cache

    assertEquals(callCount, 1, "fetch should be called only once");
    assertEquals(
      token1.token,
      token2.token,
      "both calls should return the same token",
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: getToken() with valid cache → returns cached, zero fetch calls
// ---------------------------------------------------------------------------

Deno.test("getToken() - valid cache → returns cached token, zero fetch calls", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(makeTokenResponse());
  }) as typeof globalThis.fetch;

  try {
    await getToken(); // prime cache
    callCount = 0; // reset count

    const token = await getToken(); // should use cache
    assertEquals(
      callCount,
      0,
      "fetch should not be called when cache is valid",
    );
    assertEquals(typeof token.token, "string");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: getToken() with expired cache → re-fetches
// ---------------------------------------------------------------------------

Deno.test("getToken() - expired cache → re-fetches", async () => {
  const {
    getToken,
    clearTokenCache,
    _setTokenForTest,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  // Seed cache with an already-expired token
  _setTokenForTest({
    token: "tid=expired",
    expiresAt: Date.now() - 1000, // already expired
    refreshIn: 0,
  });

  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(makeTokenResponse());
  }) as typeof globalThis.fetch;

  try {
    const token = await getToken();
    assertEquals(callCount, 1, "should re-fetch when token is expired");
    assertEquals(token.token, "tid=test123;exp=9999999999");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: getToken() with near-expiry cache (within 60s) → re-fetches
// ---------------------------------------------------------------------------

Deno.test("getToken() - near-expiry cache (within 60s) → re-fetches", async () => {
  const {
    getToken,
    clearTokenCache,
    _setTokenForTest,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  // Token expires in 30 seconds (within the 60s safety window)
  _setTokenForTest({
    token: "tid=almost-expired",
    expiresAt: Date.now() + 30_000,
    refreshIn: 30,
  });

  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(makeTokenResponse());
  }) as typeof globalThis.fetch;

  try {
    const token = await getToken();
    assertEquals(callCount, 1, "should re-fetch when token is near-expiry");
    assertEquals(token.token, "tid=test123;exp=9999999999");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: 401 response → throws TokenInvalidError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 401 response → throws TokenInvalidError", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(new Response("Unauthorized", { status: 401 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () => getToken(),
      TokenInvalidError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: 403 response → throws SubscriptionRequiredError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 403 response → throws SubscriptionRequiredError", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(new Response("Forbidden", { status: 403 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () => getToken(),
      SubscriptionRequiredError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: 429 response → throws RateLimitError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 429 response → throws RateLimitError", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(new Response("Too Many Requests", { status: 429 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () => getToken(),
      RateLimitError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: 500 response → throws NetworkError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 500 response → throws NetworkError", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(
      new Response("Internal Server Error", { status: 500 }),
    );
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () => getToken(),
      NetworkError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: v2 404 → v1 200 fallback succeeds
// ---------------------------------------------------------------------------

Deno.test("getToken() - v2 404 then v1 200 → succeeds via fallback", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  const seenUrls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    seenUrls.push(url);

    if (url.endsWith("/copilot_internal/v2/token")) {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }

    if (url.endsWith("/copilot_internal/token")) {
      return Promise.resolve(makeTokenResponse());
    }

    return Promise.resolve(new Response("Unexpected URL", { status: 500 }));
  }) as typeof globalThis.fetch;

  try {
    const token = await getToken();
    assertEquals(typeof token.token, "string");
    assertEquals(seenUrls.length, 2);
    assertStringIncludes(seenUrls[0], "/copilot_internal/v2/token");
    assertStringIncludes(seenUrls[1], "/copilot_internal/token");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: v2 404 + v1 404 → throws diagnostic NetworkError
// ---------------------------------------------------------------------------

Deno.test("getToken() - v2 404 and v1 404 → throws diagnostic NetworkError", async () => {
  const {
    getToken,
    clearTokenCache,
    _setGitHubTokenForTest,
  } = await import("../../src/copilot/token.ts");
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);

  const seenUrls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    seenUrls.push(url);
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () => getToken(),
      NetworkError,
      "Copilot token endpoint returned HTTP 404 after trying v2 and v1",
    );
    assertEquals(seenUrls.length, 2);
    assertStringIncludes(seenUrls[0], "/copilot_internal/v2/token");
    assertStringIncludes(seenUrls[1], "/copilot_internal/token");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});
