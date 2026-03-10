import { assert, assertEquals } from "@std/assert";
import { handleRequest } from "../../src/server/router.ts";

// Tests that start a real Deno HTTP server to verify the server lifecycle.

Deno.test("Server - starts on configured port and accepts connections", async () => {
  const server = Deno.serve({
    port: 0, // OS assigns a free port
    hostname: "127.0.0.1",
    handler: handleRequest,
    onListen: () => {},
  });

  const { port } = server.addr as Deno.NetAddr;
  assert(port > 0);

  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/v1/messages/count_tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        }),
      },
    );
    assertEquals(res.status, 200);
    await res.body?.cancel();
  } finally {
    await server.shutdown();
  }
});

Deno.test("Server - /health endpoint returns 200 with status ok", async () => {
  const server = Deno.serve({
    port: 0,
    hostname: "127.0.0.1",
    handler: handleRequest,
    onListen: () => {},
  });

  const { port } = server.addr as Deno.NetAddr;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assertEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(body.status, "ok");
  } finally {
    await server.shutdown();
  }
});

Deno.test("Server - hostname is always 127.0.0.1 (never 0.0.0.0)", async () => {
  // Verify that the server module always binds to loopback
  const { getConfig } = await import("../../src/server/server.ts");
  const config = await getConfig();
  assertEquals(config.hostname, "127.0.0.1");
});

Deno.test("Server - handles concurrent requests correctly", async () => {
  const server = Deno.serve({
    port: 0,
    hostname: "127.0.0.1",
    handler: handleRequest,
    onListen: () => {},
  });

  const { port } = server.addr as Deno.NetAddr;

  try {
    const requests = Array.from(
      { length: 3 },
      (_, i) =>
        fetch(`http://127.0.0.1:${port}/v1/messages/count_tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            messages: [{ role: "user", content: `Message ${i}` }],
          }),
        }),
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      assertEquals(res.status, 200);
      await res.body?.cancel();
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("Server - graceful shutdown stops accepting new connections", async () => {
  const server = Deno.serve({
    port: 0,
    hostname: "127.0.0.1",
    handler: handleRequest,
    onListen: () => {},
  });

  const { port } = server.addr as Deno.NetAddr;

  // Verify it's running
  const before = await fetch(
    `http://127.0.0.1:${port}/v1/messages/count_tokens`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello" }],
      }),
    },
  );
  assertEquals(before.status, 200);
  await before.body?.cancel();

  // Shutdown
  await server.shutdown();

  // After shutdown, connections should be refused
  let refused = false;
  try {
    await fetch(`http://127.0.0.1:${port}/v1/messages/count_tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello" }],
      }),
    });
  } catch {
    refused = true;
  }
  assert(refused, "Expected connection to be refused after shutdown");
});
