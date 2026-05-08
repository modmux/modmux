import { assertEquals } from "@std/assert";

const MODULE_URL = new URL("../../cli/src/upgrade.ts", import.meta.url).href;

Deno.test("detectAssetNameFor includes windows arm64", async () => {
  const { _test } = await import(MODULE_URL);

  assertEquals(
    _test.detectAssetNameFor("windows", "aarch64"),
    "modmux-windows-arm64.exe",
  );
  assertEquals(
    _test.detectAssetNameFor("windows", "x86_64"),
    "modmux-windows-x64.exe",
  );
  assertEquals(_test.detectAssetNameFor("windows", "unknown"), null);
});
