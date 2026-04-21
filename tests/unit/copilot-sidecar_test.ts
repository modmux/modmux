import { assertEquals } from "@std/assert";
import {
  __resetCopilotSidecarTestDeps,
  __setCopilotSidecarTestDeps,
  buildManagedCopilotSdkCliUrl,
  ensureCopilotSdkSidecarStarted,
  findAvailableCopilotSidecarPort,
  readCopilotSidecarState,
  removeCopilotSidecarState,
  resolveConfiguredCopilotSdkCliUrl,
  writeCopilotSidecarState,
} from "../../gateway/src/copilot-sidecar.ts";
import type { CopilotSdkConfig } from "../../gateway/src/store.ts";
import type { AuthToken, TokenStore } from "../../gateway/src/token.ts";

async function withTempHome<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmp = await Deno.makeTempDir({ prefix: "modmux_sidecar_" });
  const origHome = Deno.env.get("HOME");
  Deno.env.set("HOME", tmp);
  try {
    return await fn(tmp);
  } finally {
    if (origHome !== undefined) {
      Deno.env.set("HOME", origHome);
    } else {
      Deno.env.delete("HOME");
    }
    await Deno.remove(tmp, { recursive: true }).catch(() => {});
  }
}

function fakeTokenStore(token: AuthToken | null): TokenStore {
  return {
    save: () => Promise.resolve(),
    load: () => Promise.resolve(token),
    clear: () => Promise.resolve(),
    isValid: (value) => value !== null && value.expiresAt > Date.now(),
  };
}

function autoStartConfig(): CopilotSdkConfig {
  return {
    backend: "external-cli",
    cliUrl: null,
    autoStart: true,
    preferredPort: 4321,
  };
}

Deno.test.afterEach(() => {
  __resetCopilotSidecarTestDeps();
});

Deno.test("buildManagedCopilotSdkCliUrl formats localhost target", () => {
  assertEquals(buildManagedCopilotSdkCliUrl(4321), "127.0.0.1:4321");
});

Deno.test("findAvailableCopilotSidecarPort skips occupied preferred port", () => {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  try {
    const occupied = (listener.addr as Deno.NetAddr).port;
    const selected = findAvailableCopilotSidecarPort(occupied);
    assertEquals(selected > occupied, true);
  } finally {
    listener.close();
  }
});

Deno.test("copilot sidecar state round-trips and can be removed", async () => {
  await withTempHome(async () => {
    await writeCopilotSidecarState({
      pid: 1234,
      port: 4321,
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    const loaded = await readCopilotSidecarState();
    assertEquals(loaded, {
      pid: 1234,
      port: 4321,
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    await removeCopilotSidecarState();
    assertEquals(await readCopilotSidecarState(), null);
  });
});

Deno.test("resolveConfiguredCopilotSdkCliUrl returns manual cliUrl when autoStart is disabled", async () => {
  const config: CopilotSdkConfig = {
    backend: "external-cli",
    cliUrl: "127.0.0.1:5000",
    autoStart: false,
    preferredPort: 4321,
  };
  assertEquals(
    await resolveConfiguredCopilotSdkCliUrl(config),
    "127.0.0.1:5000",
  );
});

Deno.test("resolveConfiguredCopilotSdkCliUrl returns managed cliUrl from live state", async () => {
  await withTempHome(async () => {
    const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
    const port = (listener.addr as Deno.NetAddr).port;
    try {
      await writeCopilotSidecarState({
        pid: Deno.pid,
        port,
        startedAt: new Date().toISOString(),
      });
      const config: CopilotSdkConfig = {
        backend: "external-cli",
        cliUrl: null,
        autoStart: true,
        preferredPort: 4321,
      };
      assertEquals(
        await resolveConfiguredCopilotSdkCliUrl(config),
        `127.0.0.1:${port}`,
      );
    } finally {
      listener.close();
    }
  });
});

Deno.test("ensureCopilotSdkSidecarStarted returns unauthenticated when no stored token exists", async () => {
  await withTempHome(async () => {
    __setCopilotSidecarTestDeps({
      createTokenStore: () => fakeTokenStore(null),
    });

    const runtimeTarget = await ensureCopilotSdkSidecarStarted(
      autoStartConfig(),
    );
    assertEquals(runtimeTarget, {
      cliUrl: null,
      statusHint: "unauthenticated",
    });
    assertEquals(await readCopilotSidecarState(), null);
  });
});

Deno.test("ensureCopilotSdkSidecarStarted returns error when copilot binary is missing", async () => {
  await withTempHome(async () => {
    __setCopilotSidecarTestDeps({
      createTokenStore: () =>
        fakeTokenStore({
          accessToken: "token",
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        }),
      findFirstBinary: () => Promise.resolve(null),
    });

    const runtimeTarget = await ensureCopilotSdkSidecarStarted(
      autoStartConfig(),
    );
    assertEquals(runtimeTarget, { cliUrl: null, statusHint: "error" });
    assertEquals(await readCopilotSidecarState(), null);
  });
});

Deno.test("ensureCopilotSdkSidecarStarted reuses a live existing sidecar without spawning", async () => {
  await withTempHome(async () => {
    const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
    const port = (listener.addr as Deno.NetAddr).port;
    let spawnCalls = 0;
    try {
      await writeCopilotSidecarState({
        pid: Deno.pid,
        port,
        startedAt: new Date().toISOString(),
      });
      __setCopilotSidecarTestDeps({
        spawnDetached: () => {
          spawnCalls += 1;
          return Promise.resolve(9999);
        },
      });

      const runtimeTarget = await ensureCopilotSdkSidecarStarted(
        autoStartConfig(),
      );
      assertEquals(runtimeTarget, {
        cliUrl: `127.0.0.1:${port}`,
        statusHint: null,
      });
      assertEquals(spawnCalls, 0);
    } finally {
      listener.close();
    }
  });
});

Deno.test("ensureCopilotSdkSidecarStarted cleans up stale state and startup timeout", async () => {
  await withTempHome(async () => {
    let processAlive = false;
    let killedPid: number | null = null;
    let spawnCalls = 0;

    await writeCopilotSidecarState({
      pid: 111,
      port: 4555,
      startedAt: new Date().toISOString(),
    });

    __setCopilotSidecarTestDeps({
      createTokenStore: () =>
        fakeTokenStore({
          accessToken: "token",
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        }),
      isProcessAlive: (pid) => {
        if (pid === 111) return Promise.resolve(false);
        return Promise.resolve(processAlive);
      },
      findFirstBinary: () => Promise.resolve("/fake/copilot"),
      findFreePort: () => 4999,
      spawnDetached: () => {
        spawnCalls += 1;
        processAlive = true;
        return Promise.resolve(222);
      },
      connect: () => Promise.reject(new Error("not ready")),
      kill: (pid) => {
        killedPid = pid;
        processAlive = false;
      },
      sleep: async () => {},
    });

    const runtimeTarget = await ensureCopilotSdkSidecarStarted(
      autoStartConfig(),
    );
    assertEquals(runtimeTarget, { cliUrl: null, statusHint: "error" });
    assertEquals(spawnCalls, 1);
    assertEquals(killedPid, 222);
    assertEquals(await readCopilotSidecarState(), null);
  });
});
