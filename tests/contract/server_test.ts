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

Deno.test("Server - CLAUDIO_PORT env var configures port", async () => {
  const { getConfig } = await import("../../src/server/server.ts");

  Deno.env.set("CLAUDIO_PORT", "19191");
  const config = getConfig();
  assertEquals(config.port, 19191);

  Deno.env.delete("CLAUDIO_PORT");
  const defaultConfig = getConfig();
  assertEquals(defaultConfig.port, 8080);
});

Deno.test("Server - CLAUDIO_HOST env var configures hostname", async () => {
  const { getConfig } = await import("../../src/server/server.ts");

  Deno.env.set("CLAUDIO_HOST", "0.0.0.0");
  const config = getConfig();
  assertEquals(config.hostname, "0.0.0.0");

  Deno.env.delete("CLAUDIO_HOST");
  const defaultConfig = getConfig();
  assertEquals(defaultConfig.hostname, "127.0.0.1");
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
