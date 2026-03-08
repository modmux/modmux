import {
  NetworkError,
  RateLimitError,
  SubscriptionRequiredError,
  TokenInvalidError,
} from "../lib/errors.ts";
import { createTokenStore } from "../lib/token.ts";
import {
  COPILOT_API_VERSION,
  COPILOT_PLUGIN_VERSION,
  VSCODE_VERSION,
} from "./types.ts";
import type { CopilotToken } from "./types.ts";

// ---------------------------------------------------------------------------
// Module-level in-memory cache
// ---------------------------------------------------------------------------

let cachedToken: CopilotToken | null = null;

/**
 * Test-only override for the GitHub OAuth token.
 * When non-null, bypasses the disk-based TokenStore entirely.
 * @internal
 */
let _testGitHubToken: string | null = null;

/** Returns true if the token is still fresh (more than 60s until expiry). */
function isTokenFresh(t: CopilotToken): boolean {
  return t.expiresAt - Date.now() > 60_000;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

const TOKEN_ENDPOINT_V2 = "https://api.github.com/copilot_internal/v2/token";
const TOKEN_ENDPOINT_V1 = "https://api.github.com/copilot_internal/token";

function debugEnabled(): boolean {
  try {
    return Deno.env.get("DEBUG_CLAUDIO") === "1";
  } catch {
    return false;
  }
}

async function fetchTokenEndpoint(
  endpoint: string,
  githubToken: string,
): Promise<Response> {
  if (debugEnabled()) {
    console.error(`[claudio] Token exchange attempt: ${endpoint}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "editor-version": `vscode/${VSCODE_VERSION}`,
      "editor-plugin-version": `copilot-chat/${COPILOT_PLUGIN_VERSION}`,
      "user-agent": `GitHubCopilotChat/${COPILOT_PLUGIN_VERSION}`,
      "x-github-api-version": COPILOT_API_VERSION,
      "x-vscode-user-agent-library-version": "electron-fetch",
    },
  });

  if (debugEnabled()) {
    console.error(
      `[claudio] Token exchange response: ${endpoint} -> HTTP ${response.status}`,
    );
  }

  return response;
}

/**
 * Exchange a GitHub OAuth token for a short-lived Copilot API bearer token.
 * Maps HTTP errors to the appropriate error types from src/lib/errors.ts.
 */
export async function exchangeToken(
  githubToken: string,
): Promise<CopilotToken> {
  let response = await fetchTokenEndpoint(TOKEN_ENDPOINT_V2, githubToken);

  // Compatibility fallback: retry v1 if v2 is not available.
  if (response.status === 404) {
    await response.body?.cancel();
    if (debugEnabled()) {
      console.error("[claudio] Falling back to v1 Copilot token endpoint");
    }
    response = await fetchTokenEndpoint(TOKEN_ENDPOINT_V1, githubToken);
  }

  if (!response.ok) {
    // Consume body to avoid resource leaks
    await response.body?.cancel();

    if (response.status === 401) throw new TokenInvalidError();
    if (response.status === 403) throw new SubscriptionRequiredError();
    if (response.status === 429) throw new RateLimitError();
    if (response.status === 404) {
      throw new NetworkError(
        "Copilot token endpoint returned HTTP 404 after trying v2 and v1. Verify Copilot access/subscription and proxy/network routing to api.github.com.",
      );
    }
    if (response.status >= 500) {
      throw new NetworkError("GitHub API unavailable");
    }
    throw new NetworkError(`Token exchange failed: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    token: string;
    expires_at: string;
    refresh_in?: number;
  };

  return {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
    refreshIn: data.refresh_in ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a fresh Copilot API token, using the in-memory cache when possible.
 * Loads the GitHub OAuth token from the disk-based TokenStore (or test override).
 */
export async function getToken(): Promise<CopilotToken> {
  if (cachedToken && isTokenFresh(cachedToken)) {
    return cachedToken;
  }

  let githubToken: string | undefined;

  if (_testGitHubToken !== null) {
    // Test override: skip disk/env I/O entirely
    githubToken = _testGitHubToken;
  } else {
    const tokenStore = createTokenStore();
    const authToken = await tokenStore.load();
    githubToken = authToken?.accessToken;
  }

  if (!githubToken) {
    throw new TokenInvalidError();
  }

  cachedToken = await exchangeToken(githubToken);
  return cachedToken;
}

/** Resets the in-memory cache. Exported for use in tests. */
export function clearTokenCache(): void {
  cachedToken = null;
}

/**
 * Directly sets the cached Copilot token. Exported for use in tests only.
 * @internal
 */
export function _setTokenForTest(token: CopilotToken): void {
  cachedToken = token;
}

/**
 * Sets a test-only GitHub OAuth token override, bypassing the disk-based TokenStore.
 * Pass `null` to restore the default TokenStore behaviour.
 * @internal
 */
export function _setGitHubTokenForTest(token: string | null): void {
  _testGitHubToken = token;
}
