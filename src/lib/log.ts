import { join } from "@std/path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export async function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  });

  const logPath = join(Deno.env.get("HOME") ?? "~", ".coco", "coco.log");

  try {
    await Deno.writeTextFile(logPath, entry + "\n", { append: true });
  } catch {
    // no-op when log file is unwritable (e.g. permissions, missing dir)
  }
}

/** Read the last N lines from the log matching a given level. */
export async function readLastLogLines(
  level: LogLevel,
  n: number,
): Promise<string[]> {
  const logPath = join(Deno.env.get("HOME") ?? "~", ".coco", "coco.log");
  try {
    const text = await Deno.readTextFile(logPath);
    const lines = text.trim().split("\n").filter((l) => l.trim());
    return lines
      .filter((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed.level === level;
        } catch {
          return false;
        }
      })
      .slice(-n);
  } catch {
    return [];
  }
}
