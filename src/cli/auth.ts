import {
  AuthToken,
  createTokenStore,
  DeviceFlowTimeoutError,
  NetworkError,
  pollForToken,
  RateLimitError,
  startDeviceFlow,
  SubscriptionRequiredError,
  TokenExpiredError,
  TokenInvalidError,
} from "../auth/mod.ts";
import { clearTokenCache, getToken } from "../copilot/mod.ts";
import type { TokenStore } from "../lib/token.ts";

let tokenStore: TokenStore | null = null;

function getTokenStore(): TokenStore {
  if (!tokenStore) {
    tokenStore = createTokenStore();
  }
  return tokenStore;
}

export async function getStoredToken(): Promise<AuthToken | null> {
  const store = getTokenStore();
  return await store.load();
}

export function isTokenValid(token: AuthToken | null): boolean {
  const store = getTokenStore();
  return store.isValid(token);
}

/**
 * Runs the GitHub OAuth device flow using the Copilot VS Code extension
 * client ID. This produces a token that the copilot_internal API accepts.
 * Prints the user code and verification URI, then polls until authorized.
 */
export async function authenticate(): Promise<AuthToken> {
  try {
    const flow = await startDeviceFlow();

    console.log("\nAuthenticate with GitHub Copilot:");
    console.log(`  Visit : ${flow.verificationUri}`);
    console.log(`  Code  : ${flow.userCode}\n`);
    console.log("Waiting for authorization...");

    const result = await pollForToken(flow);

    const token: AuthToken = {
      accessToken: result.accessToken,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours; re-auth after
      createdAt: Date.now(),
    };

    const store = getTokenStore();
    await store.save(token);

    return token;
  } catch (error) {
    if (
      error instanceof DeviceFlowTimeoutError ||
      error instanceof RateLimitError ||
      error instanceof NetworkError ||
      error instanceof SubscriptionRequiredError
    ) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.message.includes("rate limit")) throw new RateLimitError();
      if (
        error.message.includes("network") ||
        error.message.includes("connection")
      ) throw new NetworkError();
      if (error.message.includes("subscription")) {
        throw new SubscriptionRequiredError();
      }
    }
    throw error;
  }
}

export async function validateToken(token: AuthToken): Promise<boolean> {
  if (!token || !isTokenValid(token)) {
    return false;
  }

  try {
    clearTokenCache(); // Force a fresh exchange to avoid using a stale cache
    await getToken();
    return true;
  } catch (error) {
    if (
      error instanceof TokenExpiredError ||
      error instanceof TokenInvalidError ||
      error instanceof SubscriptionRequiredError
    ) {
      return false;
    }
    throw error;
  }
}
