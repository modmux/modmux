import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCoco(args: string[]): Promise<RunResult> {
  const command = new Deno.Command("deno", {
    args: ["run", "-A", "src/cli/main.ts", ...args],
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
  });

  const output = await command.output();

  return {
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
    exitCode: output.code,
  };
}

Deno.test("CLI contract: --version prints version string and exits 0", async () => {
  const result = await runCoco(["--version"]);
  assertMatch(result.stdout, /^Coco v\d+\.\d+\.\d+/);
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: -v alias prints version string and exits 0", async () => {
  const result = await runCoco(["-v"]);
  assertMatch(result.stdout, /^Coco v\d+\.\d+\.\d+/);
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: --help prints usage and exits 0", async () => {
  const result = await runCoco(["--help"]);
  assertStringIncludes(result.stdout, "Coco");
  assertStringIncludes(result.stdout, "start");
  assertStringIncludes(result.stdout, "--version");
  assertEquals(result.exitCode, 0);
});

Deno.test("CLI contract: -h alias prints usage and exits 0", async () => {
  const result = await runCoco(["-h"]);
  assertStringIncludes(result.stdout, "Coco");
  assertStringIncludes(result.stdout, "--version");
  assertEquals(result.exitCode, 0);
});

