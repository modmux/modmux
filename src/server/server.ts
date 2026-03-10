import { stopClient } from "./copilot.ts";
import { loadConfig } from "../config/store.ts";
import { log, setLogLevel } from "../lib/log.ts";
import { saveConfig } from "../config/store.ts";

export interface ServerConfig {
  port: number;
  hostname: string;
}

export async function getConfig(): Promise<ServerConfig> {
  const config = await loadConfig();
  setLogLevel(config.logLevel);

  // Persist lastStarted timestamp
  await saveConfig({ ...config, lastStarted: new Date().toISOString() });

  return {
    port: config.port,
    hostname: "127.0.0.1",
  };
}

export async function shutdown(): Promise<void> {
  log("info", "Server shutting down");
  await stopClient();
}

export function addShutdownHandler(): void {
  Deno.addSignalListener("SIGTERM", async () => {
    await shutdown();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGINT", async () => {
    await shutdown();
    Deno.exit(0);
  });
}
