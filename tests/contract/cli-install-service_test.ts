/**
 * Contract tests for modmux install-service / uninstall-service CLI commands.
 *
 * Verifies that:
 * - install-service and uninstall-service appear in --help output
 */

import { assertStringIncludes } from "@std/assert";

const CLI_PATH = "./cli/src/main.ts";

// ---------------------------------------------------------------------------
// Help text contracts
// ---------------------------------------------------------------------------

Deno.test({
  name: "CLI --help includes install-service command",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--help"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);
    assertStringIncludes(output, "install-service");
  },
});

Deno.test({
  name: "CLI --help includes uninstall-service command",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--help"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);
    assertStringIncludes(output, "uninstall-service");
  },
});

Deno.test({
  name:
    "CLI --help includes descriptions for install-service and uninstall-service",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--help"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);
    // Both commands should have brief descriptions
    assertStringIncludes(output, "Register daemon");
    assertStringIncludes(output, "Remove daemon");
  },
});
