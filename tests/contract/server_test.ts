import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  DEFAULT_CONFIG,
  getConfig,
  handleRequest,
  loadConfig,
  saveConfig,
} from "@modmux/gateway";
import {
  __resetServerTestDeps,
  __setServerTestDeps,
  initializeServerRuntime,
  shutdown,
} from "../../gateway/src/server.ts";

// Tests that start a real Deno HTTP server to verify the server lifecycle.

async function withTempHome<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmp = await Deno.makeTempDir({ prefix: "modmux_server_" });
  const origHome = Deno.env.get("HOME");
  Deno.env.set("HOME", tmp);
  try {
    return await fn(tmp);
  } finally {
    __resetServerTestDeps();
    if (origHome !== undefined) {
      Deno.env.set("HOME", origHome);
    } else {
      Deno.env.delete("HOME");
    }
    await Deno.remove(tmp, { recursive: true }).catch(() => {});
  }
}

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

Deno.test("Server runtime initializes sidecar config and shuts it down", async () => {
  await withTempHome(async () => {
    await saveConfig({
      ...DEFAULT_CONFIG,
      copilotSdk: {
        backend: "external-cli",
        cliUrl: null,
        autoStart: true,
        preferredPort: 4321,
      },
    });

    const started: string[] = [];
    const stopped: string[] = [];

    __setServerTestDeps({
      ensureCopilotSdkSidecarStarted: (copilotSdk) => {
        started.push(`${copilotSdk.backend}:${copilotSdk.autoStart}`);
        return Promise.resolve({ cliUrl: "127.0.0.1:4321", statusHint: null });
      },
      stopCopilotSdkSidecar: () => {
        stopped.push("sidecar");
        return Promise.resolve();
      },
      shutdownUsageMetrics: () => {
        stopped.push("metrics");
        return Promise.resolve();
      },
      stopClient: () => {
        stopped.push("client");
        return Promise.resolve();
      },
      log: () => Promise.resolve(),
    });

    await initializeServerRuntime();
    const config = await loadConfig();

    assertEquals(started, ["external-cli:true"]);
    assert(config.lastStarted !== null);
    assertEquals(typeof config.lastStarted, "string");

    const configFile = await Deno.readTextFile(
      join(Deno.env.get("HOME")!, ".modmux", "config.json"),
    );
    assert(configFile.includes('"lastStarted"'));

    await shutdown();
    assertEquals(stopped, ["metrics", "sidecar", "client"]);
  });
});
