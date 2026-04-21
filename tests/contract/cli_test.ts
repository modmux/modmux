import { assertEquals, assertStringIncludes } from "@std/assert";

const CLI_PATH = "./cli/src/main.ts";

// ... (existing tests here)

// --- Copilot toggle tests ---
import { join } from "@std/path";

Deno.test({
  name: "CLI set copilot on sets config to enable Copilot",
  async fn() {
    // Create a temp config dir
    const tmp = await Deno.makeTempDir();
    const configPath = join(tmp, "config.json");

    // Run the CLI to enable copilot
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "set", "copilot", "on"],
      env: { MODMUX_CONFIG_DIR: tmp },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const out = new TextDecoder().decode(process.stdout);
    assertStringIncludes(out, "Copilot SDK is now ON");
    // Validate config.json content
    const config = JSON.parse(await Deno.readTextFile(configPath));
    assertEquals(config.copilotSdk.backend, "external-cli");
    assertEquals(config.copilotSdk.autoStart, true);
    assertEquals(config.copilotSdk.cliUrl, null);
  },
});

Deno.test({
  name: "CLI set copilot off sets config to disable Copilot",
  async fn() {
    // Create a temp config dir
    const tmp = await Deno.makeTempDir();
    const configPath = join(tmp, "config.json");
    // Pre-enable then disable
    let process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "set", "copilot", "on"],
      env: { MODMUX_CONFIG_DIR: tmp },
      stdout: "null",
      stderr: "null",
    }).outputSync();
    // Now disable
    process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "set", "copilot", "off"],
      env: { MODMUX_CONFIG_DIR: tmp },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const out = new TextDecoder().decode(process.stdout);
    assertStringIncludes(out, "Copilot SDK is now OFF");
    // Validate config.json content
    const config = JSON.parse(await Deno.readTextFile(configPath));
    assertEquals(config.copilotSdk.backend, "disabled");
    assertEquals(config.copilotSdk.autoStart, false);
    assertEquals(config.copilotSdk.cliUrl, null);
  },
});

Deno.test({
  name:
    "CLI set copilot with invalid argument prints error and keeps config unchanged",
  async fn() {
    // Create a temp config dir
    const tmp = await Deno.makeTempDir();
    const configPath = join(tmp, "config.json");
    // Start from default config by enabling once
    let process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "set", "copilot", "on"],
      env: { MODMUX_CONFIG_DIR: tmp },
      stdout: "null",
      stderr: "null",
    }).outputSync();
    const preConfig = JSON.parse(await Deno.readTextFile(configPath));
    // Now run with invalid argument
    process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "set", "copilot", "maybe"],
      env: { MODMUX_CONFIG_DIR: tmp },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const err = new TextDecoder().decode(process.stderr);
    assertStringIncludes(err, "Invalid arguments");
    // No output to stdout
    const out = new TextDecoder().decode(process.stdout);
    assertEquals(out.trim(), "");
    // Config should not have changed
    const afterConfig = JSON.parse(await Deno.readTextFile(configPath));
    assertEquals(preConfig, afterConfig);
  },
});
