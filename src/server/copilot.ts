import {
  chat as copilotChat,
  chatStream as copilotChatStream,
} from "../copilot/mod.ts";
import type {
  CountTokensResponse,
  Message,
  ProxyRequest,
  ProxyResponse,
  StreamEvent,
} from "./types.ts";
import { generateMessageId } from "./types.ts";

/**
 * No-op stub retained for backwards compatibility with callers in tests/contract/proxy_test.ts.
 * The HTTP-based Copilot client has no persistent connection to close.
 */
export async function stopClient(): Promise<void> {}

export async function chat(request: ProxyRequest): Promise<ProxyResponse> {
  return await copilotChat(request);
}

export async function chatStream(
  request: ProxyRequest,
  onChunk: (event: StreamEvent) => void,
): Promise<void> {
  await copilotChatStream(request, onChunk);
}

export function countTokens(
  request: { model: string; messages: Message[] },
): CountTokensResponse {
  const prompt = messagesToText(request);
  const tokens = estimateTokens(prompt);

  return {
    id: generateMessageId(),
    type: "message",
    role: "assistant",
    content: [],
    model: request.model,
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: tokens,
      output_tokens: 0,
    },
  };
}

/** Converts messages to a plain text representation for token estimation. */
function messagesToText(
  request: { system?: string; messages: Message[] },
): string {
  const parts: string[] = [];

  if (request.system) {
    parts.push(`System: ${request.system}`);
  }

  for (const msg of request.messages) {
    const label = msg.role === "user" ? "User" : "Assistant";
    parts.push(`${label}: ${msg.content}`);
  }

  return parts.join("\n\n");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
