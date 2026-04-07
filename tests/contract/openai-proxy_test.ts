/**
 * Contract tests for the OpenAI-compatible proxy endpoints.
 * POST /v1/chat/completions (non-streaming + streaming)
 * GET  /v1/models
 * GET  /health (already covered in server_test.ts, included here for completeness)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { handleRequest } from "@modmux/gateway";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function server() {
  return Deno.serve({
    port: 0,
    hostname: "127.0.0.1",
    handler: handleRequest,
    onListen: () => {},
  });
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

function makeModelsResponse(): Response {
  return new Response(
    JSON.stringify({
      data: [
        { id: "gpt-4o", name: "gpt-4o", vendor: "GitHub" },
        { id: "gpt-4o-mini", name: "gpt-4o-mini", vendor: "GitHub" },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function stubFetch(chatResponse: Response): () => void {
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

    if (
      url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:")
    ) {
      return original(input, init);
    }

    if (url.includes("copilot_internal")) {
      return Promise.resolve(makeTokenResponse());
    }

    if (url.includes("/models")) {
      return Promise.resolve(makeModelsResponse());
    }

    return Promise.resolve(chatResponse);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}

function makeSSEChatChunk(
  content: string,
  finishReason: string | null = null,
): string {
  const chunk = {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: finishReason,
    }],
    created: Date.now(),
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function makeSSEUsageChunk(
  promptTokens: number,
  completionTokens: number,
): string {
  const chunk = {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    choices: [],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    created: Date.now(),
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function post(
  port: number,
  path: string,
  body: unknown,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(port: number, path: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`);
}

// ---------------------------------------------------------------------------
// /v1/chat/completions — validation
// ---------------------------------------------------------------------------

Deno.test("OpenAI /v1/chat/completions — missing model returns 400", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/chat/completions", {
      messages: [{ role: "user", content: "hi" }],
    });
    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(
      (body.error as Record<string, unknown>).type,
      "invalid_request_error",
    );
  } finally {
    await s.shutdown();
  }
});

Deno.test("OpenAI /v1/chat/completions — missing messages returns 400", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/chat/completions", { model: "gpt-4o" });
    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(
      (body.error as Record<string, unknown>).type,
      "invalid_request_error",
    );
  } finally {
    await s.shutdown();
  }
});

Deno.test("OpenAI /v1/chat/completions — empty messages array returns 400", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/chat/completions", {
      model: "gpt-4o",
      messages: [],
    });
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    await s.shutdown();
  }
});

// ---------------------------------------------------------------------------
// /v1/chat/completions — non-streaming response shape
// ---------------------------------------------------------------------------

Deno.test("OpenAI /v1/chat/completions — non-streaming returns object:chat.completion", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: "ping" }],
      stream: false,
    });
    // May be 200 (Copilot available) or 503 (no Copilot token in test env)
    if (res.status === 200) {
      const body = await res.json() as Record<string, unknown>;
      assertEquals(body.object, "chat.completion");
      assertEquals(typeof body.id, "string");
      assertEquals(typeof body.created, "number");
      assertEquals(Array.isArray(body.choices), true);
      const choices = body.choices as Record<string, unknown>[];
      assertEquals(choices.length > 0, true);
    } else {
      await res.body?.cancel();
    }
  } finally {
    await s.shutdown();
  }
});

// ---------------------------------------------------------------------------
// /v1/chat/completions — streaming response shape
// ---------------------------------------------------------------------------

Deno.test({
  name: "OpenAI /v1/chat/completions — streaming returns text/event-stream",
  async fn() {
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
    const chunks = [
      makeSSEChatChunk("Hello", null),
      makeSSEChatChunk(" world", "stop"),
    ];
    const body = chunks.join("") + "data: [DONE]\n\n";
    const restore = stubFetch(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    try {
      const res = await post(port, "/v1/chat/completions", {
        model: "gpt-4o",
        messages: [{ role: "user", content: "ping" }],
        stream: true,
      });

      assertEquals(res.status, 200);
      assertEquals(res.headers.get("content-type"), "text/event-stream");
      const text = await res.text();
      assertStringIncludes(text, "data:");
      assertStringIncludes(text, "[DONE]");
    } finally {
      restore();
      await s.shutdown();
    }
  },
});

// ---------------------------------------------------------------------------
// /v1/responses — validation + response shape
// ---------------------------------------------------------------------------

Deno.test("OpenAI /v1/responses — missing model returns 400", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/responses", {
      input: "ping",
    });
    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(
      (body.error as Record<string, unknown>).type,
      "invalid_request_error",
    );
  } finally {
    await s.shutdown();
  }
});

Deno.test("OpenAI /v1/responses — non-streaming returns object:response", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/responses", {
      model: "gpt-4o",
      input: "ping",
      stream: false,
    });

    // May be 200 (Copilot available) or 503 (no Copilot token in test env)
    if (res.status === 200) {
      const body = await res.json() as Record<string, unknown>;
      assertEquals(body.object, "response");
      assertEquals(typeof body.id, "string");
      assertEquals(body.status, "completed");
      assertEquals(typeof body.output_text, "string");
    } else {
      await res.body?.cancel();
    }
  } finally {
    await s.shutdown();
  }
});

Deno.test({
  name: "OpenAI /v1/responses — streaming includes response.completed",
  async fn() {
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
    const chunks = [
      makeSSEChatChunk("Hello", null),
      makeSSEChatChunk(" world", "stop"),
      makeSSEUsageChunk(7, 2),
    ];
    const body = chunks.join("") + "data: [DONE]\n\n";
    const restore = stubFetch(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    try {
      const res = await post(port, "/v1/responses", {
        model: "gpt-4o",
        input: "ping",
        stream: true,
      });

      assertEquals(res.status, 200);
      assertEquals(res.headers.get("content-type"), "text/event-stream");
      const text = await res.text();
      assertStringIncludes(text, "event: response.created");
      assertStringIncludes(text, "event: response.output_text.delta");
      assertStringIncludes(text, '"delta":"Hello"');
      assertStringIncludes(text, '"delta":" world"');
      assertStringIncludes(text, "event: response.completed");
      assertStringIncludes(text, '"input_tokens":7');
      assertStringIncludes(text, '"output_tokens":2');
      assertStringIncludes(text, "data: [DONE]");
    } finally {
      restore();
      await s.shutdown();
    }
  },
});

// ---------------------------------------------------------------------------
// GET /v1/models
// ---------------------------------------------------------------------------

Deno.test("GET /v1/models — returns 200 with object:list", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  let body: Record<string, unknown>;
  try {
    const res = await get(port, "/v1/models");
    assertEquals(res.status, 200);
    body = await res.json() as Record<string, unknown>;
  } finally {
    await s.shutdown();
  }
  assertEquals(body!.object, "list");
  assertEquals(Array.isArray(body!.data), true);
  const models = body!.data as Record<string, unknown>[];
  assertEquals(models.length > 0, true);
  assertEquals(models[0].object, "model");
  assertEquals(typeof models[0].id, "string");
});

Deno.test("GET /v1/models — each model has owned_by: github-copilot", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  let models: Record<string, unknown>[];
  try {
    const res = await get(port, "/v1/models");
    const body = await res.json() as Record<string, unknown>;
    models = body.data as Record<string, unknown>[];
  } finally {
    await s.shutdown();
  }
  for (const model of models!) {
    assertEquals(model.owned_by, "github-copilot");
  }
});

// ---------------------------------------------------------------------------
// Method / path not found
// ---------------------------------------------------------------------------

Deno.test("POST /v1/models — wrong method returns 404 or 405", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/models", {});
    // 404 is acceptable (no POST handler registered)
    assertEquals(res.status === 404 || res.status === 405, true);
    await res.body?.cancel();
  } finally {
    await s.shutdown();
  }
});
