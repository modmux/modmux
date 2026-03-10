/**
 * Agent detection engine.
 *
 * Determines whether each registered agent is `installed`, `detected`,
 * or `not-installed` by scanning PATH, VS Code/Cursor extension directories,
 * JetBrains plugin directories, and known config file paths.
 *
 * Priority: installed > detected > not-installed
 */

import { type AgentRecord, AGENT_REGISTRY, type AgentState } from "./registry.ts";

/** Options to override default scan paths — primarily for testing. */
export interface DetectorOptions {
  /** Explicit list of dirs to search for binaries (overrides PATH). */
  pathDirs?: string[];
  /** VS Code / Cursor extension dirs to scan. */
  extensionDirs?: string[];
  /** JetBrains plugin dirs to scan. */
  jetbrainsDirs?: string[];
}

export interface DetectionResult {
  agent: AgentRecord;
  state: AgentState;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve binary search dirs from PATH + extra well-known locations. */
function resolveBinaryDirs(overrides?: string[]): string[] {
  if (overrides !== undefined) return overrides;

  const isWindows = Deno.build.os === "windows";
  const sep = isWindows ? ";" : ":";
  const dirs = (Deno.env.get("PATH") ?? "").split(sep).filter(Boolean);

  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
  if (home) {
    dirs.push(
      `${home}/.local/bin`,
      `${home}/.npm-global/bin`,
      `${home}/go/bin`,
    );
  }
  if (isWindows) {
    const appData = Deno.env.get("APPDATA") ?? "";
    if (appData) dirs.push(`${appData}\\npm`);
  }
  return dirs;
}

/** Resolve VS Code / Cursor extension root directories. */
function resolveExtensionDirs(overrides?: string[]): string[] {
  if (overrides !== undefined) return overrides;

  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
  if (!home) return [];

  return [
    `${home}/.vscode/extensions`,
    `${home}/.cursor/extensions`,
    `${home}/.vscode-insiders/extensions`,
  ];
}

/** Resolve JetBrains plugin root directories (per research.md R-005). */
function resolveJetBrainsDirs(overrides?: string[]): string[] {
  if (overrides !== undefined) return overrides;

  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
  if (!home) return [];

  switch (Deno.build.os) {
    case "darwin":
      return [`${home}/Library/Application Support/JetBrains`];
    case "windows": {
      const appData = Deno.env.get("APPDATA") ?? "";
      return appData ? [`${appData}\\JetBrains`] : [];
    }
    default: // linux
      return [`${home}/.local/share/JetBrains`];
  }
}

/** Check whether a file or directory exists at `path`. */
async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Look for any of the agent's binaries in the given dirs. */
async function findBinaryInDirs(
  binaryNames: string[],
  dirs: string[],
): Promise<boolean> {
  const isWindows = Deno.build.os === "windows";
  const sep = isWindows ? "\\" : "/";
  const exts = isWindows ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of dirs) {
    for (const name of binaryNames) {
      for (const ext of exts) {
        const candidate = `${dir}${sep}${name}${ext}`;
        try {
          const info = await Deno.stat(candidate);
          if (info.isFile) return true;
        } catch {
          // not found here
        }
      }
    }
  }
  return false;
}

/** Look for any of the agent's extension IDs as a directory prefix in the given root dirs. */
async function findExtensionInDirs(
  extensionIds: string[],
  rootDirs: string[],
): Promise<boolean> {
  for (const rootDir of rootDirs) {
    try {
      for await (const entry of Deno.readDir(rootDir)) {
        if (!entry.isDirectory) continue;
        for (const extId of extensionIds) {
          // Extension dirs are like "saoudrizwan.claude-dev-1.2.3" — match by prefix
          if (entry.name.startsWith(extId)) return true;
        }
      }
    } catch {
      // dir doesn't exist or isn't readable
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the state of a single agent.
 * Returns `installed` if any binary is found on PATH.
 * Returns `detected` if any VS Code/JetBrains extension is found.
 * Returns `not-installed` otherwise.
 */
export async function detectOne(
  agent: AgentRecord,
  options?: DetectorOptions,
): Promise<AgentState> {
  const binaryDirs = resolveBinaryDirs(options?.pathDirs);
  const extensionDirs = resolveExtensionDirs(options?.extensionDirs);
  const jetbrainsDirs = resolveJetBrainsDirs(options?.jetbrainsDirs);

  // Strategy 1: binary found on PATH → installed
  if (agent.binaryNames.length > 0) {
    if (await findBinaryInDirs(agent.binaryNames, binaryDirs)) {
      return "installed";
    }
  }

  // Strategy 2: VS Code / Cursor extension present → detected
  if (agent.extensionIds.length > 0) {
    const allExtDirs = [...extensionDirs, ...jetbrainsDirs];
    if (await findExtensionInDirs(agent.extensionIds, allExtDirs)) {
      return "detected";
    }
  }

  return "not-installed";
}

/**
 * Detect the state of all registered agents.
 * Returns a result array in the same order as AGENT_REGISTRY.
 */
export async function detectAll(
  options?: DetectorOptions,
): Promise<DetectionResult[]> {
  return await Promise.all(
    AGENT_REGISTRY.map(async (agent) => ({
      agent,
      state: await detectOne(agent, options),
    })),
  );
}

/** Look up a DetectionResult by agent name. */
export function getDetectionResult(
  results: DetectionResult[],
  name: string,
): DetectionResult | undefined {
  return results.find((r) => r.agent.name === name);
}

/** Check if a file exists at a known path (used for config-file detection). */
export async function detectByConfigFile(
  configPaths: string[],
): Promise<boolean> {
  for (const p of configPaths) {
    if (await exists(p)) return true;
  }
  return false;
}
