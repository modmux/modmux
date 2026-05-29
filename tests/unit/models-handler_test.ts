import { assertEquals } from "@std/assert";
import { clearTokenCache } from "@modmux/providers";
import { handleModels } from "../../gateway/src/models-handler.ts";

const TEST_GITHUB_TOKEN = "ghu_modmux_test_token";

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

function makeModelsResponse(ids: string[]): Response {
  return new Response(
    JSON.stringify({
      data: ids.map((id) => ({ id, name: id, vendor: "GitHub" })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("handleModels returns only live Copilot model ids", async () => {
  const original = globalThis.fetch;
  const originalGithubToken = Deno.env.get("MODMUX_GITHUB_TOKEN");
  Deno.env.set("MODMUX_GITHUB_TOKEN", TEST_GITHUB_TOKEN);

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
        makeModelsResponse([
          "claude-sonnet-4.6",
          "claude-opus-4.8",
          "gpt-5.4",
        ]),
      );
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const response = await handleModels();
    const body = await response.json() as { data: Array<{ id: string }> };
    const ids = body.data.map((model) => model.id);

    assertEquals(ids, ["claude-sonnet-4.6", "claude-opus-4.8", "gpt-5.4"]);
  } finally {
    globalThis.fetch = original;
    if (originalGithubToken === undefined) {
      Deno.env.delete("MODMUX_GITHUB_TOKEN");
    } else {
      Deno.env.set("MODMUX_GITHUB_TOKEN", originalGithubToken);
    }
    clearTokenCache();
  }
});
