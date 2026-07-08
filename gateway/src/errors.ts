export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class TokenExpiredError extends AuthError {
  constructor() {
    super("Authentication token has expired", "TOKEN_EXPIRED");
    this.name = "TokenExpiredError";
  }
}

export class TokenInvalidError extends AuthError {
  constructor() {
    super("Authentication token is invalid", "TOKEN_INVALID");
    this.name = "TokenInvalidError";
  }
}

export class DeviceFlowTimeoutError extends AuthError {
  constructor() {
    super("Authentication timed out. Please try again.", "DEVICE_FLOW_TIMEOUT");
    this.name = "DeviceFlowTimeoutError";
  }
}

export class NetworkError extends AuthError {
  constructor(
    message = "Network error. Check your connection and proxy settings.",
  ) {
    super(message, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}

export class RateLimitError extends AuthError {
  constructor() {
    super("Too many requests. Please wait and try again.", "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class SubscriptionRequiredError extends AuthError {
  constructor() {
    super("GitHub Copilot subscription required", "SUBSCRIPTION_REQUIRED");
    this.name = "SubscriptionRequiredError";
  }
}

export class TlsCertificateError extends NetworkError {
  constructor() {
    super(
      "TLS certificate error detected (likely a corporate proxy or VPN). " +
        "Try: DENO_TLS_CA_STORE=system modmux start — " +
        "see docs/troubleshooting.md for details.",
    );
    this.name = "TlsCertificateError";
  }
}

const TLS_ERROR_PATTERNS = ["cert", "certificate", "tls", "ssl", "self-signed"];

/** Returns true if `err` is a TLS/certificate-related TypeError. */
export function isTlsCertError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return TLS_ERROR_PATTERNS.some((p) => msg.includes(p));
}
