import { assertEquals, assertExists } from "@std/assert";
import { handleRequest } from "../../src/server/router.ts";

const BASE = "http://localhost";

function postJSON(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertErrorFormat(
  body: Record<string, unknown>,
  expectedType?: string,
  expectedParam?: string | null,
) {
  assertEquals(body.type, "error");
  assertExists(body.error);
  const err = body.error as Record<string, unknown>;
  assertExists(err.type);
  assertExists(err.message);
  if (expectedType !== undefined) assertEquals(err.type, expectedType);
  if (expectedParam !== undefined) assertEquals(err.param, expectedParam);
}

// /v1/messages validation errors

Deno.test("POST /v1/messages - invalid JSON returns 400", async () => {
  const req = new Request(`${BASE}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{{",
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertErrorFormat(body, "invalid_request_error");
});

Deno.test("POST /v1/messages - missing model returns 400 with param=model", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10,
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "model");
});

Deno.test("POST /v1/messages - empty model returns 400 with param=model", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      model: "",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10,
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "model");
});

Deno.test("POST /v1/messages - missing messages returns 400 with param=messages", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 10,
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "messages");
});

Deno.test("POST /v1/messages - empty messages array returns 400 with param=messages", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      model: "claude-3-5-sonnet-20241022",
      messages: [],
      max_tokens: 10,
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "messages");
});

Deno.test("POST /v1/messages - missing max_tokens returns 400 with param=max_tokens", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Hello" }],
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "max_tokens");
});

Deno.test("POST /v1/messages - zero max_tokens returns 400 with param=max_tokens", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 0,
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "max_tokens");
});

Deno.test("POST /v1/messages - negative max_tokens returns 400 with param=max_tokens", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages", {
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: -5,
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "max_tokens");
});

// /v1/messages/count_tokens validation errors

Deno.test("POST /v1/messages/count_tokens - invalid JSON returns 400", async () => {
  const req = new Request(`${BASE}/v1/messages/count_tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "bad json",
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error");
});

Deno.test("POST /v1/messages/count_tokens - missing model returns 400 with param=model", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages/count_tokens", {
      messages: [{ role: "user", content: "Hello" }],
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "model");
});

Deno.test("POST /v1/messages/count_tokens - missing messages returns 400 with param=messages", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages/count_tokens", {
      model: "claude-3-5-sonnet-20241022",
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "messages");
});

Deno.test("POST /v1/messages/count_tokens - empty messages returns 400 with param=messages", async () => {
  const res = await handleRequest(
    postJSON("/v1/messages/count_tokens", {
      model: "claude-3-5-sonnet-20241022",
      messages: [],
    }),
  );
  assertEquals(res.status, 400);
  assertErrorFormat(await res.json(), "invalid_request_error", "messages");
});

// 404 error format

Deno.test("404 response has Anthropic error format", async () => {
  const res = await handleRequest(
    postJSON("/not/a/real/path", {}),
  );
  assertEquals(res.status, 404);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertErrorFormat(body, "invalid_request_error");
});
