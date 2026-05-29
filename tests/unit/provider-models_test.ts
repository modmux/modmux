import { assertEquals } from "@std/assert";
import { clearTokenCache } from "@modmux/providers";
import { resolveModelCandidates } from "../../providers/src/models.ts";

function makeModelsResponse(ids: string[]): Response {
  return new Response(
    JSON.stringify({
      data: ids.map((id) => ({ id, name: id, vendor: "GitHub" })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function withModelsStub(
  ids: string[],
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;

    if (url.includes("/models")) {
      return Promise.resolve(makeModelsResponse(ids));
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof globalThis.fetch;

  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
    clearTokenCache();
  });
}

Deno.test(
  "resolveModelCandidates normalizes dashed Claude ids to live dotted ids",
  async () => {
    await withModelsStub([
      "claude-sonnet-4.6",
      "claude-sonnet-4.5",
    ], async () => {
      const candidates = await resolveModelCandidates("claude-sonnet-4-6", {
        token: "tid=test-copilot-token",
      });

      assertEquals(candidates, ["claude-sonnet-4.6", "claude-sonnet-4.5"]);
    });
  },
);

Deno.test(
  "resolveModelCandidates maps legacy Claude family aliases to live dotted ids",
  async () => {
    await withModelsStub([
      "claude-haiku-4.5",
      "claude-sonnet-4.5",
    ], async () => {
      const candidates = await resolveModelCandidates("claude-3-5-haiku", {
        token: "tid=test-copilot-token",
      });

      assertEquals(candidates, ["claude-haiku-4.5", "claude-sonnet-4.5"]);
    });
  },
);

Deno.test(
  "resolveModelCandidates maps generic opus alias to latest live Opus model",
  async () => {
    await withModelsStub([
      "claude-opus-4.7",
      "claude-opus-4.8",
      "claude-sonnet-4.6",
    ], async () => {
      const candidates = await resolveModelCandidates("opus", {
        token: "tid=test-copilot-token",
      });

      assertEquals(candidates, [
        "claude-opus-4.8",
        "claude-opus-4.7",
        "claude-sonnet-4.6",
      ]);
    });
  },
);

Deno.test(
  "resolveModelCandidates falls back from generic opus alias to latest live Sonnet model",
  async () => {
    await withModelsStub([
      "claude-sonnet-4.5",
      "claude-sonnet-4.6",
      "claude-haiku-4.5",
    ], async () => {
      const candidates = await resolveModelCandidates("opus", {
        token: "tid=test-copilot-token",
      });

      assertEquals(candidates, ["claude-sonnet-4.6", "claude-sonnet-4.5"]);
    });
  },
);
