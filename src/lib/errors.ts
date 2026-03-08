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
