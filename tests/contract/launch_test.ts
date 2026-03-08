import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  findClaudeBinary,
  launchClaudeCode,
  printInstallInstructions,
} from "../../src/cli/launch.ts";

// ---------------------------------------------------------------------------
// T008(a): launchClaudeCode — happy path exits 0
// ---------------------------------------------------------------------------
Deno.test(
  "launchClaudeCode exits 0 when subprocess exits 0",
  async () => {
    // Use `deno eval` as a no-op subprocess that immediately exits 0
    const exitCode = await launchClaudeCode(
      Deno.execPath(),
      9999,
      ["eval", ""],
    );
    assertEquals(exitCode, 0);
  },
);

// ---------------------------------------------------------------------------
// T008(b): launchClaudeCode — ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are set, ANTHROPIC_API_KEY is unset
// ---------------------------------------------------------------------------
Deno.test(
  "launchClaudeCode sets ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN, unsets ANTHROPIC_API_KEY in subprocess env",
  async () => {
    // Start a local test server to receive the env var values from the subprocess.
    // (No --allow-write needed; subprocess uses deno eval which has --allow-all.)
    let receivedBaseUrl = "";
    let receivedAuthToken = "";
    let receivedApiKey = "present"; // sentinel — should become empty if unset

    const testServer = Deno.serve(
      { port: 0, hostname: "127.0.0.1", onListen: () => {} },
      (req) => {
        const url = new URL(req.url);
        receivedBaseUrl = url.searchParams.get("base") ?? "";
        receivedAuthToken = url.searchParams.get("token") ?? "";
        receivedApiKey = url.searchParams.get("key") ?? "";
        return new Response("ok");
      },
    );

    const { port: testPort } = testServer.addr as Deno.NetAddr;

    // deno eval runs with --allow-all, so it can read env and make fetch requests
    const evalCode =
      `const b=Deno.env.get("ANTHROPIC_BASE_URL")??"",t=Deno.env.get("ANTHROPIC_AUTH_TOKEN")??"",k=Deno.env.get("ANTHROPIC_API_KEY")??"";` +
      `await fetch("http://127.0.0.1:${testPort}/?base="+encodeURIComponent(b)+"&token="+encodeURIComponent(t)+"&key="+encodeURIComponent(k));`;

    await launchClaudeCode(Deno.execPath(), 12345, ["eval", evalCode]);
    await testServer.shutdown();

    assertEquals(receivedBaseUrl, "http://127.0.0.1:12345");
    assertEquals(receivedAuthToken, "claudio");
    assertEquals(receivedApiKey, ""); // must be unset to avoid auth conflict
  },
);

// ---------------------------------------------------------------------------
// T008(c): launchClaudeCode — exit code 1 from subprocess is returned as 1
// ---------------------------------------------------------------------------
Deno.test(
  "launchClaudeCode returns exit code 1 when subprocess exits 1",
  async () => {
    const exitCode = await launchClaudeCode(
      Deno.execPath(),
      9999,
      ["eval", "Deno.exit(1)"],
    );
    assertEquals(exitCode, 1);
  },
);

// ---------------------------------------------------------------------------
// T009(a): findClaudeBinary — returns null when claude is not installed
// ---------------------------------------------------------------------------
Deno.test(
  "findClaudeBinary returns null when claude is not in PATH and fallbacks do not exist",
  async () => {
    const originalPath = Deno.env.get("PATH");
    const originalHome = Deno.env.get("HOME");

    try {
      // Point PATH and HOME to paths that don't exist:
      //  - which/where can't be found → Deno.Command throws NotFound (caught)
      //  - HOME fallback dirs don't exist → Deno.stat throws (caught)
      Deno.env.set("PATH", "/tmp/__claudio_no_such_path_xyz789");
      Deno.env.set("HOME", "/tmp/__claudio_no_such_home_xyz789");

      const result = await findClaudeBinary();
      assertEquals(result, null);
    } finally {
      if (originalPath !== undefined) {
        Deno.env.set("PATH", originalPath);
      } else {
        Deno.env.delete("PATH");
      }
      if (originalHome !== undefined) {
        Deno.env.set("HOME", originalHome);
      } else {
        Deno.env.delete("HOME");
      }
    }
  },
);

// ---------------------------------------------------------------------------
// T009(b): printInstallInstructions — output contains npm install cmd and URL
// ---------------------------------------------------------------------------
Deno.test(
  "printInstallInstructions output contains npm install command",
  () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(" "));

    try {
      printInstallInstructions();
    } finally {
      console.log = originalLog;
    }

    const text = lines.join("\n");
    assertStringIncludes(text, "npm install -g @anthropic-ai/claude-code");
    assertStringIncludes(text, "https://claude.ai/download");
  },
);

// ---------------------------------------------------------------------------
// T012(a): launchClaudeCode — returns 42 when subprocess exits with code 42
// ---------------------------------------------------------------------------
Deno.test(
  "launchClaudeCode returns 42 when subprocess exits with code 42",
  async () => {
    const exitCode = await launchClaudeCode(
      Deno.execPath(),
      9999,
      ["eval", "Deno.exit(42)"],
    );
    assertEquals(exitCode, 42);
  },
);

// ---------------------------------------------------------------------------
// T012(b): launchClaudeCode — returns non-zero when subprocess is killed by signal
// ---------------------------------------------------------------------------
Deno.test(
  "launchClaudeCode returns non-zero when subprocess is killed by signal",
  async () => {
    // deno eval has --allow-all, so Deno.kill works without additional flags.
    // On Unix, SIGKILL causes status.code to be non-zero (typically 128+9=137).
    // The `status.code ?? 1` fallback is a defensive safety net for platforms
    // where code might be null; this test verifies signal death is non-zero.
    const exitCode = await launchClaudeCode(
      Deno.execPath(),
      9999,
      ["eval", "Deno.kill(Deno.pid, 'SIGKILL')"],
    );
    assert(
      exitCode !== 0,
      `Expected non-zero exit code for signal-killed process, got ${exitCode}`,
    );
  },
);
