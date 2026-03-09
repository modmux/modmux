import { assertEquals } from "@std/assert";
import { getLatestSessionId } from "../../src/cli/session.ts";

Deno.test("getLatestSessionId returns null when ~/.claude/projects does not exist", async () => {
  const tmpDir = await Deno.makeTempDir();
  const original = Deno.env.get("HOME");
  Deno.env.set("HOME", tmpDir);
  try {
    assertEquals(await getLatestSessionId(), null);
  } finally {
    if (original !== undefined) Deno.env.set("HOME", original);
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("getLatestSessionId returns null for a non-existent path", async () => {
  const original = Deno.env.get("HOME");
  Deno.env.set("HOME", "/nonexistent-claudio-test-path-xyz");
  try {
    assertEquals(await getLatestSessionId(), null);
  } finally {
    if (original !== undefined) Deno.env.set("HOME", original);
  }
});

Deno.test("getLatestSessionId returns UUID of most recent session", async () => {
  const tmpDir = await Deno.makeTempDir();
  const projectDir = `${tmpDir}/.claude/projects/-test-project`;
  await Deno.mkdir(projectDir, { recursive: true });

  const uuid1 = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa";
  const uuid2 = "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb";

  await Deno.writeTextFile(`${projectDir}/${uuid1}.jsonl`, '{"type":"test"}');
  await new Promise((r) => setTimeout(r, 15)); // ensure different mtime
  await Deno.writeTextFile(`${projectDir}/${uuid2}.jsonl`, '{"type":"test"}');

  const original = Deno.env.get("HOME");
  Deno.env.set("HOME", tmpDir);
  try {
    assertEquals(await getLatestSessionId(), uuid2);
  } finally {
    if (original !== undefined) Deno.env.set("HOME", original);
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("getLatestSessionId returns most recent across multiple project dirs", async () => {
  const tmpDir = await Deno.makeTempDir();
  const dir1 = `${tmpDir}/.claude/projects/-project-a`;
  const dir2 = `${tmpDir}/.claude/projects/-project-b`;
  await Deno.mkdir(dir1, { recursive: true });
  await Deno.mkdir(dir2, { recursive: true });

  const uuidOld = "cccccccc-3333-3333-3333-cccccccccccc";
  const uuidNew = "dddddddd-4444-4444-4444-dddddddddddd";

  await Deno.writeTextFile(`${dir1}/${uuidOld}.jsonl`, '{"type":"test"}');
  await new Promise((r) => setTimeout(r, 15));
  await Deno.writeTextFile(`${dir2}/${uuidNew}.jsonl`, '{"type":"test"}');

  const original = Deno.env.get("HOME");
  Deno.env.set("HOME", tmpDir);
  try {
    assertEquals(await getLatestSessionId(), uuidNew);
  } finally {
    if (original !== undefined) Deno.env.set("HOME", original);
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("getLatestSessionId ignores non-jsonl files", async () => {
  const tmpDir = await Deno.makeTempDir();
  const projectDir = `${tmpDir}/.claude/projects/-test-project`;
  await Deno.mkdir(projectDir, { recursive: true });

  await Deno.writeTextFile(
    `${projectDir}/settings.json`,
    '{"type":"settings"}',
  );

  const original = Deno.env.get("HOME");
  Deno.env.set("HOME", tmpDir);
  try {
    assertEquals(await getLatestSessionId(), null);
  } finally {
    if (original !== undefined) Deno.env.set("HOME", original);
    await Deno.remove(tmpDir, { recursive: true });
  }
});
