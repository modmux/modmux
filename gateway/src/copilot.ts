import { isTlsCertError, TlsCertificateError } from "./errors.ts";

const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_OAUTH_SCOPE = "read:user";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
};

export interface DeviceFlowState {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
}

export interface DeviceFlowResult {
  accessToken: string;
}

/**
 * Initiates the GitHub OAuth device flow.
 * Returns the user-facing code and URI, plus internal state for polling.
 */
export async function startDeviceFlow(): Promise<DeviceFlowState> {
  let response: Response;
  try {
    response = await fetch(DEVICE_CODE_URL, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_OAUTH_SCOPE,
      }),
    });
  } catch (err) {
    if (isTlsCertError(err)) {
      console.error(
        "[modmux] TLS certificate error during device flow. " +
          "On corporate networks, try: DENO_TLS_CA_STORE=system modmux start",
      );
      throw new TlsCertificateError();
    }
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to start device flow: HTTP ${response.status} — ${body}`,
    );
  }

  const data = await response.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresAt: Date.now() + data.expires_in * 1000,
    interval: data.interval,
  };
}

/**
 * Polls until the user authorizes the device or the flow expires.
 * Returns the GitHub OAuth access token on success.
 * Throws if expired or on unrecoverable error.
 */
export async function pollForToken(
  state: DeviceFlowState,
): Promise<DeviceFlowResult> {
  // Poll interval: add 1s buffer per GitHub spec to avoid rate limits
  const intervalMs = (state.interval + 1) * 1000;

  while (Date.now() < state.expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    let response: Response;
    try {
      response = await fetch(ACCESS_TOKEN_URL, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: state.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
    } catch (err) {
      if (isTlsCertError(err)) {
        console.error(
          "[modmux] TLS certificate error during token poll. " +
            "On corporate networks, try: DENO_TLS_CA_STORE=system modmux start",
        );
        throw new TlsCertificateError();
      }
      throw err;
    }

    if (!response.ok) {
      // Non-2xx is transient; keep polling
      await response.body?.cancel();
      continue;
    }

    const data = await response.json() as {
      access_token?: string;
      error?: string;
    };

    if (data.access_token) {
      return { accessToken: data.access_token };
    }

    if (data.error === "expired_token") {
      throw new Error(
        "Device flow expired. Please run modmux again to re-authenticate.",
      );
    }

    // "authorization_pending" and "slow_down" → keep polling
  }

  throw new Error(
    "Device flow timed out. Please run modmux again to re-authenticate.",
  );
}

/**
 * No-op stub retained for backwards compatibility with callers.
 * The HTTP-based Copilot client has no persistent connection to close.
 */
export async function stopClient(): Promise<void> {}
