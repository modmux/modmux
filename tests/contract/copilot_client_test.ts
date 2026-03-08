import { assertEquals } from "@std/assert";
import type { ProxyRequest } from "../../src/server/types.ts";
import type {
  OpenAIChatResponse,
  OpenAIStreamChunk,
} from "../../src/copilot/types.ts";
import {
  _clearModelCacheForTest,
  _setModelCacheForTest,
} from "../../src/copilot/models.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_GITHUB_TOKEN = "ghp_fake_test_token";

/** Copilot model IDs available in tests. */
const TEST_MODEL_IDS = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-haiku-4-5",
  "gpt-4.1",
];

function makeProxyRequest(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    model: "gpt-4.1",
    messages: [{ role: "user", content: "Hello!" }],
    max_tokens: 100,
    ...overrides,
  };
}

function makeChatResponse(
  content: string,
  finishReason: "stop" | "length" = "stop",
): OpenAIChatResponse {
  return {
    id: "chatcmpl-test123",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  };
}

function makeTokenResponse(): Response {
  return new Response(
    JSON.stringify({
      token: "tid=mock-copilot-token",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      refresh_in: 1500,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Stubs globalThis.fetch to return a chat response.
 * NOTE: Because we use _setGitHubTokenForTest, the token exchange endpoint
 * is reached via fetch — this stub returns the mock token for it too.
 */
function stubFetch(chatResponse: Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((
    input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    if (url.includes("copilot_internal")) {
      return Promise.resolve(makeTokenResponse());
    }
    return Promise.resolve(chatResponse);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}

async function setupToken(): Promise<{
  clearTokenCache: () => void;
  _setGitHubTokenForTest: (t: string | null) => void;
}> {
  const { clearTokenCache, _setGitHubTokenForTest } = await import(
    "../../src/copilot/token.ts"
  );
  clearTokenCache();
  _setGitHubTokenForTest(FAKE_GITHUB_TOKEN);
  _setModelCacheForTest(TEST_MODEL_IDS);
  return { clearTokenCache, _setGitHubTokenForTest };
}

// ---------------------------------------------------------------------------
// Test: chat() non-streaming — maps OpenAI response to Anthropic ProxyResponse
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - non-streaming maps content, stop_reason, usage correctly",
  async () => {
    const { clearTokenCache, _setGitHubTokenForTest } = await setupToken();
    const { chat } = await import("../../src/copilot/client.ts");

    const openAIResp = makeChatResponse("Hello! How can I help?", "stop");
    const restore = stubFetch(
      new Response(JSON.stringify(openAIResp), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const result = await chat(makeProxyRequest());

      assertEquals(result.content[0].type, "text");
      assertEquals(result.content[0].text, "Hello! How can I help?");
      assertEquals(result.stop_reason, "end_turn");
      assertEquals(result.usage.input_tokens, 10);
      assertEquals(result.usage.output_tokens, 5);
      assertEquals(result.type, "message");
      assertEquals(result.role, "assistant");
    } finally {
      restore();
      clearTokenCache();
      _setGitHubTokenForTest(null);
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() with finish_reason "length" → stop_reason "max_tokens"
// ---------------------------------------------------------------------------

Deno.test(
  'chat() - finish_reason "length" → stop_reason "max_tokens"',
  async () => {
    const { clearTokenCache, _setGitHubTokenForTest } = await setupToken();
    const { chat } = await import("../../src/copilot/client.ts");

    const openAIResp = makeChatResponse("truncated", "length");
    const restore = stubFetch(
      new Response(JSON.stringify(openAIResp), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const result = await chat(makeProxyRequest());
      assertEquals(result.stop_reason, "max_tokens");
    } finally {
      restore();
      clearTokenCache();
      _setGitHubTokenForTest(null);
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() — Anthropic→OpenAI message mapping (system prepended)
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - system field is prepended as { role: 'system' } message",
  async () => {
    const { clearTokenCache, _setGitHubTokenForTest } = await setupToken();

    let capturedBody: {
      messages?: Array<{ role: string; content: string }>;
    } | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
      if (url.includes("copilot_internal")) {
        return Promise.resolve(makeTokenResponse());
      }
      capturedBody = JSON.parse(init?.body as string ?? "{}");
      const resp = makeChatResponse("ok", "stop");
      return Promise.resolve(
        new Response(JSON.stringify(resp), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    try {
      const { chat } = await import("../../src/copilot/client.ts");
      await chat(
        makeProxyRequest({
          system: "You are a helpful assistant.",
          messages: [{ role: "user", content: "Hi" }],
        }),
      );

      assertEquals(capturedBody !== null, true);
      const messages = capturedBody!.messages ?? [];
      assertEquals(messages[0].role, "system");
      assertEquals(messages[0].content, "You are a helpful assistant.");
      assertEquals(messages[1].role, "user");
      assertEquals(messages[1].content, "Hi");
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
      _setGitHubTokenForTest(null);
      _clearModelCacheForTest();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() — 401 response → authentication_error in ProxyResponse
// ---------------------------------------------------------------------------

Deno.test("chat() - 401 response → authentication_error content", async () => {
  const { clearTokenCache, _setGitHubTokenForTest } = await setupToken();
  const { chat } = await import("../../src/copilot/client.ts");

  const original = globalThis.fetch;
  globalThis.fetch = ((
    input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    if (url.includes("copilot_internal")) {
      return Promise.resolve(makeTokenResponse());
    }
    return Promise.resolve(new Response("Unauthorized", { status: 401 }));
  }) as typeof globalThis.fetch;

  try {
    const result = await chat(makeProxyRequest());
    assertEquals(result.content[0].type, "text");
    assertEquals(
      result.content[0].text.toLowerCase().includes("authentication") ||
        result.content[0].text.includes("401"),
      true,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: chat() — 503 response → overloaded_error in ProxyResponse
// ---------------------------------------------------------------------------

Deno.test("chat() - 503 response → overloaded_error content", async () => {
  const { clearTokenCache, _setGitHubTokenForTest } = await setupToken();
  const { chat } = await import("../../src/copilot/client.ts");

  const restore = stubFetch(
    new Response("Service Unavailable", { status: 503 }),
  );

  try {
    const result = await chat(makeProxyRequest());
    assertEquals(result.content[0].type, "text");
    assertEquals(
      result.content[0].text.toLowerCase().includes("overloaded") ||
        result.content[0].text.includes("503"),
      true,
    );
  } finally {
    restore();
    clearTokenCache();
    _setGitHubTokenForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Test: chatStream() — emits Anthropic SSE events in correct order
// ---------------------------------------------------------------------------

Deno.test(
  "chatStream() - emits message_start, content_block_start, deltas, and stop events",
  async () => {
    const { clearTokenCache, _setGitHubTokenForTest } = await setupToken();
    const { chatStream } = await import("../../src/copilot/client.ts");

    // Build a streaming SSE response
    const chunks: OpenAIStreamChunk[] = [
      {
        id: "chatcmpl-stream1",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-stream1",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: { content: "Hello" },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-stream1",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: { content: " world" },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-stream1",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      },
    ];

    const sseBody =
      chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
      "data: [DONE]\n\n";

    const original = globalThis.fetch;
    globalThis.fetch = ((
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
      if (url.includes("copilot_internal")) {
        return Promise.resolve(makeTokenResponse());
      }
      return Promise.resolve(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    }) as typeof globalThis.fetch;

    const collectedTypes: string[] = [];
    const collectedTexts: string[] = [];

    try {
      await chatStream(makeProxyRequest({ stream: true }), (event) => {
        collectedTypes.push(event.type);
        if (
          event.type === "content_block_delta" &&
          event.delta &&
          "text" in event.delta
        ) {
          collectedTexts.push(event.delta.text);
        }
      });

      // Verify event sequence
      assertEquals(collectedTypes[0], "message_start");
      assertEquals(collectedTypes[1], "content_block_start");
      // Some content_block_delta events
      const deltaIdx = collectedTypes.findIndex((t) =>
        t === "content_block_delta"
      );
      assertEquals(deltaIdx >= 0, true);
      // content_block_stop, message_delta, message_stop at the end
      const lastThree = collectedTypes.slice(-3);
      assertEquals(lastThree[0], "content_block_stop");
      assertEquals(lastThree[1], "message_delta");
      assertEquals(lastThree[2], "message_stop");
      // Text content
      assertEquals(collectedTexts.includes("Hello"), true);
      assertEquals(collectedTexts.includes(" world"), true);
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
      _setGitHubTokenForTest(null);
    }
  },
);
