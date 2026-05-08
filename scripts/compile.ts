import { fromFileUrl, resolve } from "@std/path";

const COMPILE_PERMISSIONS = [
  "--allow-net",
  "--allow-env",
  "--allow-run",
  "--allow-read",
  "--allow-write",
  "--allow-ffi",
] as const;

export interface CompileOptions {
  cwd?: string;
  output: string;
  source?: string;
  target?: string;
}

function repoRoot(): string {
  return resolve(fromFileUrl(new URL("..", import.meta.url)));
}

export function buildCompileArgs(
  { output, source = "cli/src/main.ts", target }: CompileOptions,
): string[] {
  const args = [
    "compile",
    ...COMPILE_PERMISSIONS,
  ];

  if (target?.trim()) {
    args.push("--target", target.trim());
  }

  args.push("--output", output, source);
  return args;
}

export async function runCompile(options: CompileOptions): Promise<void> {
  const command = new Deno.Command("deno", {
    args: buildCompileArgs(options),
    cwd: options.cwd ?? repoRoot(),
    stdout: "inherit",
    stderr: "inherit",
  });

  const { success, code } = await command.output();
  if (!success) {
    Deno.exit(code);
  }
}

if (import.meta.main) {
  await runCompile({
    output: Deno.env.get("OUTPUT_FILE_NAME") ?? "bin/modmux",
    target: Deno.env.get("DENO_TARGET") ?? undefined,
  });
}
