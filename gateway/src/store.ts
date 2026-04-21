import { join } from "@std/path";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type ModelMappingPolicy = "compatible" | "strict";

export interface ConfigEntry {
  agentName: string;
  configPath: string;
  backupPath: string | null;
  endpoint: string;
  appliedAt: string;
  validatedAt: string | null;
}

export interface StreamingConfig {
  /** Timeout in milliseconds to force flush incomplete lines. Default: 50ms. */
  flushTimeoutMs: number;
  /** Maximum buffer size in bytes before forcing a flush. Default: 1024 bytes. */
  maxBufferBytes: number;
  /** Enable aggressive flushing for better streaming experience. Default: true. */
  enableAggressiveFlushing: boolean;
  /** Enable streaming diagnostics collection. Default: false. */
  enableDiagnostics: boolean;
  /** ReadableStream high water mark. Default: 16384. */
  highWaterMark: number;
}

export interface UsageMetricsConfig {
  /** Enable periodic snapshot persistence to disk. Default: false. */
  persist: boolean;
  /** Snapshot interval in milliseconds when persistence is enabled. Default: 60000ms. */
  snapshotIntervalMs: number;
  /** Optional absolute path for persisted metrics file. Default: ~/.modmux/usage.json */
  filePath: string | null;
}

export type CopilotSdkBackend = "disabled" | "external-cli";

export interface CopilotSdkConfig {
  /** Backend used to fetch real GitHub Copilot quota data. Default: "disabled". */
  backend: CopilotSdkBackend;
  /** External Copilot CLI server URL used when backend="external-cli". */
  cliUrl: string | null;
  /** Auto-start a managed Copilot CLI sidecar instead of using a fixed cliUrl. */
  autoStart: boolean;
  /** Preferred localhost port for the managed Copilot CLI sidecar. */
  preferredPort: number;
}

export interface UpdatesConfig {
  /** Whether to check for newer versions once per day. Default: true. */
  checkEnabled: boolean;
}

export interface ModmuxConfig {
  /** TCP port the proxy listens on. Default: 11435. */
  port: number;
  /** Log level for ~/.modmux/modmux.log. Default: "info". */
  logLevel: LogLevel;
  /**
   * User-defined model alias overrides.
   * Merged over DEFAULT_MODEL_MAP at runtime. User entries win.
   */
  modelMap: Record<string, string>;
  /** Per-agent configuration records. */
  agents: ConfigEntry[];
  /** Model resolution policy. "compatible" allows fallback remaps; "strict" requires exact model match. */
  modelMappingPolicy: ModelMappingPolicy;
  /** ISO timestamp of last successful daemon start. */
  lastStarted: string | null;
  /** Streaming configuration for response delivery. */
  streaming: StreamingConfig;
  /** Usage metrics configuration for aggregation and optional persistence. */
  usageMetrics: UsageMetricsConfig;
  /** Copilot SDK backend configuration. */
  copilotSdk: CopilotSdkConfig;
  /** Update check and upgrade configuration. */
  updates: UpdatesConfig;
}

interface LegacyModmuxConfig extends Partial<ModmuxConfig> {
  githubUsage?: Partial<CopilotSdkConfig>;
}

export const DEFAULT_CONFIG: ModmuxConfig = {
  port: 11435,
  logLevel: "info",
  modelMap: {},
  agents: [],
  modelMappingPolicy: "compatible",
  lastStarted: null,
  streaming: {
    flushTimeoutMs: 50,
    maxBufferBytes: 1024,
    enableAggressiveFlushing: true,
    enableDiagnostics: false,
    highWaterMark: 16384,
  },
  usageMetrics: {
    persist: false,
    snapshotIntervalMs: 60_000,
    filePath: null,
  },
  copilotSdk: {
    backend: "external-cli",
    cliUrl: null,
    autoStart: true,
    preferredPort: 4321,
  },
  updates: {
    checkEnabled: true,
  },
};

function _homeDir(): string {
  return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
}

function envValue(name: string): string | undefined {
  return Deno.env.get(name);
}

export function configDir(): string {
  const fromEnv = envValue("MODMUX_CONFIG_DIR");
  if (fromEnv && fromEnv.trim()) return fromEnv;

  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".modmux");
}

function modmuxConfigPath(): string {
  return join(configDir(), "config.json");
}

function configPath(): string {
  return modmuxConfigPath();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveConfigPathForLoad(): Promise<string> {
  const canonical = modmuxConfigPath();
  if (await fileExists(canonical)) return canonical;
  return canonical;
}

function applyEnvOverrides(config: ModmuxConfig): ModmuxConfig {
  const portRaw = envValue("MODMUX_PORT");
  const logLevelRaw = envValue("MODMUX_LOG_LEVEL");
  const policyRaw = envValue("MODMUX_MODEL_MAPPING_POLICY");
  const copilotSdkBackendRaw = envValue("MODMUX_COPILOT_SDK_BACKEND") ??
    envValue("MODMUX_GITHUB_USAGE_BACKEND");
  const copilotSdkCliUrlRaw = envValue("MODMUX_COPILOT_SDK_CLI_URL") ??
    envValue("MODMUX_GITHUB_USAGE_CLI_URL");
  const copilotSdkAutoStartRaw = envValue("MODMUX_COPILOT_SDK_AUTO_START") ??
    envValue("MODMUX_GITHUB_USAGE_AUTO_START");
  const copilotSdkPreferredPortRaw = envValue(
    "MODMUX_COPILOT_SDK_PREFERRED_PORT",
  ) ?? envValue(
    "MODMUX_GITHUB_USAGE_PREFERRED_PORT",
  );
  const updateCheckEnabledRaw = envValue("MODMUX_UPDATE_CHECK_ENABLED");

  const next: ModmuxConfig = { ...config };

  if (portRaw !== undefined) {
    const parsed = parseInt(portRaw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid MODMUX_PORT value: ${portRaw}`);
    }
    next.port = parsed;
  }

  if (logLevelRaw !== undefined) {
    next.logLevel = logLevelRaw as LogLevel;
  }

  if (policyRaw !== undefined) {
    next.modelMappingPolicy = policyRaw as ModelMappingPolicy;
  }

  if (
    copilotSdkBackendRaw !== undefined ||
    copilotSdkCliUrlRaw !== undefined ||
    copilotSdkAutoStartRaw !== undefined ||
    copilotSdkPreferredPortRaw !== undefined
  ) {
    next.copilotSdk = { ...config.copilotSdk };
  }
  if (copilotSdkBackendRaw !== undefined) {
    next.copilotSdk.backend = copilotSdkBackendRaw as CopilotSdkBackend;
  }
  if (copilotSdkCliUrlRaw !== undefined) {
    next.copilotSdk.cliUrl = copilotSdkCliUrlRaw.trim()
      ? copilotSdkCliUrlRaw
      : null;
  }
  if (copilotSdkAutoStartRaw !== undefined) {
    if (
      copilotSdkAutoStartRaw !== "true" && copilotSdkAutoStartRaw !== "false"
    ) {
      throw new Error(
        `Invalid MODMUX_COPILOT_SDK_AUTO_START value: ${copilotSdkAutoStartRaw}`,
      );
    }
    next.copilotSdk.autoStart = copilotSdkAutoStartRaw === "true";
  }
  if (copilotSdkPreferredPortRaw !== undefined) {
    const parsed = parseInt(copilotSdkPreferredPortRaw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(
        `Invalid MODMUX_COPILOT_SDK_PREFERRED_PORT value: ${copilotSdkPreferredPortRaw}`,
      );
    }
    next.copilotSdk.preferredPort = parsed;
  }

  if (updateCheckEnabledRaw !== undefined) {
    next.updates = { ...config.updates };
  }
  if (updateCheckEnabledRaw !== undefined) {
    if (
      updateCheckEnabledRaw !== "true" && updateCheckEnabledRaw !== "false"
    ) {
      throw new Error(
        `Invalid MODMUX_UPDATE_CHECK_ENABLED value: ${updateCheckEnabledRaw}`,
      );
    }
    next.updates.checkEnabled = updateCheckEnabledRaw === "true";
  }
  return next;
}

function validate(config: ModmuxConfig): void {
  if (config.port < 1024 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}. Must be 1024–65535.`);
  }
  const validLevels: LogLevel[] = ["debug", "info", "warn", "error"];
  if (!validLevels.includes(config.logLevel)) {
    throw new Error(`Invalid logLevel: ${config.logLevel}`);
  }
  for (const [k, v] of Object.entries(config.modelMap)) {
    if (!k.trim() || !v.trim()) {
      throw new Error(`modelMap entry has empty key or value: "${k}" → "${v}"`);
    }
  }
  const validPolicies: ModelMappingPolicy[] = ["compatible", "strict"];
  if (!validPolicies.includes(config.modelMappingPolicy)) {
    throw new Error(`Invalid modelMappingPolicy: ${config.modelMappingPolicy}`);
  }
  for (const entry of config.agents) {
    if (
      !entry.agentName.trim() || !entry.configPath.trim() ||
      !entry.endpoint.trim()
    ) {
      throw new Error(
        `ConfigEntry missing required fields for agent "${entry.agentName}"`,
      );
    }
  }

  // Validate streaming configuration
  if (config.streaming) {
    if (
      config.streaming.flushTimeoutMs < 1 ||
      config.streaming.flushTimeoutMs > 10000
    ) {
      throw new Error(
        `Invalid streaming.flushTimeoutMs: ${config.streaming.flushTimeoutMs}. Must be 1-10000ms.`,
      );
    }
    if (
      config.streaming.maxBufferBytes < 64 ||
      config.streaming.maxBufferBytes > 1048576
    ) {
      throw new Error(
        `Invalid streaming.maxBufferBytes: ${config.streaming.maxBufferBytes}. Must be 64 bytes - 1MB.`,
      );
    }
    if (
      config.streaming.highWaterMark < 1024 ||
      config.streaming.highWaterMark > 1048576
    ) {
      throw new Error(
        `Invalid streaming.highWaterMark: ${config.streaming.highWaterMark}. Must be 1024 bytes - 1MB.`,
      );
    }
  }

  if (config.usageMetrics) {
    if (
      config.usageMetrics.snapshotIntervalMs < 1000 ||
      config.usageMetrics.snapshotIntervalMs > 86_400_000
    ) {
      throw new Error(
        `Invalid usageMetrics.snapshotIntervalMs: ${config.usageMetrics.snapshotIntervalMs}. Must be 1000ms - 86400000ms.`,
      );
    }
    if (
      config.usageMetrics.filePath !== null &&
      !config.usageMetrics.filePath.trim()
    ) {
      throw new Error("Invalid usageMetrics.filePath: cannot be empty string");
    }
  }

  if (config.copilotSdk) {
    const validBackends: CopilotSdkBackend[] = ["disabled", "external-cli"];
    if (!validBackends.includes(config.copilotSdk.backend)) {
      throw new Error(
        `Invalid copilotSdk.backend: ${config.copilotSdk.backend}`,
      );
    }
    if (
      config.copilotSdk.cliUrl !== null &&
      !config.copilotSdk.cliUrl.trim()
    ) {
      throw new Error("Invalid copilotSdk.cliUrl: cannot be empty string");
    }
    if (
      config.copilotSdk.autoStart &&
      config.copilotSdk.backend !== "external-cli"
    ) {
      throw new Error(
        "Invalid copilotSdk configuration: autoStart requires backend external-cli",
      );
    }
    if (
      config.copilotSdk.preferredPort < 1024 ||
      config.copilotSdk.preferredPort > 65535
    ) {
      throw new Error(
        `Invalid copilotSdk.preferredPort: ${config.copilotSdk.preferredPort}. Must be 1024–65535.`,
      );
    }
    // Allow cliUrl to be null for external-cli backend when autoStart is false;
    // runtime will default to 127.0.0.1:4301 if not provided.
  }
}

export async function loadConfig(): Promise<ModmuxConfig> {
  const path = await resolveConfigPathForLoad();
  try {
    const raw = await Deno.readTextFile(path);
    const parsed = JSON.parse(raw) as LegacyModmuxConfig;
    const migratedCopilotSdk = {
      ...DEFAULT_CONFIG.copilotSdk,
      ...(parsed.githubUsage || {}),
      ...(parsed.copilotSdk || {}),
    };
    const config: ModmuxConfig = applyEnvOverrides({
      ...DEFAULT_CONFIG,
      ...parsed,
      // Ensure streaming config has defaults if partially specified
      streaming: {
        ...DEFAULT_CONFIG.streaming,
        ...(parsed.streaming || {}),
      },
      // Ensure usage metrics config has defaults if partially specified
      usageMetrics: {
        ...DEFAULT_CONFIG.usageMetrics,
        ...(parsed.usageMetrics || {}),
      },
      copilotSdk: migratedCopilotSdk,
      updates: {
        checkEnabled: parsed.updates?.checkEnabled ??
          DEFAULT_CONFIG.updates.checkEnabled,
      },
    });
    validate(config);
    return config;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // First run — create config dir and return defaults
      await Deno.mkdir(configDir(), { recursive: true });
      const config = applyEnvOverrides({ ...DEFAULT_CONFIG } as ModmuxConfig);
      validate(config);
      return config;
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse ${path}: ${err.message}`);
    }
    throw err;
  }
}

export async function saveConfig(config: ModmuxConfig): Promise<void> {
  validate(config);
  await Deno.mkdir(configDir(), { recursive: true });
  await Deno.writeTextFile(
    configPath(),
    JSON.stringify(config, null, 2) + "\n",
  );
}
