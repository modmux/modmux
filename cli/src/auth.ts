import {
  type AuthToken,
  copyToClipboard,
  createTokenStore,
  DeviceFlowTimeoutError,
  NetworkError,
  openBrowser,
  pollForToken,
  promptAndWaitForEnter,
  RateLimitError,
  startDeviceFlow,
  SubscriptionRequiredError,
  TokenExpiredError,
  TokenInvalidError,
} from "@modmux/gateway";
import { clearTokenCache, getToken } from "@modmux/providers";
import type { TokenStore } from "@modmux/gateway";
import { VERSION } from "./version.ts";

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
 * Copies the user code to clipboard, prompts for user to open browser,
 * then polls until authorized.
 */
export async function authenticate(): Promise<AuthToken> {
  try {
    const flow = await startDeviceFlow();

    console.log("\nAuthenticate with GitHub Copilot:");

    // Try to copy device code to clipboard
    let clipboardSuccess = false;
    try {
      await copyToClipboard(flow.userCode);
      console.log(
        `  Device code copied to clipboard: ${flow.userCode}`,
      );
      clipboardSuccess = true;
    } catch {
      // Clipboard unavailable; just show the code
      console.log(`  Device code: ${flow.userCode}`);
    }

    console.log(`  Visit: ${flow.verificationUri}`);

    // Prompt user to press Enter and open browser
    if (clipboardSuccess) {
      await promptAndWaitForEnter(
        "\n  Press Enter to open browser (code is in clipboard)...",
      );
    } else {
      await promptAndWaitForEnter(
        "\n  Press Enter to open browser...",
      );
    }

    // Try to open browser automatically
    try {
      await openBrowser(flow.verificationUri);
    } catch (err) {
      // Browser open failed; guide user manually
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(
        `\n  Could not open browser automatically: ${errMsg}`,
      );
      console.log(
        "  Please open manually at: " + flow.verificationUri,
      );
      if (!clipboardSuccess) {
        console.log(
          `  Device code to paste: ${flow.userCode}`,
        );
      }
    }

    console.log("\nWaiting for authorization...");

    const result = await pollForToken(flow);

    const token: AuthToken = {
      accessToken: result.accessToken,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
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

export async function logout(): Promise<void> {
  const store = getTokenStore();
  await store.clear();
  clearTokenCache();
}

export async function getGitHubUsername(
  token: AuthToken,
): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${token.accessToken}`,
        "User-Agent": `modmux/${VERSION}`,
        "Accept": "application/vnd.github+json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { login?: string };
    return typeof data.login === "string" ? data.login : null;
  } catch {
    return null;
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
