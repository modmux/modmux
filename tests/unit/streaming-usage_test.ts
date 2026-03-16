import { assertEquals, assertNotEquals } from "@std/assert";
import {
  countTokens,
  estimateTokens,
  messagesToText,
} from "../../src/server/copilot.ts";
import {
  anthropicStreamEventToOpenAI,
  makeStreamState,
} from "../../src/server/openai-translate.ts";
import type { StreamEvent } from "../../src/server/types.ts";

// ---------------------------------------------------------------------------
// countTokens — system field support (Phase 2)
// ---------------------------------------------------------------------------

Deno.test("countTokens — includes system prompt in token estimate", () => {
  const withSystem = countTokens({
    model: "claude-sonnet-4-6",
    system: "You are a helpful assistant with a long system prompt.",
    messages: [{ role: "user", content: "Hi" }],
  });
  const withoutSystem = countTokens({
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "Hi" }],
  });
  // System prompt adds tokens
  assertNotEquals(
    withSystem.usage.input_tokens,
    withoutSystem.usage.input_tokens,
  );
  // With system should always be >= without
  assertEquals(
    withSystem.usage.input_tokens >= withoutSystem.usage.input_tokens,
    true,
  );
});

Deno.test("countTokens — output_tokens is always 0", () => {
  const result = countTokens({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello world" }],
  });
  assertEquals(result.usage.output_tokens, 0);
});

Deno.test("countTokens — non-empty message yields non-zero input_tokens", () => {
  const result = countTokens({
    model: "gpt-4o",
    messages: [{ role: "user", content: "This is a test message" }],
  });
  assertNotEquals(result.usage.input_tokens, 0);
});

Deno.test("countTokens — empty messages yields zero input_tokens", () => {
  const result = countTokens({ model: "gpt-4o", messages: [] });
  assertEquals(result.usage.input_tokens, 0);
});

// ---------------------------------------------------------------------------
// messagesToText — system field prepended
// ---------------------------------------------------------------------------

Deno.test("messagesToText — system field is prepended", () => {
  const text = messagesToText({
    system: "Be concise.",
    messages: [{ role: "user", content: "Hello" }],
  });
  assertEquals(text.startsWith("System: Be concise."), true);
  assertEquals(text.includes("User: Hello"), true);
});

Deno.test("messagesToText — no system field produces no System: prefix", () => {
  const text = messagesToText({
    messages: [{ role: "user", content: "Hello" }],
  });
  assertEquals(text.startsWith("System:"), false);
  assertEquals(text, "User: Hello");
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

Deno.test("estimateTokens — empty string yields 0", () => {
  assertEquals(estimateTokens(""), 0);
});

Deno.test("estimateTokens — 4 chars yields 1 token", () => {
  assertEquals(estimateTokens("abcd"), 1);
});

Deno.test("estimateTokens — rounds up fractional tokens", () => {
  assertEquals(estimateTokens("abc"), 1); // ceil(3/4) = 1
  assertEquals(estimateTokens("abcde"), 2); // ceil(5/4) = 2
});

// ---------------------------------------------------------------------------
// Streaming usage propagation through openai-translate (Phases 3+4)
// ---------------------------------------------------------------------------

Deno.test(
  "anthropicStreamEventToOpenAI — message_delta with usage emits stop chunk + usage chunk",
  () => {
    const state = makeStreamState("gpt-4o");
    const event: StreamEvent = {
      type: "message_delta",
      delta: { type: "stop_reason", stop_reason: "end_turn" },
      usage: { input_tokens: 42, output_tokens: 18 },
    };
    const result = anthropicStreamEventToOpenAI(event, state);
    assertEquals(result !== null, true);

    // Should contain two SSE lines
    const lines = result!.split("\n\n").filter((l) =>
      l.trim().startsWith("data:")
    );
    assertEquals(lines.length, 2);

    // First line: stop chunk
    const stopChunk = JSON.parse(lines[0].replace("data: ", "").trim());
    assertEquals(stopChunk.choices[0].finish_reason, "stop");

    // Second line: usage chunk with empty choices
    const usageChunk = JSON.parse(lines[1].replace("data: ", "").trim());
    assertEquals(usageChunk.choices.length, 0);
    assertEquals(usageChunk.usage.prompt_tokens, 42);
    assertEquals(usageChunk.usage.completion_tokens, 18);
    assertEquals(usageChunk.usage.total_tokens, 60);
    assertEquals(usageChunk.usage.prompt_tokens_details.cached_tokens, 0);
    assertEquals(
      usageChunk.usage.completion_tokens_details.reasoning_tokens,
      0,
    );
  },
);

Deno.test(
  "anthropicStreamEventToOpenAI — message_delta without usage emits only stop chunk",
  () => {
    const state = makeStreamState("gpt-4o");
    const event: StreamEvent = {
      type: "message_delta",
      delta: { type: "stop_reason", stop_reason: "end_turn" },
    };
    const result = anthropicStreamEventToOpenAI(event, state);
    assertEquals(result !== null, true);

    const lines = result!.split("\n\n").filter((l) =>
      l.trim().startsWith("data:")
    );
    assertEquals(lines.length, 1);

    const chunk = JSON.parse(lines[0].replace("data: ", "").trim());
    assertEquals(chunk.choices[0].finish_reason, "stop");
  },
);

Deno.test(
  "anthropicStreamEventToOpenAI — usage state stored on StreamState after message_delta with usage",
  () => {
    const state = makeStreamState("gpt-4o");
    const event: StreamEvent = {
      type: "message_delta",
      delta: { type: "stop_reason", stop_reason: "end_turn" },
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    anthropicStreamEventToOpenAI(event, state);
    assertEquals(state.usage?.prompt_tokens, 10);
    assertEquals(state.usage?.completion_tokens, 5);
    assertEquals(state.usage?.total_tokens, 15);
  },
);
