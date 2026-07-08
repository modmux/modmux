import { assertEquals } from "@std/assert";
import { getDaemonEnv } from "../../gateway/src/daemon.ts";

Deno.test("getDaemonEnv returns system CA env when unset", () => {
  const original = Deno.env.get("DENO_TLS_CA_STORE");
  Deno.env.delete("DENO_TLS_CA_STORE");
  try {
    assertEquals(getDaemonEnv(), { DENO_TLS_CA_STORE: "system" });
  } finally {
    if (original === undefined) {
      Deno.env.delete("DENO_TLS_CA_STORE");
    } else {
      Deno.env.set("DENO_TLS_CA_STORE", original);
    }
  }
});

Deno.test("getDaemonEnv leaves explicit CA store untouched", () => {
  const original = Deno.env.get("DENO_TLS_CA_STORE");
  Deno.env.set("DENO_TLS_CA_STORE", "mozilla");
  try {
    assertEquals(getDaemonEnv(), undefined);
  } finally {
    if (original === undefined) {
      Deno.env.delete("DENO_TLS_CA_STORE");
    } else {
      Deno.env.set("DENO_TLS_CA_STORE", original);
    }
  }
});
