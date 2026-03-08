import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runClaudio(args: string[]): Promise<RunResult> {
  const command = new Deno.Command("deno", {
    args: ["run", "-A", "src/cli/main.ts", ...args],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  return {
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
    exitCode: output.code,
  };
}

Deno.test("CLI contract: --version prints version string and exits 0", async () => {
  const result = await runClaudio(["--version"]);
  assertMatch(result.stdout, /^Claudio v\d+\.\d+\.\d+$/);
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: -v alias prints version string and exits 0", async () => {
  const result = await runClaudio(["-v"]);
  assertMatch(result.stdout, /^Claudio v\d+\.\d+\.\d+$/);
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: --help prints usage and exits 0", async () => {
  const result = await runClaudio(["--help"]);
  assertStringIncludes(result.stdout, "Usage: claudio");
  assertStringIncludes(result.stdout, "--version");
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: -h alias prints usage and exits 0", async () => {
  const result = await runClaudio(["-h"]);
  assertStringIncludes(result.stdout, "Usage: claudio");
  assertStringIncludes(result.stdout, "--version");
  assertEquals(result.exitCode, 0);
});
