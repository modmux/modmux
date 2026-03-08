import { assert, assertEquals } from "@std/assert";
import { handleRequest } from "../../src/server/router.ts";
import { stopClient } from "../../src/server/copilot.ts";

const BASE = "http://localhost";

function postJSON(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_MESSAGE_BODY = {
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 10,
};

// /v1/messages/count_tokens — pure calculation, no Copilot SDK needed

Deno.test("POST /v1/messages/count_tokens - returns 200 with usage", async () => {
  const req = postJSON("/v1/messages/count_tokens", {
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "Hello, world!" }],
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.type, "message");
  assertEquals(body.role, "assistant");
  assert(Array.isArray(body.content));
  assertEquals(typeof body.usage.input_tokens, "number");
  assert(body.usage.input_tokens > 0);
  assertEquals(body.usage.output_tokens, 0);
  assertEquals(body.stop_reason, null);
  assertEquals(body.stop_sequence, null);
});

Deno.test("POST /v1/messages/count_tokens - model echoed in response", async () => {
  const model = "claude-3-5-sonnet-20241022";
  const req = postJSON("/v1/messages/count_tokens", {
    model,
    messages: [{ role: "user", content: "Test" }],
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.model, model);
});

// /v1/messages — non-streaming

Deno.test(
  "POST /v1/messages - non-streaming returns 200 or 503",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    try {
      const req = postJSON("/v1/messages", VALID_MESSAGE_BODY);
      const res = await handleRequest(req);
      assert(
        res.status === 200 || res.status === 503,
        `Expected 200 or 503, got ${res.status}`,
      );
      assertEquals(res.headers.get("Content-Type"), "application/json");
      if (res.status === 200) {
        const body = await res.json();
        assertEquals(body.type, "message");
        assertEquals(body.role, "assistant");
        assert(Array.isArray(body.content));
        assert(typeof body.id === "string" && body.id.startsWith("msg_"));
        assertEquals(typeof body.usage.input_tokens, "number");
        assertEquals(typeof body.usage.output_tokens, "number");
      } else {
        await res.body?.cancel();
      }
    } finally {
      await stopClient();
    }
  },
);

// /v1/messages — streaming: always returns SSE headers (errors sent in stream body)

Deno.test(
  "POST /v1/messages - streaming returns SSE headers",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    try {
      const req = postJSON("/v1/messages", {
        ...VALID_MESSAGE_BODY,
        stream: true,
      });
      const res = await handleRequest(req);
      assertEquals(res.status, 200);
      assertEquals(res.headers.get("Content-Type"), "text/event-stream");
      assertEquals(res.headers.get("Cache-Control"), "no-cache");
      assertEquals(res.headers.get("Connection"), "keep-alive");
      await res.body?.cancel();
    } finally {
      await stopClient();
    }
  },
);

// Routing

Deno.test("GET /v1/messages - wrong method returns 404", async () => {
  const req = new Request(`${BASE}/v1/messages`, { method: "GET" });
  const res = await handleRequest(req);
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

Deno.test("POST /v1/unknown - unknown path returns 404 with error format", async () => {
  const req = postJSON("/v1/unknown", {});
  const res = await handleRequest(req);
  assertEquals(res.status, 404);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.type, "error");
  assertEquals(body.error.type, "invalid_request_error");
  assertEquals(typeof body.error.message, "string");
});
