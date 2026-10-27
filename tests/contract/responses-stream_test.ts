import { assertEquals } from "@std/assert";
import { handleResponses } from "../../gateway/src/responses-handler.ts";
import { clearModelResolverCache } from "../../gateway/src/model-resolver.ts";
import { clearModelCatalogCache } from "../../gateway/src/model-catalog.ts";

type Event = Record<string, unknown>;

function sse(event: Event): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function withUpstream(
  upstream: Response,
  check: (response: Response) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get("MODMUX_GITHUB_TOKEN");
  Deno.env.set("MODMUX_GITHUB_TOKEN", "ghu_modmux_test_token");
  clearModelResolverCache();
  clearModelCatalogCache();
  let requests = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("copilot_internal")) {
      return Promise.resolve(Response.json({
        token: "test-token",
        expires_at: new Date(Date.now() + 1800000).toISOString(),
        refresh_in: 1500,
      }));
    }
    if (url.endsWith("/models")) {
      return Promise.resolve(Response.json({
        data: [{
          id: "gpt-5.3-codex",
          supported_endpoints: ["/responses"],
        }],
      }));
    }
    assertEquals(url, "https://api.githubcopilot.com/v1/responses");
    requests++;
    return Promise.resolve(upstream);
  }) as typeof fetch;
  try {
    const response = await handleResponses(
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-5.3-codex",
          input: "Say hello",
          stream: true,
        }),
      }),
    );
    assertEquals(response.status, 200);
    await check(response);
    assertEquals(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) Deno.env.delete("MODMUX_GITHUB_TOKEN");
    else Deno.env.set("MODMUX_GITHUB_TOKEN", originalToken);
    clearModelResolverCache();
    clearModelCatalogCache();
  }
}

function fixture(drift: boolean): Event[] {
  let serial = 0;
  const id = (index: number) =>
    drift ? `changing_${serial++}` : `item_${index}`;
  const message = (itemId: string, text: string) => ({
    id: itemId,
    type: "message",
    role: "assistant",
    phase: "final_answer",
    content: [{ type: "output_text", text }],
  });
  const tool = (itemId: string, args: string) => ({
    id: itemId,
    type: "function_call",
    call_id: "call_original",
    name: "example",
    arguments: args,
  });
  return [
    { type: "response.created", response: { id: "resp_1", output: [] } },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: message(id(0), ""),
    },
    {
      type: "response.content_part.added",
      output_index: 0,
      item_id: id(0),
      content_index: 0,
      part: { type: "output_text", text: "" },
    },
    ...["Hello ", "🌍", "!"].map((delta) => ({
      type: "response.output_text.delta",
      output_index: 0,
      item_id: id(0),
      content_index: 0,
      delta,
    })),
    {
      type: "response.output_text.done",
      output_index: 0,
      item_id: id(0),
      content_index: 0,
      text: "Hello 🌍!",
    },
    {
      type: "response.content_part.done",
      output_index: 0,
      item_id: id(0),
      content_index: 0,
      part: { type: "output_text", text: "Hello 🌍!" },
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: message(id(0), "Hello 🌍!"),
    },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: tool(id(1), ""),
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 1,
      item_id: id(1),
      delta: "{}",
    },
    {
      type: "response.function_call_arguments.done",
      output_index: 1,
      item_id: id(1),
      arguments: "{}",
    },
    {
      type: "response.output_item.done",
      output_index: 1,
      item: tool(id(1), "{}"),
    },
    {
      type: "response.completed",
      response: {
        id: "resp_1",
        output: [message(id(0), "Hello 🌍!"), tool(id(1), "{}")],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  ];
}

for (const newline of ["\n", "\r\n"]) {
  Deno.test(`REGRESSION: Responses item IDs remain stable across chunked ${JSON.stringify(newline)} events`, async () => {
    const events = fixture(true);
    const firstMessageId = (events[1].item as Event).id;
    const firstToolId = (events[9].item as Event).id;
    const canonical = [firstMessageId, firstToolId];
    const expected = events.map((event) => {
      const copy = structuredClone(event);
      const index = copy.output_index as number;
      if (copy.item) (copy.item as Event).id = canonical[index];
      if (copy.item_id) copy.item_id = canonical[index];
      if (copy.type === "response.completed") {
        ((copy.response as Event).output as Event[]).forEach((item, i) =>
          item.id = canonical[i]
        );
      }
      return copy;
    });
    const wire = events.map(sse).join("") + "data: [DONE]\n\n";
    const bytes = new TextEncoder().encode(wire.replaceAll("\n", newline));
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) controller.close();
        else controller.enqueue(bytes.slice(offset, ++offset));
      },
    });
    await withUpstream(
      new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      }),
      async (response) => {
        const text = await response.text();
        const actual = text.split(/\r?\n/).filter((line) =>
          line.startsWith("data: ") && line !== "data: [DONE]"
        ).map((line) => JSON.parse(line.slice(6)));
        assertEquals(actual, expected);
        assertEquals(text.match(/data: \[DONE\]/g)?.length, 1);
      },
    );
  });
}

Deno.test("Responses compliant SSE is preserved, including comments and unknown events", async () => {
  const wire = ": heartbeat\n\n" + fixture(false).map(sse).join("") +
    'event: custom\ndata: {"custom":true}\n\ndata: [DONE]\n\n';
  await withUpstream(
    new Response(wire, { headers: { "Content-Type": "text/event-stream" } }),
    async (response) => {
      assertEquals(await response.text(), wire);
    },
  );
});

Deno.test("Responses JSON bodies are passed through unchanged", async () => {
  const body = JSON.stringify({ output: [{ id: "original" }] });
  await withUpstream(
    new Response(body, { headers: { "Content-Type": "application/json" } }),
    async (response) => {
      assertEquals(await response.text(), body);
    },
  );
});

Deno.test("Responses preserves separate messages with identical text and repairs incomplete snapshots", async () => {
  const item = (id: string) => ({
    id,
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "Same text" }],
  });
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: item("first"),
    },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: item("second"),
    },
    {
      type: "response.output_item.done",
      output_index: 1,
      item: item("drift2"),
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: item("drift1"),
    },
    {
      type: "response.incomplete",
      response: {
        output: [item("drift3"), item("drift4")],
        incomplete_details: { reason: "max_output_tokens" },
      },
    },
  ];
  // Multiline data, CR-only framing, and no final event delimiter.
  const wire = events.map((event) =>
    `data: ${JSON.stringify(event, null, 2).replaceAll("\n", "\rdata: ")}\r\r`
  ).join("").trimEnd();
  await withUpstream(
    new Response(wire, { headers: { "Content-Type": "text/event-stream" } }),
    async (response) => {
      const actual = (await response.text()).split("\r\r").map((frame) =>
        JSON.parse(frame.split("\r").map((line) => line.slice(6)).join("\n"))
      );
      assertEquals(actual, [
        events[0],
        events[1],
        { ...events[2], item: item("second") },
        { ...events[3], item: item("first") },
        {
          ...events[4],
          response: {
            ...events[4].response,
            output: [item("first"), item("second")],
          },
        },
      ]);
    },
  );
});

Deno.test("Responses streams before EOF and propagates cancellation upstream", async () => {
  const wire = sse({
    type: "response.output_item.added",
    output_index: 0,
    item: { id: "live", type: "message" },
  });
  const cancelled = Promise.withResolvers<unknown>();
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(wire));
    },
    cancel(reason) {
      cancelled.resolve(reason);
    },
  });
  await withUpstream(
    new Response(upstream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Content-Length": "999",
        "Content-Encoding": "gzip",
        "X-Request-Id": "keep-me",
      },
    }),
    async (response) => {
      assertEquals(response.headers.get("Content-Length"), null);
      assertEquals(response.headers.get("Content-Encoding"), null);
      assertEquals(response.headers.get("X-Request-Id"), "keep-me");
      const reader = response.body!.getReader();
      const first = await reader.read();
      assertEquals(new TextDecoder().decode(first.value), wire);
      await reader.cancel("client disconnected");
      assertEquals(await cancelled.promise, "client disconnected");
    },
  );
});

Deno.test("Responses preserves malformed data and error events", async () => {
  const wire =
    ': keepalive\n\ndata: broken JSON\n\nevent: error\ndata: {"type":"error","message":"upstream failed"}\n\n';
  await withUpstream(
    new Response(wire, { headers: { "Content-Type": "text/event-stream" } }),
    async (response) => {
      assertEquals(await response.text(), wire);
    },
  );
});
