import { assertEquals, assertStringIncludes } from "@std/assert";

const CLI_PATH = "./cli/src/main.ts";

Deno.test({
  name: "CLI --help displays Modmux help",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--help"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);

    assertStringIncludes(output, "Modmux");
    assertStringIncludes(output, "--help");
    assertStringIncludes(output, "--version");
    assertStringIncludes(output, "start");
    assertStringIncludes(output, "stop");
  },
});

Deno.test({
  name: "CLI --version displays Modmux version",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--version"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);

    assertStringIncludes(output, "Modmux v");
  },
});

Deno.test({
  name: "CLI exits with code 0 on --help",
  async fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--help"],
    }).spawn();
    const status = await process.status;
    assertEquals(status.code, 0);
  },
});

Deno.test({
  name: "CLI exits with code 0 on --version",
  async fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--version"],
    }).spawn();
    const status = await process.status;
    assertEquals(status.code, 0);
  },
});

Deno.test({
  name: "CLI accepts -h alias for --help",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "-h"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);
    assertStringIncludes(output, "Modmux");
  },
});

Deno.test({
  name: "CLI accepts -v alias for --version",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "-v"],
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);
    assertStringIncludes(output, "Modmux v");
  },
});

Deno.test({
  name: "CLI --help output contains no ANSI clear-screen sequence when piped",
  fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH, "--help"],
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const output = new TextDecoder().decode(process.stdout);
    const hasAnsiClear = output.includes("\x1b[2J") ||
      output.includes("\x1b[H");
    assertEquals(hasAnsiClear, false);
  },
});

Deno.test({
  name: "CLI without args on non-TTY prints status and exits 0",
  async fn() {
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", CLI_PATH],
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
    }).spawn();

    const status = await process.status;
    // Drain stdout/stderr to avoid resource leaks
    await process.stdout.cancel();
    await process.stderr.cancel();
    // Non-TTY path: prints status and exits 0
    assertEquals(status.code, 0);
  },
});
