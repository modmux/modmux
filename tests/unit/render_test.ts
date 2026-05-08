import { assertEquals } from "@std/assert";
import { buildTUIState } from "../../gateway/src/render.ts";
import type { ServiceState } from "../../gateway/src/status.ts";

function baseServiceState(): ServiceState {
  return {
    running: false,
    serviceInstalled: false,
    pid: null,
    port: 11434,
    authStatus: "unknown",
  };
}

Deno.test("buildTUIState includes installed version", () => {
  const state = buildTUIState(
    baseServiceState(),
    [],
    new Set<string>(),
    new Set<string>(),
    "0.6.0",
  );

  assertEquals(state.installedVersion, "0.6.0");
  assertEquals(state.updateVersion, null);
});

Deno.test("buildTUIState keeps installed and update versions distinct", () => {
  const state = buildTUIState(
    baseServiceState(),
    [],
    new Set<string>(),
    new Set<string>(),
    "0.6.0",
    "0.6.0",
  );

  assertEquals(state.installedVersion, "0.6.0");
  assertEquals(state.updateVersion, "0.6.0");
});
