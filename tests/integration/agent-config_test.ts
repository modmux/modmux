/**
 * Integration tests for per-agent configuration (src/agents/config.ts).
 *
 * These tests use temp directories to avoid touching real config files.
 * The validateConfig() probe tests require a running daemon and are marked
 * ignore: true -- enable them with `modmux start` before running manually.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  configureAgent,
  isAgentConfigured,
  ModmuxConfig,
  unconfigureAgent,
  validateConfig,
  verifyAgentConfig,
} from "@modmux/gateway";
import { DEFAULT_CONFIG } from "@modmux/gateway";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withTempHome(
  fn: (homeDir: string, configDir: string) => Promise<void>,
): Promise<void> {
  const homeDir = await Deno.makeTempDir();
  const configDir = `${homeDir}/.modmux`;
  await Deno.mkdir(configDir, { recursive: true });
  try {
    await fn(homeDir, configDir);
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
}

/** Create a ModmuxConfig backed by a temp dir (avoids touching ~/.modmux). */
function makeTempConfig(_configDir: string): ModmuxConfig {
  // We patch saveConfig via the homeDir option — config writes go to configDir
  return { ...DEFAULT_CONFIG };
}

// ---------------------------------------------------------------------------
// Codex — TOML write with model_providers section
// ---------------------------------------------------------------------------

Deno.test("configureAgent(codex) — creates config file when none exists", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });

    assertEquals(entry.agentName, "codex");
    assertEquals(entry.backupPath, null); // no prior file
    assertEquals(entry.endpoint, "http://127.0.0.1:11434");

    const content = await Deno.readTextFile(entry.configPath);
    assertStringIncludes(content, "model_provider");
    assertStringIncludes(content, "base_url");
    assertStringIncludes(content, "http://127.0.0.1:11434");
    assertStringIncludes(content, "modmux");
    assertStringIncludes(content, 'wire_api = "responses"');
    assertStringIncludes(content, 'model = "gpt-5.4"');
    assertEquals(content.includes("auth_method"), false);
    assertEquals(content.includes("api_key"), false);
  });
});

Deno.test("configureAgent(codex) — backs up existing file before overwriting", async () => {
  await withTempHome(async (homeDir) => {
    const existingPath = `${homeDir}/.codex/config.toml`;
    await Deno.mkdir(`${homeDir}/.codex`, { recursive: true });
    await Deno.writeTextFile(existingPath, 'model = "gpt-4o"\n');

    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });

    assertEquals(entry.backupPath, `${entry.configPath}.modmux-backup`);
    const backup = await Deno.readTextFile(entry.backupPath!);
    assertStringIncludes(backup, "gpt-4o");

    const content = await Deno.readTextFile(entry.configPath);
    assertStringIncludes(content, "http://127.0.0.1:11434");
  });
});

Deno.test("configureAgent(codex) — preserves existing TOML keys on merge", async () => {
  await withTempHome(async (homeDir) => {
    const existingPath = `${homeDir}/.codex/config.toml`;
    await Deno.mkdir(`${homeDir}/.codex`, { recursive: true });
    await Deno.writeTextFile(existingPath, 'approval_policy = "on-request"\n');

    const config = makeTempConfig(homeDir);
    await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });

    const content = await Deno.readTextFile(existingPath);
    assertStringIncludes(content, "approval_policy");
    assertStringIncludes(content, "model_provider");
  });
});

Deno.test("unconfigureAgent(codex) — removes file when backupPath is null", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });
    assertEquals(entry.backupPath, null);

    const updatedConfig: ModmuxConfig = { ...config, agents: [entry] };
    await unconfigureAgent("codex", updatedConfig);

    let fileGone = false;
    try {
      await Deno.stat(entry.configPath);
    } catch {
      fileGone = true;
    }
    assertEquals(fileGone, true);
  });
});

Deno.test("unconfigureAgent(codex) — restores backup when one exists", async () => {
  await withTempHome(async (homeDir) => {
    const existingPath = `${homeDir}/.codex/config.toml`;
    await Deno.mkdir(`${homeDir}/.codex`, { recursive: true });
    const originalContent = 'model = "gpt-4o"\n';
    await Deno.writeTextFile(existingPath, originalContent);

    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });
    const updatedConfig: ModmuxConfig = { ...config, agents: [entry] };

    await unconfigureAgent("codex", updatedConfig);

    const restored = await Deno.readTextFile(existingPath);
    assertEquals(restored, originalContent);

    let backupGone = false;
    try {
      await Deno.stat(entry.backupPath!);
    } catch {
      backupGone = true;
    }
    assertEquals(backupGone, true);
  });
});

// ---------------------------------------------------------------------------
// Claude Code — JSON merge
// ---------------------------------------------------------------------------

Deno.test("configureAgent(claude-code) — merges only ANTHROPIC keys, preserves others", async () => {
  await withTempHome(async (homeDir) => {
    // Pre-existing settings with other fields
    const settingsPath = `${homeDir}/.claude/settings.json`;
    await Deno.mkdir(`${homeDir}/.claude`, { recursive: true });
    await Deno.writeTextFile(
      settingsPath,
      JSON.stringify({ theme: "dark", env: { OTHER_KEY: "preserve-me" } }),
    );

    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("claude-code", 11434, config, {
      homeDir,
      skipValidation: true,
    });

    const content = JSON.parse(await Deno.readTextFile(entry.configPath));
    assertEquals(content.theme, "dark");
    assertEquals(content.env.OTHER_KEY, "preserve-me");
    assertEquals(content.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:11434");
    assertEquals(content.env.ANTHROPIC_AUTH_TOKEN, "modmux");
  });
});

// ---------------------------------------------------------------------------
// Cline — full JSON write
// ---------------------------------------------------------------------------

Deno.test("configureAgent(cline) — writes globalState with openai provider fields", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("cline", 11434, config, {
      homeDir,
      skipValidation: true,
    });

    const state = JSON.parse(await Deno.readTextFile(entry.configPath));
    assertEquals(state.welcomeViewCompleted, true);
    assertEquals(state.actModeApiProvider, "openai");
    assertEquals(state.planModeApiProvider, "openai");
    assertEquals(state.openAiBaseUrl, "http://127.0.0.1:11434");
    assertEquals(state.actModeOpenAiModelId, "gpt-4o");

    const secretsPath = `${homeDir}/.cline/data/secrets.json`;
    const secrets = JSON.parse(await Deno.readTextFile(secretsPath));
    assertEquals(secrets.openAiApiKey, "modmux");
  });
});

// ---------------------------------------------------------------------------
// isAgentConfigured + verifyAgentConfig
// ---------------------------------------------------------------------------

Deno.test("isAgentConfigured returns false when agent not in config", () => {
  const config = { ...DEFAULT_CONFIG, agents: [] };
  assertEquals(isAgentConfigured("codex", config), false);
});

Deno.test("isAgentConfigured returns true after configureAgent is called", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });
    const updatedConfig: ModmuxConfig = { ...config, agents: [entry] };
    assertEquals(isAgentConfigured("codex", updatedConfig), true);
  });
});

Deno.test("verifyAgentConfig returns true when config file contains endpoint", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });
    assertEquals(await verifyAgentConfig(entry), true);
  });
});

Deno.test("verifyAgentConfig returns false when config file is missing", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });
    // Delete the config file to simulate external removal
    await Deno.remove(entry.configPath);
    assertEquals(await verifyAgentConfig(entry), false);
  });
});

Deno.test("verifyAgentConfig returns false when config file no longer contains endpoint", async () => {
  await withTempHome(async (homeDir) => {
    const config = makeTempConfig(homeDir);
    const entry = await configureAgent("codex", 11434, config, {
      homeDir,
      skipValidation: true,
    });
    // Overwrite with content that doesn't include the modmux endpoint
    await Deno.writeTextFile(entry.configPath, 'model = "gpt-4o"\n');
    assertEquals(await verifyAgentConfig(entry), false);
  });
});

// ---------------------------------------------------------------------------
// Unknown agent
// ---------------------------------------------------------------------------

Deno.test("configureAgent throws on unknown agent name", async () => {
  const config = { ...DEFAULT_CONFIG };
  let threw = false;
  try {
    await configureAgent("no-such-agent", 11434, config, {
      skipValidation: true,
    });
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Unknown agent");
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// Validation probe (requires running daemon — manually enabled)
// ---------------------------------------------------------------------------

Deno.test({
  name: "validateConfig returns true against running daemon",
  ignore: true,
  fn: async () => {
    const valid = await validateConfig(11434);
    assertEquals(valid, true);
  },
});
