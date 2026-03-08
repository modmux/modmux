/**
 * OpenAI-compatible types used by the Copilot HTTP client.
 * These are internal to src/copilot/ — the Anthropic-facing types remain in src/server/types.ts.
 */

// ---------------------------------------------------------------------------
// Version constants (shared by token.ts and client.ts)
// ---------------------------------------------------------------------------

export const VSCODE_VERSION = "1.104.3";
export const COPILOT_PLUGIN_VERSION = "0.26.7";
export const COPILOT_API_VERSION = "2025-04-01";

/** Default Copilot model used when the /models endpoint is unreachable. */
export const DEFAULT_COPILOT_MODEL = "claude-sonnet-4-6";

export interface CopilotToken {
  /** Bearer token value (e.g. "tid=abc123;...") */
  token: string;
  /** Expiry as milliseconds since epoch (parsed from expires_at ISO string) */
  expiresAt: number;
  /** Seconds until refresh is recommended (from refresh_in field) */
  refreshIn: number;
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: "stop" | "length" | null;
}

export interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

export interface OpenAIStreamDelta {
  role?: "assistant";
  content?: string;
}

export interface OpenAIStreamChoice {
  index: number;
  delta: OpenAIStreamDelta;
  finish_reason: "stop" | "length" | null;
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  choices: OpenAIStreamChoice[];
}

/**
 * Maps OpenAI finish_reason to Anthropic stop_reason.
 * "stop" → "end_turn", "length" → "max_tokens", null → null
 */
export function finishReasonToStopReason(
  r: string | null,
): "end_turn" | "max_tokens" | null {
  if (r === "stop") return "end_turn";
  if (r === "length") return "max_tokens";
  return null;
}
