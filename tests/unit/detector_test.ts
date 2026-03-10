/**
 * Unit tests for src/agents/detector.ts
 *
 * Uses temp directories and synthetic PATH/extension dirs to exercise all
 * detection strategies without requiring actual tools to be installed.
 */

import { assertEquals } from "@std/assert";
import { detectAll, detectOne } from "../../src/agents/detector.ts";
import type { AgentRecord } from "../../src/agents/registry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(
  overrides: Partial<AgentRecord> = {},
): AgentRecord {
  return {
    name: "test-agent",
    displayName: "Test Agent",
    binaryNames: ["test-agent-bin"],
    extensionIds: ["publisher.test-agent"],
    state: "not-installed",
    ...overrides,
  };
}

async function withTempDir(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir();
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Binary detection (strategy 1 → "installed")
// ---------------------------------------------------------------------------

Deno.test("detectOne returns 'installed' when binary is found on PATH", async () => {
  await withTempDir(async (dir) => {
    // Create a fake binary file
    const binPath = `${dir}/test-agent-bin`;
    await Deno.writeTextFile(binPath, "#!/bin/sh\necho ok\n");

    const agent = makeAgent({ binaryNames: ["test-agent-bin"] });
    const state = await detectOne(agent, {
      pathDirs: [dir],
      extensionDirs: [],
      jetbrainsDirs: [],
    });

    assertEquals(state, "installed");
  });
});

Deno.test("detectOne checks all binaryNames — returns 'installed' on first match", async () => {
  await withTempDir(async (dir) => {
    // Only the second binary exists
    await Deno.writeTextFile(`${dir}/second-bin`, "#!/bin/sh\n");

    const agent = makeAgent({ binaryNames: ["first-bin", "second-bin"] });
    const state = await detectOne(agent, {
      pathDirs: [dir],
      extensionDirs: [],
      jetbrainsDirs: [],
    });

    assertEquals(state, "installed");
  });
});

Deno.test("detectOne returns 'not-installed' when binary is a directory, not a file", async () => {
  await withTempDir(async (dir) => {
    // Create a *directory* with the binary name — should not count
    await Deno.mkdir(`${dir}/test-agent-bin`);

    const agent = makeAgent({ binaryNames: ["test-agent-bin"] });
    const state = await detectOne(agent, {
      pathDirs: [dir],
      extensionDirs: [],
      jetbrainsDirs: [],
    });

    assertEquals(state, "not-installed");
  });
});

// ---------------------------------------------------------------------------
// Extension detection (strategy 2 → "detected")
// ---------------------------------------------------------------------------

Deno.test("detectOne returns 'detected' when VS Code extension dir is present", async () => {
  await withTempDir(async (dir) => {
    // Simulate ~/.vscode/extensions/publisher.test-agent-1.2.3/
    await Deno.mkdir(`${dir}/publisher.test-agent-1.2.3`);

    const agent = makeAgent({
      binaryNames: [], // no binary → won't be "installed"
      extensionIds: ["publisher.test-agent"],
    });
    const state = await detectOne(agent, {
      pathDirs: [],
      extensionDirs: [dir],
      jetbrainsDirs: [],
    });

    assertEquals(state, "detected");
  });
});

Deno.test("detectOne extension match is prefix-based (version suffix ignored)", async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(`${dir}/saoudrizwan.claude-dev-2.0.0`);

    const agent = makeAgent({
      binaryNames: [],
      extensionIds: ["saoudrizwan.claude-dev"],
    });
    const state = await detectOne(agent, {
      pathDirs: [],
      extensionDirs: [dir],
      jetbrainsDirs: [],
    });

    assertEquals(state, "detected");
  });
});

Deno.test("detectOne returns 'not-installed' when extension ID prefix does not match", async () => {
  await withTempDir(async (dir) => {
    // Different publisher
    await Deno.mkdir(`${dir}/other.extension-1.0.0`);

    const agent = makeAgent({
      binaryNames: [],
      extensionIds: ["publisher.test-agent"],
    });
    const state = await detectOne(agent, {
      pathDirs: [],
      extensionDirs: [dir],
      jetbrainsDirs: [],
    });

    assertEquals(state, "not-installed");
  });
});

// ---------------------------------------------------------------------------
// Priority: installed > detected > not-installed
// ---------------------------------------------------------------------------

Deno.test("detectOne returns 'installed' even when extension is also present (installed wins)", async () => {
  await withTempDir(async (binDir) => {
    await withTempDir(async (extDir) => {
      // Both binary and extension are present
      await Deno.writeTextFile(`${binDir}/test-agent-bin`, "#!/bin/sh\n");
      await Deno.mkdir(`${extDir}/publisher.test-agent-1.0.0`);

      const agent = makeAgent({
        binaryNames: ["test-agent-bin"],
        extensionIds: ["publisher.test-agent"],
      });
      const state = await detectOne(agent, {
        pathDirs: [binDir],
        extensionDirs: [extDir],
        jetbrainsDirs: [],
      });

      assertEquals(state, "installed");
    });
  });
});

// ---------------------------------------------------------------------------
// Nothing found → not-installed
// ---------------------------------------------------------------------------

Deno.test("detectOne returns 'not-installed' when no binary and no extension found", async () => {
  await withTempDir(async (dir) => {
    const agent = makeAgent();
    const state = await detectOne(agent, {
      pathDirs: [dir], // empty dir
      extensionDirs: [dir],
      jetbrainsDirs: [],
    });

    assertEquals(state, "not-installed");
  });
});

Deno.test("detectOne returns 'not-installed' when agent has no binaryNames and no extensionIds", async () => {
  await withTempDir(async (dir) => {
    const agent = makeAgent({ binaryNames: [], extensionIds: [] });
    const state = await detectOne(agent, {
      pathDirs: [dir],
      extensionDirs: [dir],
      jetbrainsDirs: [],
    });

    assertEquals(state, "not-installed");
  });
});

// ---------------------------------------------------------------------------
// detectAll
// ---------------------------------------------------------------------------

Deno.test("detectAll returns a result for every agent in AGENT_REGISTRY", async () => {
  const { AGENT_REGISTRY } = await import("../../src/agents/registry.ts");

  // Use empty dirs so no agents are found — just testing result structure
  const results = await detectAll({
    pathDirs: [],
    extensionDirs: [],
    jetbrainsDirs: [],
  });

  assertEquals(results.length, AGENT_REGISTRY.length);
  for (const r of results) {
    assertEquals(r.state, "not-installed");
    assertEquals(typeof r.agent.name, "string");
  }
});

Deno.test("detectAll correctly identifies one installed agent among others", async () => {
  await withTempDir(async (binDir) => {
    // Only 'claude' binary present → claude-code should be "installed"
    await Deno.writeTextFile(`${binDir}/claude`, "#!/bin/sh\n");

    const results = await detectAll({
      pathDirs: [binDir],
      extensionDirs: [],
      jetbrainsDirs: [],
    });

    const claudeResult = results.find((r) => r.agent.name === "claude-code");
    const aiderResult = results.find((r) => r.agent.name === "aider");

    assertEquals(claudeResult?.state, "installed");
    assertEquals(aiderResult?.state, "not-installed");
  });
});
