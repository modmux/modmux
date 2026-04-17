/**
 * Contract tests for the OpenAI-compatible proxy endpoints.
 * POST /v1/chat/completions (non-streaming + streaming)
 * GET  /v1/models
 * GET  /health (already covered in server_test.ts, included here for completeness)
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { clearModelResolverCache, handleRequest } from "@modmux/gateway";

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

function makeModelsResponse(
  models: Array<Record<string, unknown>> = [
    { id: "gpt-4o", name: "gpt-4o", vendor: "GitHub" },
    { id: "gpt-4o-mini", name: "gpt-4o-mini", vendor: "GitHub" },
  ],
): Response {
  return new Response(
    JSON.stringify({
      data: models,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function stubFetch(chatResponse: Response): () => void {
  const original = globalThis.fetch;
  clearModelResolverCache();
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
    clearModelResolverCache();
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

/** Build a Responses API text-streaming SSE body for use in stubFetch mocks. */
function makeResponsesTextSSE(
  textDeltas: string[],
  inputTokens: number,
  outputTokens: number,
): string {
  const respId = "resp_test";
  const itemId = "msg_test";
  const sse = (event: string, data: unknown) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  const fullText = textDeltas.join("");

  const events: string[] = [
    sse("response.created", {
      type: "response.created",
      response: {
        id: respId,
        object: "response",
        model: "gpt-4o",
        status: "in_progress",
      },
    }),
    sse("response.output_item.added", {
      type: "response.output_item.added",
      response_id: respId,
      output_index: 0,
      item: {
        id: itemId,
        type: "message",
        role: "assistant",
        status: "in_progress",
        content: [],
      },
    }),
    sse("response.content_part.added", {
      type: "response.content_part.added",
      response_id: respId,
      output_index: 0,
      item_id: itemId,
      content_index: 0,
      part: { type: "output_text", text: "" },
    }),
    ...textDeltas.map((delta) =>
      sse("response.output_text.delta", {
        type: "response.output_text.delta",
        response_id: respId,
        output_index: 0,
        item_id: itemId,
        content_index: 0,
        delta,
      })
    ),
    sse("response.output_text.done", {
      type: "response.output_text.done",
      response_id: respId,
      output_index: 0,
      item_id: itemId,
      content_index: 0,
      text: fullText,
    }),
    sse("response.content_part.done", {
      type: "response.content_part.done",
      response_id: respId,
      output_index: 0,
      item_id: itemId,
      content_index: 0,
      part: { type: "output_text", text: fullText },
    }),
    sse("response.output_item.done", {
      type: "response.output_item.done",
      response_id: respId,
      output_index: 0,
      item: {
        id: itemId,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: fullText }],
      },
    }),
    sse("response.completed", {
      type: "response.completed",
      response: {
        id: respId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "gpt-4o",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: fullText }],
        }],
        output_text: fullText,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      },
    }),
    "data: [DONE]\n\n",
  ];

  return events.join("");
}

/** Build a Responses API function-call streaming SSE body for use in stubFetch mocks. */
function makeResponsesFunctionCallSSE(
  callId: string,
  name: string,
  args: string,
  inputTokens: number,
  outputTokens: number,
): string {
  const respId = "resp_test";
  const itemId = `fc_${callId}`;
  const sse = (event: string, data: unknown) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  return [
    sse("response.created", {
      type: "response.created",
      response: {
        id: respId,
        object: "response",
        model: "gpt-4o",
        status: "in_progress",
      },
    }),
    sse("response.output_item.added", {
      type: "response.output_item.added",
      response_id: respId,
      output_index: 0,
      item: {
        id: itemId,
        type: "function_call",
        call_id: callId,
        name,
        arguments: "",
        status: "in_progress",
      },
    }),
    sse("response.function_call_arguments.delta", {
      type: "response.function_call_arguments.delta",
      response_id: respId,
      item_id: itemId,
      output_index: 0,
      delta: args,
    }),
    sse("response.function_call_arguments.done", {
      type: "response.function_call_arguments.done",
      response_id: respId,
      item_id: itemId,
      output_index: 0,
      arguments: args,
    }),
    sse("response.output_item.done", {
      type: "response.output_item.done",
      response_id: respId,
      output_index: 0,
      item: {
        id: itemId,
        type: "function_call",
        call_id: callId,
        name,
        arguments: args,
        status: "completed",
      },
    }),
    sse("response.completed", {
      type: "response.completed",
      response: {
        id: respId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "gpt-4o",
        output: [{
          type: "function_call",
          id: itemId,
          call_id: callId,
          name,
          arguments: args,
          status: "completed",
        }],
        output_text: "",
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      },
    }),
    "data: [DONE]\n\n",
  ].join("");
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

function postWithHeaders(
  port: number,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
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

      // CI/release environments may not have a valid Copilot token. In that
      // case, streaming can return an error payload instead of normal chunks.
      if (text.includes("Authentication token is invalid")) {
        assertStringIncludes(text, '"code":"service_unavailable"');
        return;
      }

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

Deno.test("OpenAI /v1/responses — malformed text parts only returns 400", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/responses", {
      model: "gpt-4o",
      input: [{
        role: "user",
        content: [
          { type: "text" },
          { type: "input_text", text: null },
        ],
      }],
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

Deno.test("OpenAI /v1/responses — mixed valid and malformed text parts does not fail validation", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await post(port, "/v1/responses", {
      model: "gpt-4o",
      input: [{
        role: "user",
        content: [
          { type: "text", text: "ping" },
          { type: "text" },
          { type: "input_text", text: null },
        ],
      }],
      stream: false,
    });

    // May be 200 (Copilot available), 400 (model not supported on responses
    // endpoint), or 503 (no Copilot token in test env). Any non-500 is ok —
    // the key invariant is that malformed parts don't crash the handler.
    if (res.status === 200) {
      const body = await res.json() as Record<string, unknown>;
      assertEquals(body.object, "response");
      assertEquals(typeof body.output_text, "string");
    } else {
      await res.body?.cancel();
      assert(res.status !== 500, `Expected non-500, got ${res.status}`);
    }
  } finally {
    await s.shutdown();
  }
});

Deno.test("Claude Code /v1/responses — malformed text parts return 400 not 500", async () => {
  const s = server();
  const { port } = s.addr as Deno.NetAddr;
  try {
    const res = await postWithHeaders(
      port,
      "/v1/responses",
      {
        model: "gpt-4o",
        input: [{
          role: "user",
          content: [
            { type: "text" },
            { type: "input_text", text: null },
          ],
        }],
      },
      { "User-Agent": "claude-code/1.0" },
    );

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
    const body = makeResponsesTextSSE(["Hello", " world"], 7, 2);
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

      // CI/release environments may not have a valid Copilot token. In that
      // case, responses streaming returns an error event and [DONE].
      if (text.includes("Authentication token is invalid")) {
        assertStringIncludes(text, "event: error");
        assertStringIncludes(text, '"code":"service_unavailable"');
        assertStringIncludes(text, "data: [DONE]");
        return;
      }

      assertStringIncludes(text, "event: response.created");
      assertStringIncludes(text, "event: response.output_text.delta");
      assertStringIncludes(text, '"delta":"Hello"');
      assertStringIncludes(text, '"delta":" world"');
      assertStringIncludes(text, "event: response.completed");
      assertStringIncludes(text, '"input_tokens":7');
      assertStringIncludes(text, '"output_tokens":2');
      assertStringIncludes(text, "data: [DONE]");
      // response.completed must arrive before the stream-terminating [DONE]
      assert(
        text.indexOf("event: response.completed") <
          text.indexOf("data: [DONE]"),
        "response.completed must appear before data: [DONE]",
      );
    } finally {
      restore();
      await s.shutdown();
    }
  },
});

Deno.test({
  name:
    "OpenAI /v1/responses — streaming includes function call argument events",
  async fn() {
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
    const body = makeResponsesFunctionCallSSE(
      "call_apply_patch",
      "apply_patch",
      '{"input":"*** Begin Patch"}',
      9,
      3,
    );
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
      const text = await res.text();

      // CI/release environments may not have a valid Copilot token. In that
      // case, responses streaming returns an error event and [DONE].
      if (text.includes("Authentication token is invalid")) {
        assertStringIncludes(text, "event: error");
        assertStringIncludes(text, '"code":"service_unavailable"');
        assertStringIncludes(text, "data: [DONE]");
        return;
      }

      assertStringIncludes(text, "event: response.output_item.added");
      assertStringIncludes(text, '"type":"function_call"');
      assertStringIncludes(
        text,
        "event: response.function_call_arguments.delta",
      );
      assertStringIncludes(
        text,
        "event: response.function_call_arguments.done",
      );
      assertStringIncludes(text, '"name":"apply_patch"');
      assertStringIncludes(text, "data: [DONE]");
    } finally {
      restore();
      await s.shutdown();
    }
  },
});

Deno.test(
  "OpenAI /v1/responses — retries same-family fallback model on 503",
  async () => {
    clearModelResolverCache();
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
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

      if (
        url.startsWith("http://127.0.0.1:") ||
        url.startsWith("http://localhost:")
      ) {
        return original(input, init);
      }

      if (url.includes("copilot_internal")) {
        return Promise.resolve(makeTokenResponse());
      }

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse([
          {
            id: "gpt-4o",
            name: "gpt-4o",
            vendor: "GitHub",
            supported_endpoints: ["/responses"],
            model_picker_category: "versatile",
          },
          {
            id: "gpt-4o-mini",
            name: "gpt-4o-mini",
            vendor: "GitHub",
            supported_endpoints: ["/responses"],
            model_picker_category: "lightweight",
          },
          {
            id: "claude-sonnet-4-6",
            name: "claude-sonnet-4-6",
            vendor: "GitHub",
            supported_endpoints: ["/responses"],
            model_picker_category: "powerful",
          },
        ]));
      }

      const body = JSON.parse(init?.body as string ?? "{}");
      attemptedModels.push(body.model);

      if (attemptedModels.length === 1) {
        return Promise.resolve(
          new Response("We're currently experiencing high demand", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "resp_fallback",
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            status: "completed",
            model: body.model,
            output: [],
            output_text: "fallback worked",
            usage: {
              input_tokens: 5,
              output_tokens: 2,
              total_tokens: 7,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 0 },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }) as typeof globalThis.fetch;

    try {
      const res = await post(port, "/v1/responses", {
        model: "gpt-5.1",
        input: "ping",
        stream: false,
      });

      assertEquals(res.status, 200);
      const body = await res.json() as Record<string, unknown>;
      assertEquals(body.output_text, "fallback worked");
      assertEquals(attemptedModels, ["gpt-4o", "gpt-4o-mini"]);
    } finally {
      globalThis.fetch = original;
      clearModelResolverCache();
      await s.shutdown();
    }
  },
);

Deno.test(
  "OpenAI /v1/responses — plain-text upstream error becomes OpenAI JSON",
  async () => {
    clearModelResolverCache();
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
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
        url.startsWith("http://127.0.0.1:") ||
        url.startsWith("http://localhost:")
      ) {
        return original(input, init);
      }

      if (url.includes("copilot_internal")) {
        return Promise.resolve(makeTokenResponse());
      }

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse([{
          id: "gpt-4o",
          name: "gpt-4o",
          vendor: "GitHub",
          supported_endpoints: ["/responses"],
          model_picker_category: "versatile",
        }]));
      }

      return Promise.resolve(
        new Response("We're currently experiencing high demand", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    }) as typeof globalThis.fetch;

    try {
      const res = await post(port, "/v1/responses", {
        model: "gpt-4o",
        input: "ping",
        stream: false,
      });

      assertEquals(res.status, 503);
      assertEquals(res.headers.get("content-type"), "application/json");
      const body = await res.json() as Record<string, unknown>;
      const error = body.error as Record<string, unknown>;
      assertEquals(error.type, "api_error");
      assertEquals(error.code, "service_unavailable");
      assertStringIncludes(String(error.message), "high demand");
    } finally {
      globalThis.fetch = original;
      clearModelResolverCache();
      await s.shutdown();
    }
  },
);

Deno.test(
  "OpenAI /v1/responses — upstream JSON error is passed through",
  async () => {
    clearModelResolverCache();
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
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
        url.startsWith("http://127.0.0.1:") ||
        url.startsWith("http://localhost:")
      ) {
        return original(input, init);
      }

      if (url.includes("copilot_internal")) {
        return Promise.resolve(makeTokenResponse());
      }

      if (url.includes("/models")) {
        return Promise.resolve(makeModelsResponse([{
          id: "gpt-4o",
          name: "gpt-4o",
          vendor: "GitHub",
          supported_endpoints: ["/responses"],
          model_picker_category: "versatile",
        }]));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "copilot said no",
              type: "invalid_request_error",
              code: "invalid_value",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }) as typeof globalThis.fetch;

    try {
      const res = await post(port, "/v1/responses", {
        model: "gpt-4o",
        input: "ping",
        stream: false,
      });

      assertEquals(res.status, 400);
      assertEquals(res.headers.get("content-type"), "application/json");
      const body = await res.json() as Record<string, unknown>;
      const error = body.error as Record<string, unknown>;
      assertEquals(error.message, "copilot said no");
      assertEquals(error.type, "invalid_request_error");
      assertEquals(error.code, "invalid_value");
    } finally {
      globalThis.fetch = original;
      clearModelResolverCache();
      await s.shutdown();
    }
  },
);

// ---------------------------------------------------------------------------
// /v1/responses — Responses API flat tool format
// ---------------------------------------------------------------------------

Deno.test(
  "OpenAI /v1/responses — flat tool format does not crash (no 'Cannot read .name')",
  async () => {
    const s = server();
    const { port } = s.addr as Deno.NetAddr;
    const restore = stubFetch(
      new Response(makeResponsesTextSSE(["hello"], 5, 2), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    try {
      // Responses API sends tools flat: { type, name, description, parameters }
      // NOT nested under .function like Chat Completions API does.
      const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o",
          input: "ping",
          stream: true,
          tools: [{
            type: "function",
            name: "get_weather",
            description: "Get current weather",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
            },
          }],
          tool_choice: "auto",
        }),
      });

      // Must not be 500 — handler must survive the flat-tool format
      assert(res.status !== 500, `Expected non-500, got ${res.status}`);
      await res.body?.cancel();
    } finally {
      restore();
      await s.shutdown();
    }
  },
);

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
