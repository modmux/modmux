/**
 * Unit tests for service managers (platform-specific install/uninstall logic).
 *
 * Uses dryRun mode and temp directories to verify config file generation
 * without writing to the OS or running launchctl/systemctl.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { getServiceManager, UnsupportedPlatformError } from "@modmux/gateway";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempHome(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "modmux_test_home_" });
}

async function cleanup(dir: string): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// macOS plist content (dryRun)
// ---------------------------------------------------------------------------

Deno.test({
  name: "installService dryRun — macOS plist contains required keys",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    try {
      const result = await getServiceManager({ home }).install({
        dryRun: true,
      });
      assertStringIncludes(result.configContent, "com.modmux.modmux");
      assertStringIncludes(result.configContent, "--daemon");
      assertStringIncludes(result.configContent, "RunAtLoad");
      assertStringIncludes(result.configContent, "KeepAlive");
      assertStringIncludes(result.configContent, "StandardOutPath");
      assertStringIncludes(result.configContent, "modmux.log");
      assertEquals(result.installed, true);
    } catch (err) {
      // If modmux binary not found, that is expected in CI without global install
      if (
        err instanceof Error && err.message.includes("not installed globally")
      ) {
        return;
      }
      throw err;
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "installService dryRun — macOS plist path is correct",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    try {
      const result = await getServiceManager({ home }).install({
        dryRun: true,
      });
      assertStringIncludes(result.configPath, "Library/LaunchAgents");
      assertStringIncludes(result.configPath, "com.modmux.modmux.plist");
    } catch (err) {
      if (
        err instanceof Error && err.message.includes("not installed globally")
      ) {
        return;
      }
      throw err;
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "installService dryRun — does not write plist file to disk",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    try {
      const result = await getServiceManager({ home }).install({
        dryRun: true,
      });
      let exists = false;
      try {
        await Deno.stat(result.configPath);
        exists = true;
      } catch {
        // expected — should not exist
      }
      assertEquals(exists, false, "dryRun should not write file to disk");
    } catch (err) {
      if (
        err instanceof Error && err.message.includes("not installed globally")
      ) {
        return;
      }
      throw err;
    } finally {
      await cleanup(home);
    }
  },
});

// ---------------------------------------------------------------------------
// Linux systemd unit content (dryRun)
// ---------------------------------------------------------------------------

Deno.test({
  name: "installService dryRun — Linux unit contains required sections",
  ignore: Deno.build.os !== "linux",
  async fn() {
    const home = await makeTempHome();
    try {
      const result = await getServiceManager({ home }).install({
        dryRun: true,
      });
      assertStringIncludes(result.configContent, "[Unit]");
      assertStringIncludes(result.configContent, "[Service]");
      assertStringIncludes(result.configContent, "[Install]");
      assertStringIncludes(result.configContent, "--daemon");
      assertStringIncludes(result.configContent, "Restart=on-failure");
      assertStringIncludes(result.configContent, "WantedBy=default.target");
      assertStringIncludes(result.configContent, "modmux.log");
      assertEquals(result.installed, true);
    } catch (err) {
      if (
        err instanceof Error && err.message.includes("not installed globally")
      ) {
        return;
      }
      // Non-systemd Linux throws UnsupportedPlatformError — that is also acceptable
      if (err instanceof UnsupportedPlatformError) {
        return;
      }
      throw err;
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "installService dryRun — Linux unit path is correct",
  ignore: Deno.build.os !== "linux",
  async fn() {
    const home = await makeTempHome();
    try {
      const result = await getServiceManager({ home }).install({
        dryRun: true,
      });
      assertStringIncludes(result.configPath, ".config/systemd/user");
      assertStringIncludes(result.configPath, "modmux.service");
    } catch (err) {
      if (
        err instanceof Error &&
          err.message.includes("not installed globally") ||
        err instanceof UnsupportedPlatformError
      ) {
        return;
      }
      throw err;
    } finally {
      await cleanup(home);
    }
  },
});

// ---------------------------------------------------------------------------
// isServiceInstalled — uses temp files
// ---------------------------------------------------------------------------

Deno.test({
  name: "isServiceInstalled — returns false when no config file exists",
  ignore: Deno.build.os !== "darwin" && Deno.build.os !== "linux",
  async fn() {
    const home = await makeTempHome();
    try {
      const installed = await getServiceManager({ home }).isInstalled();
      assertEquals(installed, false);
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "isServiceInstalled — returns true when plist exists (macOS legacy)",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    const plistDir = `${home}/Library/LaunchAgents`;
    await Deno.mkdir(plistDir, { recursive: true });
    await Deno.writeTextFile(`${plistDir}/com.modmux.modmux.plist`, "<plist/>");
    try {
      const installed = await getServiceManager({ home }).isInstalled();
      assertEquals(installed, true);
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name:
    "isServiceInstalled — returns true when unit file exists (Linux legacy)",
  ignore: Deno.build.os !== "linux",
  async fn() {
    const home = await makeTempHome();
    const unitDir = `${home}/.config/systemd/user`;
    await Deno.mkdir(unitDir, { recursive: true });
    await Deno.writeTextFile(`${unitDir}/modmux.service`, "[Unit]");
    try {
      const installed = await getServiceManager({ home }).isInstalled();
      assertEquals(installed, true);
    } finally {
      await cleanup(home);
    }
  },
});

// ---------------------------------------------------------------------------
// Idempotency — uninstall when not installed
// ---------------------------------------------------------------------------

Deno.test({
  name: "uninstallService dryRun — idempotent when not installed",
  ignore: Deno.build.os !== "darwin" && Deno.build.os !== "linux",
  async fn() {
    const home = await makeTempHome();
    try {
      // No plist/unit file exists — should return removed: false
      const result = await getServiceManager({ home }).uninstall({
        dryRun: true,
      });
      assertEquals(result.removed, false);
    } catch (err) {
      if (err instanceof UnsupportedPlatformError) return;
      throw err;
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "isServiceInstalled — returns true when coco plist exists (macOS)",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    const plistDir = `${home}/Library/LaunchAgents`;
    await Deno.mkdir(plistDir, { recursive: true });
    await Deno.writeTextFile(`${plistDir}/com.modmux.modmux.plist`, "<plist/>");
    try {
      const installed = await getServiceManager({ home }).isInstalled();
      assertEquals(installed, true);
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "isServiceInstalled — returns true when coco unit file exists (Linux)",
  ignore: Deno.build.os !== "linux",
  async fn() {
    const home = await makeTempHome();
    const unitDir = `${home}/.config/systemd/user`;
    await Deno.mkdir(unitDir, { recursive: true });
    await Deno.writeTextFile(`${unitDir}/modmux.service`, "[Unit]");
    try {
      const installed = await getServiceManager({ home }).isInstalled();
      assertEquals(installed, true);
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name:
    "uninstallService dryRun — returns removed: true when legacy file exists (macOS)",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    const plistDir = `${home}/Library/LaunchAgents`;
    await Deno.mkdir(plistDir, { recursive: true });
    await Deno.writeTextFile(`${plistDir}/com.modmux.modmux.plist`, "<plist/>");
    try {
      const result = await getServiceManager({ home }).uninstall({
        dryRun: true,
      });
      assertEquals(result.removed, true);
      // dryRun should NOT actually remove the file
      const stillExists = await Deno.stat(`${plistDir}/com.modmux.modmux.plist`)
        .then(
          () => true,
          () => false,
        );
      assertEquals(stillExists, true, "dryRun should not remove file");
    } finally {
      await cleanup(home);
    }
  },
});

// ---------------------------------------------------------------------------
// UnsupportedPlatformError
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "uninstallService dryRun — returns removed: true when coco file exists (macOS)",
  ignore: Deno.build.os !== "darwin",
  async fn() {
    const home = await makeTempHome();
    const plistDir = `${home}/Library/LaunchAgents`;
    await Deno.mkdir(plistDir, { recursive: true });
    await Deno.writeTextFile(`${plistDir}/com.modmux.modmux.plist`, "<plist/>");
    try {
      const result = await getServiceManager({ home }).uninstall({
        dryRun: true,
      });
      assertEquals(result.removed, true);
      const stillExists = await Deno.stat(`${plistDir}/com.modmux.modmux.plist`)
        .then(
          () => true,
          () => false,
        );
      assertEquals(stillExists, true, "dryRun should not remove file");
    } finally {
      await cleanup(home);
    }
  },
});

Deno.test({
  name: "installService dryRun — Windows returns SCM config metadata",
  ignore: Deno.build.os !== "windows",
  async fn() {
    const result = await getServiceManager().install({ dryRun: true });
    assertEquals(result.installed, true);
    assertStringIncludes(result.configPath, "Windows SCM registry");
    assertStringIncludes(result.configContent, "coco");
    assertStringIncludes(result.configContent, "--daemon");
  },
});

Deno.test({
  name: "UnsupportedPlatformError has correct message format",
  fn() {
    const err = new UnsupportedPlatformError("Windows");
    assertStringIncludes(err.message, "coming soon");
    assertStringIncludes(err.message, "modmux start");
    assertEquals(err.name, "UnsupportedPlatformError");
  },
});
