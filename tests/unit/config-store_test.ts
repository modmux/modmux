import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "@modmux/gateway";
import type { ModmuxConfig } from "@modmux/gateway";

// Use a temp directory for all tests to avoid touching ~/.modmux
async function withTempHome<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmp = await Deno.makeTempDir({ prefix: "modmux_test_" });
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
    assertEquals(config.modelMappingPolicy, "compatible");
    assertEquals(config.lastStarted, null);
    assertEquals(config.usageMetrics.persist, false);
    assertEquals(config.usageMetrics.snapshotIntervalMs, 60_000);
    assertEquals(config.usageMetrics.filePath, null);
  });
});

Deno.test("loadConfig — creates ~/.modmux dir if absent", async () => {
  await withTempHome(async (home) => {
    await loadConfig();
    const stat = await Deno.stat(join(home, ".modmux"));
    assertEquals(stat.isDirectory, true);
  });
});

Deno.test("loadConfig — migrates legacy ~/.modmux/config.json to ~/.modmux", async () => {
  await withTempHome(async (home) => {
    const legacyDir = join(home, ".modmux");
    const canonicalDir = join(home, ".modmux");
    await Deno.mkdir(legacyDir, { recursive: true });

    const legacyConfig: ModmuxConfig = {
      ...DEFAULT_CONFIG,
      port: 12000,
      logLevel: "debug",
    };

    await Deno.writeTextFile(
      join(legacyDir, "config.json"),
      JSON.stringify(legacyConfig, null, 2) + "\n",
    );

    const loaded = await loadConfig();
    assertEquals(loaded.port, 12000);
    assertEquals(loaded.logLevel, "debug");

    const migratedRaw = await Deno.readTextFile(
      join(canonicalDir, "config.json"),
    );
    const migrated = JSON.parse(migratedRaw) as ModmuxConfig;
    assertEquals(migrated.port, 12000);
    assertEquals(migrated.logLevel, "debug");
  });
});

Deno.test("loadConfig — migration remains idempotent across repeated loads", async () => {
  await withTempHome(async (home) => {
    const legacyDir = join(home, ".modmux");
    const canonicalDir = join(home, ".modmux");
    await Deno.mkdir(legacyDir, { recursive: true });

    await Deno.writeTextFile(
      join(legacyDir, "config.json"),
      JSON.stringify({ ...DEFAULT_CONFIG, port: 14000 }, null, 2) + "\n",
    );

    const first = await loadConfig();
    const second = await loadConfig();

    assertEquals(first.port, 14000);
    assertEquals(second.port, 14000);

    const canonicalRaw = await Deno.readTextFile(
      join(canonicalDir, "config.json"),
    );
    const canonical = JSON.parse(canonicalRaw) as ModmuxConfig;
    assertEquals(canonical.port, 14000);
  });
});

Deno.test("saveConfig + loadConfig — round-trip", async () => {
  await withTempHome(async () => {
    const config: ModmuxConfig = {
      port: 12345,
      logLevel: "debug",
      modelMap: { "claude-3": "claude-3-sonnet" },
      agents: [],
      modelMappingPolicy: "strict",
      lastStarted: "2026-01-01T00:00:00.000Z",
      streaming: {
        flushTimeoutMs: 100,
        maxBufferBytes: 2048,
        enableAggressiveFlushing: false,
        enableDiagnostics: true,
        highWaterMark: 32768,
      },
      usageMetrics: {
        persist: true,
        snapshotIntervalMs: 120_000,
        filePath: "/tmp/coco-usage.json",
      },
    };
    await saveConfig(config);
    const loaded = await loadConfig();
    assertEquals(loaded.port, 12345);
    assertEquals(loaded.logLevel, "debug");
    assertEquals(loaded.modelMap, { "claude-3": "claude-3-sonnet" });
    assertEquals(loaded.modelMappingPolicy, "strict");
    assertEquals(loaded.lastStarted, "2026-01-01T00:00:00.000Z");
    assertEquals(loaded.streaming.flushTimeoutMs, 100);
    assertEquals(loaded.streaming.enableDiagnostics, true);
    assertEquals(loaded.usageMetrics.persist, true);
    assertEquals(loaded.usageMetrics.snapshotIntervalMs, 120_000);
    assertEquals(loaded.usageMetrics.filePath, "/tmp/coco-usage.json");
  });
});

Deno.test("saveConfig — rejects invalid modelMappingPolicy", async () => {
  await withTempHome(async () => {
    await assertRejects(
      () =>
        saveConfig({
          ...DEFAULT_CONFIG,
          modelMappingPolicy:
            "auto" as unknown as ModmuxConfig["modelMappingPolicy"],
        }),
      Error,
      "Invalid modelMappingPolicy",
    );
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
      () =>
        saveConfig({
          ...DEFAULT_CONFIG,
          logLevel: "verbose" as unknown as ModmuxConfig["logLevel"],
        }),
      Error,
      "Invalid logLevel",
    );
  });
});

Deno.test("loadConfig — throws on malformed JSON", async () => {
  await withTempHome(async (home) => {
    const dir = join(home, ".modmux");
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(join(dir, "config.json"), "{ bad json }");
    await assertRejects(
      () => loadConfig(),
      Error,
      "Failed to parse",
    );
  });
});

Deno.test("loadConfig — MODMUX_PORT overrides file/default", async () => {
  await withTempHome(async () => {
    Deno.env.set("MODMUX_PORT", "13000");
    try {
      const loaded = await loadConfig();
      assertEquals(loaded.port, 13000);
    } finally {
      Deno.env.delete("MODMUX_PORT");
    }
  });
});

Deno.test("loadConfig — throws on invalid MODMUX_PORT", async () => {
  await withTempHome(async () => {
    Deno.env.set("MODMUX_PORT", "not-a-number");
    try {
      await assertRejects(
        () => loadConfig(),
        Error,
        "Invalid MODMUX_PORT value",
      );
    } finally {
      Deno.env.delete("MODMUX_PORT");
    }
  });
});
