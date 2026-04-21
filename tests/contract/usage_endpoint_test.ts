import { assert, assertEquals } from "@std/assert";
import {
  DEFAULT_CONFIG,
  getUsageMetricsSnapshot,
  handleRequest,
  saveConfig,
} from "@modmux/gateway";

const BASE = "http://localhost";

async function withTempHome<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmp = await Deno.makeTempDir({ prefix: "modmux_usage_" });
  const origHome = Deno.env.get("HOME");
  Deno.env.set("HOME", tmp);
  try {
    return await fn(tmp);
  } finally {
    if (origHome !== undefined) {
      Deno.env.set("HOME", origHome);
    } else {
      Deno.env.delete("HOME");
    }
    await Deno.remove(tmp, { recursive: true });
  }
}

function postJSON(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("GET /v1/usage returns expected top-level contract", async () => {
  await withTempHome(async () => {
    await saveConfig({
      ...DEFAULT_CONFIG,
      copilotSdk: {
        ...DEFAULT_CONFIG.copilotSdk,
        backend: "disabled",
        autoStart: false,
        cliUrl: null,
      },
    });
    const response = await handleRequest(new Request(`${BASE}/v1/usage`));
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/json");

    const body = await response.json() as Record<string, unknown>;
    assertEquals(typeof body.process, "object");
    assertEquals(typeof body.totals, "object");
    assertEquals(typeof body.endpoints, "object");
    assertEquals(typeof body.models, "object");
    assertEquals(typeof body.agents, "object");

    const process = body.process as Record<string, unknown>;
    assertEquals(typeof process.started_at, "string");
    assertEquals(typeof process.updated_at, "string");

    const totals = body.totals as Record<string, unknown>;
    assertEquals(typeof totals.requests, "number");
    assertEquals(typeof totals.success, "number");
    assertEquals(typeof totals.errors, "number");
  });
});

Deno.test("GET /v1/usage reports error when Copilot SDK backend is disabled", async () => {
  await withTempHome(async () => {
    await saveConfig({
      ...DEFAULT_CONFIG,
      copilotSdk: {
        ...DEFAULT_CONFIG.copilotSdk,
        backend: "disabled",
        autoStart: false,
        cliUrl: null,
      },
    });
    const response = await handleRequest(new Request(`${BASE}/v1/usage`));
    assertEquals(response.status, 200);

    const body = await response.json() as {
      github_copilot?: { status: string };
    };
    assertEquals(body.github_copilot?.status, "error");
  });
});

Deno.test("usage metrics counters track endpoint calls, status buckets, and latency", async () => {
  const initial = getUsageMetricsSnapshot();
  const initialRequests = initial.totals.requests;

  const okRequest = postJSON("/v1/messages/count_tokens", {
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "hello" }],
  });
  const okResponse = await handleRequest(okRequest);
  assertEquals(okResponse.status, 200);

  const badRequest = postJSON("/v1/messages", {
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "hello" }],
    max_tokens: 0,
  });
  const badResponse = await handleRequest(badRequest);
  assertEquals(badResponse.status, 400);

  const snapshot = getUsageMetricsSnapshot();
  assert(snapshot.totals.requests > initialRequests);

  const tokenEndpoint = snapshot.endpoints["/v1/messages/count_tokens"];
  assert(tokenEndpoint !== undefined);
  assert(tokenEndpoint.calls >= 1);
  assert(tokenEndpoint.status["2xx"] >= 1);
  assert(tokenEndpoint.latency_ms.count >= 1);
  assert(tokenEndpoint.latency_ms.avg >= 0);

  const messagesEndpoint = snapshot.endpoints["/v1/messages"];
  assert(messagesEndpoint !== undefined);
  assert(messagesEndpoint.calls >= 1);
  assert(messagesEndpoint.status["4xx"] >= 1);
  assert(messagesEndpoint.latency_ms.count >= 1);
  assert(messagesEndpoint.latency_ms.min >= 0);
  assert(messagesEndpoint.latency_ms.max >= messagesEndpoint.latency_ms.min);
});

Deno.test("usage endpoint reflects live updates on a real server", async () => {
  await withTempHome(async () => {
    await saveConfig({
      ...DEFAULT_CONFIG,
      copilotSdk: {
        ...DEFAULT_CONFIG.copilotSdk,
        backend: "disabled",
        autoStart: false,
        cliUrl: null,
      },
    });
    const initial = getUsageMetricsSnapshot();
    const initialCountTokensCalls =
      initial.endpoints["/v1/messages/count_tokens"]?.calls ?? 0;

    const server = Deno.serve({
      port: 0,
      hostname: "127.0.0.1",
      handler: handleRequest,
      onListen: () => {},
    });

    const { port } = server.addr as Deno.NetAddr;

    try {
      const firstUsage = await fetch(`http://127.0.0.1:${port}/v1/usage`);
      assertEquals(firstUsage.status, 200);
      await firstUsage.body?.cancel();

      const tokenRes = await fetch(
        `http://127.0.0.1:${port}/v1/messages/count_tokens`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            messages: [{ role: "user", content: "usage check" }],
          }),
        },
      );
      assertEquals(tokenRes.status, 200);
      await tokenRes.body?.cancel();

      const secondUsage = await fetch(`http://127.0.0.1:${port}/v1/usage`);
      assertEquals(secondUsage.status, 200);
      const payload = await secondUsage.json() as {
        endpoints: Record<string, { calls: number }>;
      };

      const countTokensMetrics = payload.endpoints["/v1/messages/count_tokens"];
      assert(countTokensMetrics !== undefined);
      assert(countTokensMetrics.calls > initialCountTokensCalls);
    } finally {
      await server.shutdown();
    }
  });
});
