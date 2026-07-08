import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  NetworkError,
  RateLimitError,
  SubscriptionRequiredError,
  TlsCertificateError,
  TokenInvalidError,
} from "@modmux/gateway";
import { clearTokenCache, getToken } from "@modmux/providers";
import { startDeviceFlow } from "@modmux/gateway";

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
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    refresh_in: 1500,
    ...overrides,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Test: getToken() with getGitHubToken option → uses provided token
// ---------------------------------------------------------------------------

Deno.test("getToken() - with getGitHubToken option → uses provided token", async () => {
  clearTokenCache();

  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(makeTokenResponse());
  }) as typeof globalThis.fetch;

  try {
    const token = await getToken({
      getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
    });

    assertEquals(callCount, 1, "fetch should be called once");
    assertEquals(token.token, "tid=test123;exp=9999999999");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: getToken() with valid cache → returns cached, zero fetch calls
// ---------------------------------------------------------------------------

Deno.test("getToken() - valid cache → returns cached token, zero fetch calls", async () => {
  clearTokenCache();

  let callCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    callCount++;
    return Promise.resolve(makeTokenResponse());
  }) as typeof globalThis.fetch;

  try {
    await getToken({
      getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
    });
    callCount = 0;

    const token = await getToken({
      getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
    });
    assertEquals(
      callCount,
      0,
      "fetch should not be called when cache is valid",
    );
    assertEquals(typeof token.token, "string");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: 401 response → throws TokenInvalidError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 401 response → throws TokenInvalidError", async () => {
  clearTokenCache();

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(new Response("Unauthorized", { status: 401 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () =>
        getToken({
          getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
        }),
      TokenInvalidError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: 403 response → throws SubscriptionRequiredError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 403 response → throws SubscriptionRequiredError", async () => {
  clearTokenCache();

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(new Response("Forbidden", { status: 403 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () =>
        getToken({
          getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
        }),
      SubscriptionRequiredError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: 429 response → throws RateLimitError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 429 response → throws RateLimitError", async () => {
  clearTokenCache();

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(new Response("Too Many Requests", { status: 429 }));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () =>
        getToken({
          getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
        }),
      RateLimitError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: 500 response → throws NetworkError
// ---------------------------------------------------------------------------

Deno.test("getToken() - 500 response → throws NetworkError", async () => {
  clearTokenCache();

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.resolve(
      new Response("Internal Server Error", { status: 500 }),
    );
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () =>
        getToken({
          getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
        }),
      NetworkError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: TLS failure → throws TlsCertificateError
// ---------------------------------------------------------------------------

Deno.test("getToken() - TLS TypeError → throws TlsCertificateError", async () => {
  clearTokenCache();

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, _init?: RequestInit) => {
    return Promise.reject(new TypeError("self-signed certificate"));
  }) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () =>
        getToken({
          getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
        }),
      TlsCertificateError,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: device flow TLS failure → throws TlsCertificateError
// ---------------------------------------------------------------------------

Deno.test(
  "startDeviceFlow() - TLS TypeError → throws TlsCertificateError",
  async () => {
    const original = globalThis.fetch;
    globalThis.fetch =
      ((_input: string | URL | Request, _init?: RequestInit) => {
        return Promise.reject(new TypeError("certificate verify failed"));
      }) as typeof globalThis.fetch;

    try {
      await assertRejects(() => startDeviceFlow(), TlsCertificateError);
    } finally {
      globalThis.fetch = original;
    }
  },
);

// ---------------------------------------------------------------------------
// Test: v2 404 → v1 200 fallback succeeds
// ---------------------------------------------------------------------------

Deno.test("getToken() - v2 404 then v1 200 → succeeds via fallback", async () => {
  clearTokenCache();

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
    const token = await getToken({
      getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
    });
    assertEquals(typeof token.token, "string");
    assertEquals(seenUrls.length, 2);
    assertStringIncludes(seenUrls[0], "/copilot_internal/v2/token");
    assertStringIncludes(seenUrls[1], "/copilot_internal/token");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: v2 404 + v1 404 → throws diagnostic NetworkError
// ---------------------------------------------------------------------------

Deno.test("getToken() - v2 404 and v1 404 → throws diagnostic NetworkError", async () => {
  clearTokenCache();

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
      () =>
        getToken({
          getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
        }),
      NetworkError,
      "Copilot token endpoint returned HTTP 404 after trying v2 and v1",
    );
    assertEquals(seenUrls.length, 2);
    assertStringIncludes(seenUrls[0], "/copilot_internal/v2/token");
    assertStringIncludes(seenUrls[1], "/copilot_internal/token");
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});
