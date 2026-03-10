import { assertEquals } from "@std/assert";
import { DEFAULT_MODEL_MAP, resolveModel } from "../../src/agents/models.ts";

Deno.test("resolveModel — known alias maps correctly", () => {
  assertEquals(resolveModel("gpt-4o"), "gpt-4o");
  assertEquals(resolveModel("claude-3-5-sonnet"), "claude-3.5-sonnet");
  assertEquals(resolveModel("default"), "gpt-4o");
});

Deno.test("resolveModel — unknown name passes through unchanged", () => {
  assertEquals(resolveModel("some-future-model"), "some-future-model");
  assertEquals(resolveModel("gpt-99"), "gpt-99");
});

Deno.test("resolveModel — user override wins over DEFAULT_MODEL_MAP", () => {
  const overrides = { "gpt-4o": "my-custom-model" };
  assertEquals(resolveModel("gpt-4o", overrides), "my-custom-model");
});

Deno.test("resolveModel — user override does not affect other entries", () => {
  const overrides = { "gpt-4o": "my-custom-model" };
  assertEquals(resolveModel("gpt-4o-mini", overrides), "gpt-4o-mini");
});

Deno.test("resolveModel — user-only alias (not in DEFAULT_MODEL_MAP)", () => {
  const overrides = { "my-alias": "target-model-id" };
  assertEquals(resolveModel("my-alias", overrides), "target-model-id");
});

Deno.test("DEFAULT_MODEL_MAP — contains all expected base keys", () => {
  const requiredKeys = [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3-5-sonnet",
    "claude-3-opus",
    "default",
  ];
  for (const key of requiredKeys) {
    assertEquals(
      key in DEFAULT_MODEL_MAP,
      true,
      `DEFAULT_MODEL_MAP missing key: ${key}`,
    );
  }
});
