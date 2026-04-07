/**
 * Per-agent configuration writers.
 *
 * Writes the endpoint configuration for each supported agent so it routes
 * API traffic through Modmux's local proxy. Backs up original files and
 * supports reversible unconfigure.
 */

import { parse as parseToml, stringify as stringifyToml } from "@std/toml";
import { dirname, join } from "@std/path";
import { type ConfigEntry, type ModmuxConfig, saveConfig } from "./store.ts";
import { getAgent } from "./registry.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ConfigureOptions {
  /** Override home directory (primarily for testing). */
  homeDir?: string;
  /** Override current working directory for project-relative configs (Kilo). */
  cwd?: string;
  /** Skip the post-write validation test call. */
  skipValidation?: boolean;
  /** Skip creating a fresh backup before rewriting an existing config. */
  backupExisting?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveHome(options?: ConfigureOptions): string {
  return (
    options?.homeDir ??
      Deno.env.get("HOME") ??
      Deno.env.get("USERPROFILE") ??
      "."
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Backup a file to `<path>.modmux-backup`. Returns the backup path. */
async function backupFile(path: string): Promise<string> {
  const backupPath = `${path}.modmux-backup`;
  await Deno.copyFile(path, backupPath);
  return backupPath;
}

/** Ensure all parent directories of `path` exist. */
async function ensureDir(path: string): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
}

// ---------------------------------------------------------------------------
// Per-agent config path resolvers
// ---------------------------------------------------------------------------

function claudeCodeConfigPath(homeDir: string): string {
  return join(homeDir, ".claude", "settings.json");
}

function clineConfigPath(homeDir: string): string {
  return join(homeDir, ".cline", "data", "globalState.json");
}

function clineSecretsPath(homeDir: string): string {
  return join(homeDir, ".cline", "data", "secrets.json");
}

function codexConfigPath(homeDir: string): string {
  return join(homeDir, ".codex", "config.toml");
}

// ---------------------------------------------------------------------------
// Per-agent write logic (T032)
// ---------------------------------------------------------------------------

interface WriteResult {
  configPath: string;
  backupPath: string | null;
}

async function writeClaudeCode(
  port: number,
  options?: ConfigureOptions,
): Promise<WriteResult> {
  const configPath = claudeCodeConfigPath(resolveHome(options));
  let backupPath: string | null = null;
  const backupExisting = options?.backupExisting ?? true;

  let existing: Record<string, unknown> = {};
  if (await fileExists(configPath)) {
    if (backupExisting) {
      backupPath = await backupFile(configPath);
    }
    const raw = await Deno.readTextFile(configPath);
    existing = JSON.parse(raw) as Record<string, unknown>;
  }

  const existingEnv = (existing.env as Record<string, unknown>) ?? {};
  const updated = {
    ...existing,
    env: {
      ...existingEnv,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      ANTHROPIC_AUTH_TOKEN: "modmux",
    },
  };

  await ensureDir(configPath);
  await Deno.writeTextFile(configPath, JSON.stringify(updated, null, 2) + "\n");
  return { configPath, backupPath };
}

async function writeCline(
  port: number,
  options?: ConfigureOptions,
): Promise<WriteResult> {
  const homeDir = resolveHome(options);
  const configPath = clineConfigPath(homeDir);
  const secretsPath = clineSecretsPath(homeDir);
  let backupPath: string | null = null;
  const backupExisting = options?.backupExisting ?? true;

  let existing: Record<string, unknown> = {};
  if (await fileExists(configPath)) {
    if (backupExisting) {
      backupPath = await backupFile(configPath);
    }
    const raw = await Deno.readTextFile(configPath);
    existing = JSON.parse(raw) as Record<string, unknown>;
  }

  // Merge modmux proxy settings into the flat globalState format used by the
  // official Cline CLI. Setting welcomeViewCompleted prevents the setup wizard.
  const updated = {
    ...existing,
    welcomeViewCompleted: true,
    actModeApiProvider: "openai",
    planModeApiProvider: "openai",
    actModeOpenAiModelId: "gpt-4o",
    planModeOpenAiModelId: "gpt-4o",
    openAiBaseUrl: `http://127.0.0.1:${port}`,
  };

  await ensureDir(configPath);
  await Deno.writeTextFile(configPath, JSON.stringify(updated, null, 2) + "\n");

  // API key is stored in a separate secrets file (plain JSON in CLI version).
  const existingSecrets: Record<string, unknown> = (await fileExists(
      secretsPath,
    ))
    ? JSON.parse(await Deno.readTextFile(secretsPath)) as Record<
      string,
      unknown
    >
    : {};
  await Deno.writeTextFile(
    secretsPath,
    JSON.stringify({ ...existingSecrets, openAiApiKey: "modmux" }, null, 2) +
      "\n",
  );

  return { configPath, backupPath };
}

async function writeCodex(
  port: number,
  options?: ConfigureOptions,
): Promise<WriteResult> {
  const configPath = codexConfigPath(resolveHome(options));
  let backupPath: string | null = null;
  const backupExisting = options?.backupExisting ?? true;

  let existing: Record<string, unknown> = {};
  if (await fileExists(configPath)) {
    if (backupExisting) {
      backupPath = await backupFile(configPath);
    }
    const raw = await Deno.readTextFile(configPath);
    existing = parseToml(raw) as Record<string, unknown>;
  }

  const existingProviders =
    (existing.model_providers as Record<string, unknown>) ?? {};
  const updated = {
    ...existing,
    // Use a Codex-native model to avoid local metadata fallback warnings.
    model: "gpt-5.4",
    model_provider: "modmux",
    model_providers: {
      ...existingProviders,
      modmux: {
        name: "Modmux",
        base_url: `http://127.0.0.1:${port}/v1/`,
      },
    },
  };

  await ensureDir(configPath);
  await Deno.writeTextFile(
    configPath,
    "# Written by modmux configure codex\n" + stringifyToml(updated),
  );
  return { configPath, backupPath };
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

type AgentWriter = (
  port: number,
  options?: ConfigureOptions,
) => Promise<WriteResult>;

const AGENT_WRITERS: Record<string, AgentWriter> = {
  "claude-code": writeClaudeCode,
  "cline": writeCline,
  "codex": writeCodex,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Perform a 1-token probe against the running Modmux proxy to verify
 * that an agent's config would work. Returns true if the probe succeeds.
 */
export async function validateConfig(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer modmux",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
    await res.body?.cancel();
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify that an agent's config file still exists and contains the Modmux
 * endpoint. Returns false if the file is missing or was overwritten by
 * the agent (i.e., modmux settings are no longer present).
 */
export async function verifyAgentConfig(entry: ConfigEntry): Promise<boolean> {
  try {
    const content = await Deno.readTextFile(entry.configPath);

    // Codex uses the Responses API for OpenAI-compatible providers. The
    // explicit wire_api key is optional, so accept both omitted and legacy
    // wire_api = "responses" configs.
    if (entry.agentName === "codex") {
      const parsed = parseToml(content) as Record<string, unknown>;
      if (parsed.model_provider !== "modmux") return false;

      const providers = parsed.model_providers as Record<string, unknown>;
      if (!providers || typeof providers !== "object") return false;

      const providerConfig = providers.modmux as Record<
        string,
        unknown
      >;
      if (!providerConfig || typeof providerConfig !== "object") return false;

      const baseUrl = providerConfig.base_url;
      const wireApi = providerConfig.wire_api;
      if (typeof baseUrl !== "string" || !baseUrl.includes(entry.endpoint)) {
        return false;
      }
      return wireApi === undefined || wireApi === "responses";
    }

    return content.includes(entry.endpoint);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API (T031)
// ---------------------------------------------------------------------------

/**
 * Configure an agent to route through Modmux's proxy.
 * Backs up any existing config, writes the agent-specific format, runs a
 * validation probe, and persists the ConfigEntry to ModmuxConfig.
 */
export async function configureAgent(
  agentName: string,
  port: number,
  cocoConfig: ModmuxConfig,
  options?: ConfigureOptions,
): Promise<ConfigEntry> {
  const agent = getAgent(agentName);
  if (!agent) {
    throw new Error(`Unknown agent: "${agentName}"`);
  }

  const writer = AGENT_WRITERS[agentName];
  if (!writer) {
    throw new Error(`No config writer for agent: "${agentName}"`);
  }

  const { configPath, backupPath } = await writer(port, options);

  const skipValidation = options?.skipValidation ?? false;
  let validatedAt: string | null = null;
  if (!skipValidation) {
    const valid = await validateConfig(port);
    validatedAt = valid ? new Date().toISOString() : null;
  }

  const entry: ConfigEntry = {
    agentName,
    configPath,
    backupPath,
    endpoint: `http://127.0.0.1:${port}`,
    appliedAt: new Date().toISOString(),
    validatedAt,
  };

  // Replace any existing entry for this agent
  const agents = cocoConfig.agents.filter((a) => a.agentName !== agentName);
  agents.push(entry);
  await saveConfig({ ...cocoConfig, agents });

  return entry;
}

/**
 * Rewrite configured agent endpoints to match the currently active Modmux port.
 * Preserves the original backup paths so unconfigure restores the true pre-Modmux files.
 */
export async function syncConfiguredAgentsToPort(
  port: number,
  cocoConfig: ModmuxConfig,
  options?: ConfigureOptions,
): Promise<ModmuxConfig> {
  const endpoint = `http://127.0.0.1:${port}`;
  const staleEntries = cocoConfig.agents.filter((entry) =>
    entry.endpoint !== endpoint
  );

  if (staleEntries.length === 0) {
    return cocoConfig;
  }

  const updatedAgents: ConfigEntry[] = [];
  for (const entry of cocoConfig.agents) {
    if (entry.endpoint === endpoint) {
      updatedAgents.push(entry);
      continue;
    }

    const writer = AGENT_WRITERS[entry.agentName];
    if (!writer) {
      updatedAgents.push(entry);
      continue;
    }

    const result = await writer(port, {
      ...options,
      backupExisting: false,
    });

    updatedAgents.push({
      ...entry,
      configPath: result.configPath,
      endpoint,
      appliedAt: new Date().toISOString(),
      validatedAt: null,
    });
  }

  const nextConfig = {
    ...cocoConfig,
    port,
    agents: updatedAgents,
  };
  await saveConfig(nextConfig);
  return nextConfig;
}

/**
 * Revert an agent's configuration to its pre-Modmux state.
 * Restores backup if one exists, or deletes the written file.
 * Removes the ConfigEntry from ModmuxConfig.
 */
export async function unconfigureAgent(
  agentName: string,
  cocoConfig: ModmuxConfig,
): Promise<void> {
  const entry = cocoConfig.agents.find((a) => a.agentName === agentName);
  if (!entry) {
    return; // not configured — nothing to undo
  }

  if (entry.backupPath !== null) {
    // Restore backup
    await Deno.rename(entry.backupPath, entry.configPath);
  } else {
    // No prior file -- delete the one Modmux created
    try {
      await Deno.remove(entry.configPath);
    } catch {
      // already gone — fine
    }
  }

  const agents = cocoConfig.agents.filter((a) => a.agentName !== agentName);
  await saveConfig({ ...cocoConfig, agents });
}

/**
 * Check whether an agent is currently configured in ModmuxConfig.
 */
export function isAgentConfigured(
  agentName: string,
  cocoConfig: ModmuxConfig,
): boolean {
  return cocoConfig.agents.some((a) => a.agentName === agentName);
}
