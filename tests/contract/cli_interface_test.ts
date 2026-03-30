import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<RunResult> {
  const command = new Deno.Command("deno", {
    args: ["run", "-A", "cli/src/main.ts", ...args],
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
    env,
  });

  const output = await command.output();

  return {
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
    exitCode: output.code,
  };
}

Deno.test("CLI contract: --version prints version string and exits 0", async () => {
  const result = await runCli(["--version"]);
  assertMatch(result.stdout, /^Modmux v\d+\.\d+\.\d+/);
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: -v alias prints version string and exits 0", async () => {
  const result = await runCli(["-v"]);
  assertMatch(result.stdout, /^Modmux v\d+\.\d+\.\d+/);
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: --help prints usage and exits 0", async () => {
  const result = await runCli(["--help"]);
  assertStringIncludes(result.stdout, "Modmux");
  assertStringIncludes(result.stdout, "Usage: modmux");
  assertStringIncludes(result.stdout, "start");
  assertStringIncludes(result.stdout, "--version");
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: -h alias prints usage and exits 0", async () => {
  const result = await runCli(["-h"]);
  assertStringIncludes(result.stdout, "Modmux");
  assertStringIncludes(result.stdout, "--version");
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: --help includes model-policy command", async () => {
  const result = await runCli(["--help"]);
  assertStringIncludes(result.stdout, "model-policy");
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: model-policy prints current default", async () => {
  const tempHome = await Deno.makeTempDir({
    prefix: "modmux_cli_policy_default_",
  });
  try {
    const result = await runCli(["model-policy"], { HOME: tempHome });
    assertStringIncludes(result.stdout, "Model mapping policy: compatible");
    assertEquals(result.exitCode, 0);
  } finally {
    await Deno.remove(tempHome, { recursive: true });
  }
});

Deno.test("CLI contract: model-policy strict persists setting", async () => {
  const tempHome = await Deno.makeTempDir({ prefix: "modmux_cli_policy_set_" });
  try {
    const setResult = await runCli(["model-policy", "strict"], {
      HOME: tempHome,
    });
    assertStringIncludes(
      setResult.stdout,
      "Model mapping policy set to: strict",
    );
    assertEquals(setResult.exitCode, 0);

    const getResult = await runCli(["model-policy"], { HOME: tempHome });
    assertStringIncludes(getResult.stdout, "Model mapping policy: strict");
    assertEquals(getResult.exitCode, 0);
  } finally {
    await Deno.remove(tempHome, { recursive: true });
  }
});

Deno.test("CLI contract: model-policy rejects invalid value", async () => {
  const tempHome = await Deno.makeTempDir({
    prefix: "modmux_cli_policy_invalid_",
  });
  try {
    const result = await runCli(["model-policy", "auto"], { HOME: tempHome });
    assertStringIncludes(result.stderr, "Invalid model policy");
    assertEquals(result.exitCode, 1);
  } finally {
    await Deno.remove(tempHome, { recursive: true });
  }
});
