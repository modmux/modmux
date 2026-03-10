import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../../src/config/store.ts";
import type { CocoConfig } from "../../src/config/store.ts";

// Use a temp directory for all tests to avoid touching ~/.coco
async function withTempHome<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmp = await Deno.makeTempDir({ prefix: "coco_test_" });
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

Deno.test("loadConfig — returns DEFAULT_CONFIG on first run", async () => {
  await withTempHome(async () => {
    const config = await loadConfig();
    assertEquals(config.port, DEFAULT_CONFIG.port);
    assertEquals(config.logLevel, DEFAULT_CONFIG.logLevel);
    assertEquals(config.agents, []);
    assertEquals(config.modelMap, {});
    assertEquals(config.lastStarted, null);
  });
});

Deno.test("loadConfig — creates ~/.coco dir if absent", async () => {
  await withTempHome(async (home) => {
    await loadConfig();
    const stat = await Deno.stat(join(home, ".coco"));
    assertEquals(stat.isDirectory, true);
  });
});

Deno.test("saveConfig + loadConfig — round-trip", async () => {
  await withTempHome(async () => {
    const config: CocoConfig = {
      port: 12345,
      logLevel: "debug",
      modelMap: { "claude-3": "claude-3-sonnet" },
      agents: [],
      lastStarted: "2026-01-01T00:00:00.000Z",
    };
    await saveConfig(config);
    const loaded = await loadConfig();
    assertEquals(loaded.port, 12345);
    assertEquals(loaded.logLevel, "debug");
    assertEquals(loaded.modelMap, { "claude-3": "claude-3-sonnet" });
    assertEquals(loaded.lastStarted, "2026-01-01T00:00:00.000Z");
  });
});

Deno.test("saveConfig — rejects invalid port (low)", async () => {
  await withTempHome(async () => {
    await assertRejects(
      () => saveConfig({ ...DEFAULT_CONFIG, port: 80 }),
      Error,
      "Invalid port",
    );
  });
});

Deno.test("saveConfig — rejects invalid port (high)", async () => {
  await withTempHome(async () => {
    await assertRejects(
      () => saveConfig({ ...DEFAULT_CONFIG, port: 99999 }),
      Error,
      "Invalid port",
    );
  });
});

Deno.test("saveConfig — rejects invalid logLevel", async () => {
  await withTempHome(async () => {
    await assertRejects(
      // deno-lint-ignore no-explicit-any
      () => saveConfig({ ...DEFAULT_CONFIG, logLevel: "verbose" as any }),
      Error,
      "Invalid logLevel",
    );
  });
});

Deno.test("loadConfig — throws on malformed JSON", async () => {
  await withTempHome(async (home) => {
    const dir = join(home, ".coco");
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(join(dir, "config.json"), "{ bad json }");
    await assertRejects(
      () => loadConfig(),
      Error,
      "Failed to parse",
    );
  });
});
