import { parse as parseToml, stringify as stringifyToml } from "@std/toml";
import { fromFileUrl, join, resolve } from "@std/path";
import { runCompile } from "./compile.ts";

const PATH_GUARD_BEGIN = "# modmux-path-begin";
const PATH_GUARD_END = "# modmux-path-end";

function getDefaultInstallDir(): string {
  if (Deno.build.os === "windows") {
    const localAppData = Deno.env.get("LOCALAPPDATA");
    if (localAppData) {
      return join(localAppData, "modmux", "bin");
    }

    const userProfile = Deno.env.get("USERPROFILE");
    if (!userProfile) {
      throw new Error(
        "Unable to determine install directory: neither LOCALAPPDATA nor USERPROFILE is set.",
      );
    }

    return join(userProfile, "AppData", "Local", "modmux", "bin");
  }

  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("Unable to determine install directory: HOME is not set.");
  }

  return join(home, ".local", "bin");
}

function getExecutableName(): string {
  return Deno.build.os === "windows" ? "modmux.exe" : "modmux";
}

/** Returns true if installDir is already present in the current session PATH. */
function isInSessionPath(installDir: string): boolean {
  const pathEnv = Deno.env.get("PATH") ?? "";
  const sep = Deno.build.os === "windows" ? ";" : ":";
  return pathEnv.split(sep).some((p) =>
    p.toLowerCase() === installDir.toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// Daemon lifecycle helpers (mirrors gateway/src/daemon.ts without importing it)
// ---------------------------------------------------------------------------

function getModmuxConfigDir(): string {
  const fromEnv = Deno.env.get("MODMUX_CONFIG_DIR");
  if (fromEnv?.trim()) return fromEnv.trim();
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".modmux");
}

async function readDaemonPid(): Promise<number | null> {
  const pidFile = join(getModmuxConfigDir(), "modmux.pid");
  try {
    const raw = await Deno.readTextFile(pidFile);
    const pid = parseInt(raw.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    if (Deno.build.os === "windows") {
      const { code } = await new Deno.Command("powershell", {
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
        ],
        stdout: "piped",
        stderr: "null",
      }).output();
      return code === 0;
    }
    const { code } = await new Deno.Command("kill", {
      args: ["-0", String(pid)],
      stdout: "null",
      stderr: "null",
    }).output();
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Stops the running modmux daemon if one is detected via the PID file.
 * Waits up to 3 s for the process to exit.
 * Returns the PID if the daemon was running and stopped, null otherwise.
 */
async function stopRunningDaemon(): Promise<number | null> {
  const pid = await readDaemonPid();
  if (pid === null || !(await isProcessAlive(pid))) return null;

  try {
    Deno.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited between the check and the kill
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (!(await isProcessAlive(pid))) break;
  }

  try {
    await Deno.remove(join(getModmuxConfigDir(), "modmux.pid"));
  } catch { /* ignore */ }

  return pid;
}

/**
 * Restarts the modmux daemon using the newly installed binary.
 * Spawns detached so the install script can exit cleanly.
 * On Windows uses PowerShell Start-Process to avoid a console window popup.
 */
function restartDaemon(binaryPath: string): void {
  try {
    if (Deno.build.os === "windows") {
      const esc = (s: string) => s.replace(/'/g, "''");
      new Deno.Command("powershell", {
        args: [
          "-NonInteractive",
          "-Command",
          `Start-Process -FilePath '${
            esc(binaryPath)
          }' -ArgumentList 'start' -WindowStyle Hidden`,
        ],
        stdin: "null",
        stdout: "null",
        stderr: "null",
      }).spawn().unref();
    } else {
      new Deno.Command(binaryPath, {
        args: ["start"],
        stdin: "null",
        stdout: "null",
        stderr: "null",
        detached: true,
      }).spawn().unref();
    }
  } catch {
    // Non-fatal — daemon will need to be started manually
  }
}

/**
 * Creates or updates mise.local.toml in the repo root with an [env] _.path
 * entry pointing to installDir. mise.local.toml is the per-project local
 * override file (not committed to source control). When mise activate is
 * running, the shell hook picks this up on the next prompt — updating the
 * current session PATH without requiring a new terminal or global config changes.
 * Returns true if the file was modified, false if already present.
 */
async function addToMiseLocalToml(
  repoRoot: string,
  installDir: string,
): Promise<boolean> {
  const configPath = join(repoRoot, "mise.local.toml");

  let raw = "";
  try {
    raw = await Deno.readTextFile(configPath);
  } catch {
    // File does not exist yet — will be created
  }

  // deno-lint-ignore no-explicit-any
  let config: Record<string, any> = {};
  try {
    config = raw ? parseToml(raw) : {};
  } catch {
    // Unparseable config — bail out rather than corrupt it
    return false;
  }

  // Ensure [env] table and _.path array exist
  if (!config["env"] || typeof config["env"] !== "object") {
    config["env"] = {};
  }
  const env = config["env"] as Record<string, unknown>;
  if (!env["_"] || typeof env["_"] !== "object") {
    env["_"] = {};
  }
  const underscore = env["_"] as Record<string, unknown>;
  if (!Array.isArray(underscore["path"])) {
    underscore["path"] = [];
  }
  const pathArr = underscore["path"] as string[];

  if (pathArr.some((p) => p.toLowerCase() === installDir.toLowerCase())) {
    return false; // Already present
  }

  pathArr.push(installDir);
  await Deno.writeTextFile(configPath, stringifyToml(config));
  return true;
}

/**
 * Unix: appends an export block to ~/.profile so that installDir is in PATH
 * for all future login shells, regardless of which shell the user runs.
 * ~/.profile is the POSIX-standard file read by login shells (bash, zsh, dash,
 * fish via login shells, nushell login shells, etc.).
 * The block is guarded so repeated runs are idempotent.
 * Returns true if the file was modified, false if already present.
 */
async function addToUnixProfile(installDir: string): Promise<boolean> {
  const home = Deno.env.get("HOME");
  if (!home) return false;

  const profilePath = join(home, ".profile");

  let existing = "";
  try {
    existing = await Deno.readTextFile(profilePath);
  } catch {
    // File does not exist yet — will be created
  }

  if (existing.includes(PATH_GUARD_BEGIN)) {
    return false; // Already patched
  }

  const block =
    `\n${PATH_GUARD_BEGIN}\nexport PATH="${installDir}:$PATH"\n${PATH_GUARD_END}\n`;
  await Deno.writeTextFile(profilePath, existing + block);
  return true;
}

/**
 * Windows: reads the User-level PATH environment variable and appends
 * installDir if absent. Uses PowerShell to read/write the registry-backed
 * User PATH — no elevation required.
 * Returns true if PATH was modified, false if already present.
 */
async function addToWindowsUserPath(installDir: string): Promise<boolean> {
  const getCmd = new Deno.Command("powershell", {
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Environment]::GetEnvironmentVariable('PATH','User')",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout } = await getCmd.output();
  if (!success) return false;

  const currentPath = new TextDecoder().decode(stdout).trim();
  const entries = currentPath.split(";").map((e) => e.trim()).filter(Boolean);

  if (
    entries.some((e) => e.toLowerCase() === installDir.toLowerCase())
  ) {
    return false; // Already present
  }

  const newPath = [...entries, installDir].join(";");
  const setCmd = new Deno.Command("powershell", {
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `[Environment]::SetEnvironmentVariable('PATH','${newPath}','User')`,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success: setSuccess } = await setCmd.output();
  return setSuccess;
}

async function main(): Promise<void> {
  const installDir = Deno.env.get("MODMUX_INSTALL_DIR") ??
    getDefaultInstallDir();
  const outputPath = join(installDir, getExecutableName());

  // Resolve repository root from this script location so invocation cwd does not matter.
  const repoRoot = resolve(fromFileUrl(new URL("..", import.meta.url)));

  await Deno.mkdir(installDir, { recursive: true });

  // Stop the daemon before compiling so the binary is not locked on Windows.
  const stoppedPid = await stopRunningDaemon();
  if (stoppedPid !== null) {
    console.log(`Stopped running modmux daemon (PID ${stoppedPid}).`);
  }

  await runCompile({ cwd: repoRoot, output: outputPath });

  if (Deno.build.os !== "windows") {
    await Deno.chmod(outputPath, 0o755);
  }

  // Restart daemon if it was running before the install.
  if (stoppedPid !== null) {
    restartDaemon(outputPath);
    console.log("Restarted modmux daemon.");
  }

  console.log(`\nInstalled modmux to ${outputPath}`);

  const alreadyInPath = isInSessionPath(installDir);

  // Current session: update mise.local.toml so the shell hook picks it up
  // on the next prompt (requires mise activate in the user's shell RC).
  const miseModified = await addToMiseLocalToml(repoRoot, installDir);
  if (miseModified) {
    console.log(
      "✓ Updated mise.local.toml — available on your next shell prompt (requires mise activate).",
    );
  } else if (!alreadyInPath) {
    console.log(
      "  mise.local.toml already includes this path (or could not be updated).",
    );
  }

  if (alreadyInPath) {
    console.log("✓ modmux is available in your current session.");
  }

  // Persist PATH for future sessions (machine-wide, no mise required)
  if (Deno.build.os === "windows") {
    const modified = await addToWindowsUserPath(installDir);
    if (modified) {
      console.log("✓ Added to User PATH (future sessions, no mise required).");
    } else {
      console.log(
        "✓ Already present in User PATH (future sessions, no mise required).",
      );
    }
    if (!alreadyInPath && !miseModified) {
      console.log(
        "\nTo use modmux in this session, open a new terminal window.",
      );
    }
  } else {
    const modified = await addToUnixProfile(installDir);
    if (modified) {
      console.log(
        "✓ Added to ~/.profile (future login shells, no mise required).",
      );
    } else {
      console.log(
        "✓ Already present in ~/.profile (future login shells, no mise required).",
      );
    }
    if (!alreadyInPath && !miseModified) {
      console.log("\nTo use modmux in this session, run:");
      console.log("  source ~/.profile");
      console.log("Or open a new terminal.");
    }
  }

  console.log(
    "\nOverride install directory with MODMUX_INSTALL_DIR environment variable.",
  );
}

if (import.meta.main) {
  await main();
}
