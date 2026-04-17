import { assertEquals } from "@std/assert";
import type { ProxyRequest, TextContentBlock } from "@modmux/gateway";
import type { OpenAIChatResponse, OpenAIStreamChunk } from "@modmux/providers";
import {
  chat,
  type ChatOptions,
  chatStream,
  clearTokenCache,
} from "@modmux/providers";
import type { StreamEvent } from "@modmux/gateway";

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

function makeModelsResponse(modelIds: string[]): Response {
  return new Response(
    JSON.stringify({
      data: modelIds.map((id) => ({ id, name: id, vendor: "GitHub" })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Stubs globalThis.fetch to return token, models, and chat responses.
 */
function stubFetch(
  chatResponse: Response,
  modelIds: string[] = TEST_MODEL_IDS,
): () => void {
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

    if (url.includes("/models")) {
      return Promise.resolve(makeModelsResponse(modelIds));
    }

    return Promise.resolve(chatResponse);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}

function getTestOptions(): ChatOptions {
  return {
    getGitHubToken: () => Promise.resolve(FAKE_GITHUB_TOKEN),
  };
}

// ---------------------------------------------------------------------------
// Test: chat() non-streaming — maps OpenAI response to Anthropic ProxyResponse
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - non-streaming maps content, stop_reason, usage correctly",
  async () => {
    clearTokenCache();

    const openAIResp = makeChatResponse("Hello! How can I help?", "stop");
    const restore = stubFetch(
      new Response(JSON.stringify(openAIResp), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const result = await chat(makeProxyRequest(), getTestOptions());

      assertEquals(result.content[0].type, "text");
      assertEquals(
        (result.content[0] as TextContentBlock).text,
        "Hello! How can I help?",
      );
      assertEquals(result.stop_reason, "end_turn");
      assertEquals(result.usage.input_tokens, 10);
      assertEquals(result.usage.output_tokens, 5);
      assertEquals(result.type, "message");
      assertEquals(result.role, "assistant");
    } finally {
      restore();
      clearTokenCache();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() with finish_reason "length" → stop_reason "max_tokens"
// ---------------------------------------------------------------------------

Deno.test(
  'chat() - finish_reason "length" → stop_reason "max_tokens"',
  async () => {
    clearTokenCache();

    const openAIResp = makeChatResponse("truncated", "length");
    const restore = stubFetch(
      new Response(JSON.stringify(openAIResp), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const result = await chat(makeProxyRequest(), getTestOptions());
      assertEquals(result.stop_reason, "max_tokens");
    } finally {
      restore();
      clearTokenCache();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() — Anthropic→OpenAI message mapping (system prepended)
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - system field is prepended as { role: 'system' } message",
  async () => {
    clearTokenCache();

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

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
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
      await chat(
        makeProxyRequest({
          system: "You are a helpful assistant.",
          messages: [{ role: "user", content: "Hi" }],
        }),
        getTestOptions(),
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
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() — 401 response → authentication_error in ProxyResponse
// ---------------------------------------------------------------------------

Deno.test("chat() - 401 response → authentication_error content", async () => {
  clearTokenCache();

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

    if (url.includes("/models")) {
      return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
    }

    return Promise.resolve(new Response("Unauthorized", { status: 401 }));
  }) as typeof globalThis.fetch;

  try {
    const result = await chat(makeProxyRequest(), getTestOptions());
    assertEquals(result.content[0].type, "text");
    assertEquals(
      (result.content[0] as TextContentBlock).text.toLowerCase().includes(
        "authentication",
      ) ||
        (result.content[0] as TextContentBlock).text.includes("401"),
      true,
    );
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: chat() — 503 response → overloaded_error in ProxyResponse
// ---------------------------------------------------------------------------

Deno.test("chat() - 503 response → overloaded_error content", async () => {
  clearTokenCache();

  const openAIResp = new Response("Service Unavailable", { status: 503 });
  const restore = stubFetch(openAIResp);

  try {
    const result = await chat(makeProxyRequest(), getTestOptions());
    assertEquals(result.content[0].type, "text");
    assertEquals(
      (result.content[0] as TextContentBlock).text.toLowerCase().includes(
        "overloaded",
      ) ||
        (result.content[0] as TextContentBlock).text.includes("503"),
      true,
    );
  } finally {
    restore();
    clearTokenCache();
  }
});

// ---------------------------------------------------------------------------
// Test: chat() does not cross vendor families when retrying GPT models
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - gpt model 503 does not retry into Claude fallback",
  async () => {
    clearTokenCache();

    const attemptedModels: string[] = [];
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

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
      }

      const body = JSON.parse(init?.body as string ?? "{}");
      attemptedModels.push(body.model);
      return Promise.resolve(
        new Response("We're currently experiencing high demand", {
          status: 503,
        }),
      );
    }) as typeof globalThis.fetch;

    try {
      const result = await chat(
        makeProxyRequest({ model: "gpt-4.1" }),
        getTestOptions(),
      );

      assertEquals(attemptedModels, ["gpt-4.1"]);
      assertEquals(result.content[0].type, "text");
      assertEquals(
        (result.content[0] as TextContentBlock).text.toLowerCase().includes(
          "overloaded",
        ) ||
          (result.content[0] as TextContentBlock).text.includes("503"),
        true,
      );
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() falls back to next model when first model returns 503
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - falls back to next model when first returns 503",
  async () => {
    clearTokenCache();

    const attemptedModels: string[] = [];
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

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
      }

      const body = JSON.parse(init?.body as string ?? "{}");
      attemptedModels.push(body.model);

      if (attemptedModels.length === 1) {
        // First model overloaded — triggers fallback to next candidate
        return Promise.resolve(
          new Response("We're currently experiencing high demand", {
            status: 503,
          }),
        );
      }

      const resp = makeChatResponse("fallback worked", "stop");
      return Promise.resolve(
        new Response(JSON.stringify(resp), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    try {
      const result = await chat(
        makeProxyRequest({ model: "claude-sonnet-4-6" }),
        getTestOptions(),
      );

      assertEquals(attemptedModels[0], "claude-sonnet-4-6");
      assertEquals(attemptedModels.length >= 2, true);
      assertEquals(result.content[0].type, "text");
      assertEquals(
        (result.content[0] as TextContentBlock).text,
        "fallback worked",
      );
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chat() retries with lower Claude model when Copilot denies access
// ---------------------------------------------------------------------------

Deno.test(
  "chat() - retries with fallback Claude model on model access error",
  async () => {
    clearTokenCache();

    const attemptedModels: string[] = [];
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

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
      }

      const body = JSON.parse(init?.body as string ?? "{}");
      attemptedModels.push(body.model);

      if (attemptedModels.length === 1) {
        return Promise.resolve(
          new Response("You may not have access to claude-sonnet-4-6", {
            status: 403,
          }),
        );
      }

      const resp = makeChatResponse("fallback worked", "stop");
      return Promise.resolve(
        new Response(JSON.stringify(resp), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    try {
      const result = await chat(
        makeProxyRequest({ model: "claude-sonnet-4-6" }),
        getTestOptions(),
      );

      assertEquals(attemptedModels, ["claude-sonnet-4-6", "claude-sonnet-4-5"]);
      assertEquals(result.content[0].type, "text");
      assertEquals(
        (result.content[0] as TextContentBlock).text,
        "fallback worked",
      );
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chatStream() — emits Anthropic SSE events in correct order
// ---------------------------------------------------------------------------

Deno.test(
  "chatStream() - emits message_start, content_block_start, deltas, and stop events",
  async () => {
    clearTokenCache();

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

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
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
      await chatStream(
        makeProxyRequest({ stream: true }),
        (event: StreamEvent) => {
          collectedTypes.push(event.type);
          if (
            event.type === "content_block_delta" &&
            event.delta &&
            "text" in event.delta
          ) {
            collectedTexts.push(event.delta.text);
          }
        },
        undefined,
        getTestOptions(),
      );

      assertEquals(collectedTypes[0], "message_start");
      assertEquals(collectedTypes[1], "content_block_start");
      const deltaIdx = collectedTypes.findIndex((t) =>
        t === "content_block_delta"
      );
      assertEquals(deltaIdx >= 0, true);
      const lastThree = collectedTypes.slice(-3);
      assertEquals(lastThree[0], "content_block_stop");
      assertEquals(lastThree[1], "message_delta");
      assertEquals(lastThree[2], "message_stop");
      assertEquals(collectedTexts.includes("Hello"), true);
      assertEquals(collectedTexts.includes(" world"), true);
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: chatStream() retries with lower Claude model on access error
// ---------------------------------------------------------------------------

Deno.test(
  "chatStream() - retries with fallback Claude model on model access error",
  async () => {
    clearTokenCache();

    const attemptedModels: string[] = [];
    const sseBody = [
      {
        id: "chatcmpl-stream-fallback",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-stream-fallback",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: { content: "hello from fallback" },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-stream-fallback",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      },
    ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
      "data: [DONE]\n\n";

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

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse(TEST_MODEL_IDS));
      }

      const body = JSON.parse(init?.body as string ?? "{}");
      attemptedModels.push(body.model);

      if (attemptedModels.length === 1) {
        return Promise.resolve(
          new Response("You may not have access to claude-sonnet-4-6", {
            status: 403,
          }),
        );
      }

      return Promise.resolve(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    }) as typeof globalThis.fetch;

    const collectedTexts: string[] = [];

    try {
      await chatStream(
        makeProxyRequest({ model: "claude-sonnet-4-6", stream: true }),
        (event: StreamEvent) => {
          if (
            event.type === "content_block_delta" &&
            event.delta &&
            "text" in event.delta
          ) {
            collectedTexts.push(event.delta.text);
          }
        },
        undefined,
        getTestOptions(),
      );

      assertEquals(attemptedModels, ["claude-sonnet-4-6", "claude-sonnet-4-5"]);
      assertEquals(collectedTexts.includes("hello from fallback"), true);
    } finally {
      globalThis.fetch = original;
      clearTokenCache();
    }
  },
);
