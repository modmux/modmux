import { assertEquals } from "@std/assert";
import { clearTokenCache } from "@modmux/providers";
import {
  clearModelResolverCache,
  resolveModelForEndpoint,
} from "@modmux/gateway";

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

function withFetchStub(
  models: Array<Record<string, unknown>>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;

    if (url.includes("copilot_internal")) {
      return Promise.resolve(makeTokenResponse());
    }

    if (url.includes("/models")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: models }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof globalThis.fetch;

  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
    clearTokenCache();
    clearModelResolverCache();
  });
}

Deno.test("resolveModelForEndpoint keeps OpenAI fallback within same family", async () => {
  await withFetchStub([
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
  ], async () => {
    const resolution = await resolveModelForEndpoint("gpt-5.1", "responses");

    assertEquals(resolution.resolvedModel, "gpt-4o");
    assertEquals(resolution.candidateModels, ["gpt-4o", "gpt-4o-mini"]);
  });
});

Deno.test("resolveModelForEndpoint keeps Claude fallback within same family", async () => {
  await withFetchStub([
    {
      id: "claude-sonnet-4-5",
      name: "claude-sonnet-4-5",
      vendor: "GitHub",
      supported_endpoints: ["/chat/completions"],
      model_picker_category: "powerful",
    },
    {
      id: "gpt-4o",
      name: "gpt-4o",
      vendor: "GitHub",
      supported_endpoints: ["/chat/completions"],
      model_picker_category: "versatile",
    },
  ], async () => {
    const resolution = await resolveModelForEndpoint(
      "claude-3-5-sonnet",
      "chat_completions",
    );

    assertEquals(resolution.resolvedModel, "claude-sonnet-4-5");
    assertEquals(resolution.candidateModels, ["claude-sonnet-4-5"]);
  });
});

Deno.test("resolveModelForEndpoint preserves exact model before same-family fallbacks", async () => {
  await withFetchStub([
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
  ], async () => {
    const resolution = await resolveModelForEndpoint("gpt-4o", "responses");

    assertEquals(resolution.resolvedModel, "gpt-4o");
    assertEquals(resolution.candidateModels, ["gpt-4o", "gpt-4o-mini"]);
  });
});

Deno.test("resolveModelForEndpoint strict mode rejects unsupported endpoint model", async () => {
  await withFetchStub([
    {
      id: "gpt-4o",
      name: "gpt-4o",
      vendor: "GitHub",
      supported_endpoints: ["/responses"],
      model_picker_category: "versatile",
    },
  ], async () => {
    const resolution = await resolveModelForEndpoint(
      "gpt-5.4",
      "responses",
      {},
      "strict",
    );

    assertEquals(resolution.rejected, true);
    assertEquals(
      resolution.rejectReason,
      'Model "gpt-5.4" is not endpoint-compatible without remapping',
    );
  });
});
