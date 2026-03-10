import { join } from "@std/path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ConfigEntry {
  agentName: string;
  configPath: string;
  backupPath: string | null;
  endpoint: string;
  appliedAt: string;
  validatedAt: string | null;
}

export interface CocoConfig {
  /** TCP port the proxy listens on. Default: 11434. */
  port: number;
  /** Log level for ~/.coco/coco.log. Default: "info". */
  logLevel: LogLevel;
  /**
   * User-defined model alias overrides.
   * Merged over DEFAULT_MODEL_MAP at runtime. User entries win.
   */
  modelMap: Record<string, string>;
  /** Per-agent configuration records. */
  agents: ConfigEntry[];
  /** ISO timestamp of last successful daemon start. */
  lastStarted: string | null;
}

export const DEFAULT_CONFIG: CocoConfig = {
  port: 11434,
  logLevel: "info",
  modelMap: {},
  agents: [],
  lastStarted: null,
};

function configDir(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".coco");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

function validate(config: CocoConfig): void {
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
  for (const entry of config.agents) {
    if (!entry.agentName.trim() || !entry.configPath.trim() || !entry.endpoint.trim()) {
      throw new Error(`ConfigEntry missing required fields for agent "${entry.agentName}"`);
    }
  }
}

export async function loadConfig(): Promise<CocoConfig> {
  const path = configPath();
  try {
    const raw = await Deno.readTextFile(path);
    const parsed = JSON.parse(raw) as Partial<CocoConfig>;
    const config: CocoConfig = { ...DEFAULT_CONFIG, ...parsed };
    validate(config);
    return config;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // First run — create config dir and return defaults
      await Deno.mkdir(configDir(), { recursive: true });
      return { ...DEFAULT_CONFIG };
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse ~/.coco/config.json: ${err.message}`);
    }
    throw err;
  }
}

export async function saveConfig(config: CocoConfig): Promise<void> {
  validate(config);
  await Deno.mkdir(configDir(), { recursive: true });
  await Deno.writeTextFile(configPath(), JSON.stringify(config, null, 2) + "\n");
}
