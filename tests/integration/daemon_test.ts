/**
 * Integration tests for the daemon lifecycle.
 *
 * These tests compile the binary, spawn it as a real process, and verify
 * the start / stop / status / port-conflict flows.
 *
 * Requirements:
 *  - `deno task compile` or `deno compile` must produce `bin/coco`
 *  - Tests are marked as ignore (failing) until T014/T016/T017 are complete.
 */
import { assertEquals } from "@std/assert";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkPort(port: number): Promise<boolean> {
  try {
    const conn = await Deno.connect({ hostname: "127.0.0.1", port });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({
  name: "daemon — coco start binds to 127.0.0.1:11434 and /health returns 200",
  ignore: true, // TODO: enable after T014/T016/T017 complete
  async fn() {
    const stat = await Deno.stat("bin/coco").catch(() => null);
    if (!stat) {
      const compile = new Deno.Command("deno", {
        args: ["task", "compile"],
        stdout: "null",
        stderr: "null",
      });
      await compile.output();
    }

    const proc = new Deno.Command("bin/coco", {
      args: ["start"],
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    let bound = false;
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (await checkPort(11434)) {
        bound = true;
        break;
      }
    }
    assertEquals(bound, true, "Port 11434 never bound");

    const resp = await fetch("http://127.0.0.1:11434/health");
    assertEquals(resp.status, 200);
    const body = await resp.json() as Record<string, unknown>;
    assertEquals(body.status, "ok");

    const stop = await new Deno.Command("bin/coco", {
      args: ["stop"],
      stdout: "piped",
    }).output();
    const stopText = new TextDecoder().decode(stop.stdout).trim();
    assertEquals(stopText, "Coco stopped.");

    proc.unref();
  },
});

Deno.test({
  name: "daemon — coco start prints 'already running' when running",
  ignore: true, // TODO: enable after T014/T016/T017 complete
  async fn() {
    const proc = new Deno.Command("bin/coco", {
      args: ["start"],
      stdout: "null",
    }).spawn();

    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (await checkPort(11434)) break;
    }

    const second = await new Deno.Command("bin/coco", {
      args: ["start"],
      stdout: "piped",
    }).output();
    const text = new TextDecoder().decode(second.stdout).trim();
    assertEquals(true, text.includes("already running"));

    await new Deno.Command("bin/coco", { args: ["stop"] }).output();
    proc.unref();
  },
});

Deno.test({
  name: "daemon — coco stop when not running prints 'not running'",
  ignore: true, // TODO: enable after T014/T016/T017 complete
  async fn() {
    const out = await new Deno.Command("bin/coco", {
      args: ["stop"],
      stdout: "piped",
    }).output();
    const text = new TextDecoder().decode(out.stdout).trim();
    assertEquals(text, "Coco is not running.");
  },
});

Deno.test({
  name: "daemon — port conflict: scans upward to next free port",
  ignore: true, // TODO: enable after T014/T016/T017 complete
  async fn() {
    const blocker = Deno.listen({ hostname: "127.0.0.1", port: 11434 });
    try {
      const proc = new Deno.Command("bin/coco", {
        args: ["start"],
        stdout: "piped",
      }).spawn();

      let bound = false;
      for (let i = 0; i < 50; i++) {
        await sleep(100);
        if (await checkPort(11435)) {
          bound = true;
          break;
        }
      }
      assertEquals(bound, true, "Port 11435 never bound after conflict on 11434");

      await new Deno.Command("bin/coco", { args: ["stop"] }).output();
      proc.unref();
    } finally {
      blocker.close();
    }
  },
});
