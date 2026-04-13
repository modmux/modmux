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

export type GitHubUsageBackend = "disabled" | "external-cli";

export interface GitHubUsageConfig {
  /** Backend used to fetch real GitHub Copilot quota data. Default: "disabled". */
  backend: GitHubUsageBackend;
  /** External Copilot CLI server URL used when backend="external-cli". */
  cliUrl: string | null;
  /** Auto-start a managed Copilot CLI sidecar instead of using a fixed cliUrl. */
  autoStart: boolean;
  /** Preferred localhost port for the managed Copilot CLI sidecar. */
  preferredPort: number;
}

export interface ModmuxConfig {
  /** TCP port the proxy listens on. Default: 11434. */
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
  /** GitHub Copilot quota backend configuration. */
  githubUsage: GitHubUsageConfig;
}

export const DEFAULT_CONFIG: ModmuxConfig = {
  port: 11434,
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
  githubUsage: {
    backend: "disabled",
    cliUrl: null,
    autoStart: false,
    preferredPort: 4321,
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

function cocoConfigPath(): string {
  return join(configDir(), "config.json");
}

function configPath(): string {
  return cocoConfigPath();
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
  const canonical = cocoConfigPath();
  if (await fileExists(canonical)) return canonical;
  return canonical;
}

function applyEnvOverrides(config: ModmuxConfig): ModmuxConfig {
  const portRaw = envValue("MODMUX_PORT");
  const logLevelRaw = envValue("MODMUX_LOG_LEVEL");
  const policyRaw = envValue("MODMUX_MODEL_MAPPING_POLICY");
  const githubUsageBackendRaw = envValue("MODMUX_GITHUB_USAGE_BACKEND");
  const githubUsageCliUrlRaw = envValue("MODMUX_GITHUB_USAGE_CLI_URL");
  const githubUsageAutoStartRaw = envValue("MODMUX_GITHUB_USAGE_AUTO_START");
  const githubUsagePreferredPortRaw = envValue(
    "MODMUX_GITHUB_USAGE_PREFERRED_PORT",
  );

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
    githubUsageBackendRaw !== undefined ||
    githubUsageCliUrlRaw !== undefined ||
    githubUsageAutoStartRaw !== undefined ||
    githubUsagePreferredPortRaw !== undefined
  ) {
    next.githubUsage = { ...config.githubUsage };
  }
  if (githubUsageBackendRaw !== undefined) {
    next.githubUsage.backend = githubUsageBackendRaw as GitHubUsageBackend;
  }
  if (githubUsageCliUrlRaw !== undefined) {
    next.githubUsage.cliUrl = githubUsageCliUrlRaw.trim()
      ? githubUsageCliUrlRaw
      : null;
  }
  if (githubUsageAutoStartRaw !== undefined) {
    if (
      githubUsageAutoStartRaw !== "true" && githubUsageAutoStartRaw !== "false"
    ) {
      throw new Error(
        `Invalid MODMUX_GITHUB_USAGE_AUTO_START value: ${githubUsageAutoStartRaw}`,
      );
    }
    next.githubUsage.autoStart = githubUsageAutoStartRaw === "true";
  }
  if (githubUsagePreferredPortRaw !== undefined) {
    const parsed = parseInt(githubUsagePreferredPortRaw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(
        `Invalid MODMUX_GITHUB_USAGE_PREFERRED_PORT value: ${githubUsagePreferredPortRaw}`,
      );
    }
    next.githubUsage.preferredPort = parsed;
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

  if (config.githubUsage) {
    const validBackends: GitHubUsageBackend[] = ["disabled", "external-cli"];
    if (!validBackends.includes(config.githubUsage.backend)) {
      throw new Error(
        `Invalid githubUsage.backend: ${config.githubUsage.backend}`,
      );
    }
    if (
      config.githubUsage.cliUrl !== null &&
      !config.githubUsage.cliUrl.trim()
    ) {
      throw new Error("Invalid githubUsage.cliUrl: cannot be empty string");
    }
    if (
      config.githubUsage.autoStart &&
      config.githubUsage.backend !== "external-cli"
    ) {
      throw new Error(
        "Invalid githubUsage configuration: autoStart requires backend external-cli",
      );
    }
    if (
      config.githubUsage.preferredPort < 1024 ||
      config.githubUsage.preferredPort > 65535
    ) {
      throw new Error(
        `Invalid githubUsage.preferredPort: ${config.githubUsage.preferredPort}. Must be 1024–65535.`,
      );
    }
    if (
      config.githubUsage.backend === "external-cli" &&
      !config.githubUsage.autoStart &&
      config.githubUsage.cliUrl === null
    ) {
      throw new Error(
        "Invalid githubUsage configuration: cliUrl is required when backend is external-cli and autoStart is false",
      );
    }
  }
}

export async function loadConfig(): Promise<ModmuxConfig> {
  const path = await resolveConfigPathForLoad();
  try {
    const raw = await Deno.readTextFile(path);
    const parsed = JSON.parse(raw) as Partial<ModmuxConfig>;
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
      githubUsage: {
        ...DEFAULT_CONFIG.githubUsage,
        ...(parsed.githubUsage || {}),
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
