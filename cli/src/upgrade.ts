import { basename, dirname, join } from "@std/path";
import { spawnDetached } from "../../gateway/src/background-process.ts";
import { startDaemon, stopDaemon } from "../../gateway/src/daemon.ts";
import { ensureMiseRestartHook } from "./mise-hook.ts";
import { isRunningFromMiseInstall } from "./mise-install.ts";
import { VERSION } from "./version.ts";

const REPO = "modmux/modmux";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

interface BinaryUpgradePlan {
  currentPath: string;
  helperPath: string;
  latestTag: string;
  downloadUrl: string;
}

function detectAssetNameFor(
  os: string,
  arch: string,
): string | null {
  if (os === "darwin" && arch === "aarch64") return "modmux-darwin-arm64";
  if (os === "darwin" && arch === "x86_64") return "modmux-darwin-x64";
  if (os === "linux" && arch === "x86_64") return "modmux-linux-x64";
  if (os === "linux" && arch === "aarch64") return "modmux-linux-arm64";
  if (os === "windows" && arch === "x86_64") {
    return "modmux-windows-x64.exe";
  }
  if (os === "windows" && arch === "aarch64") {
    return "modmux-windows-arm64.exe";
  }
  return null;
}

function detectAssetName(): string | null {
  return detectAssetNameFor(Deno.build.os, Deno.build.arch);
}

function isDenoExecutable(path: string): boolean {
  const name = basename(path).toLowerCase();
  return name === "deno" || name === "deno.exe";
}

async function upgradeMise(): Promise<void> {
  await ensureMiseRestartHook();
  console.log("Upgrading via mise...");
  const proc = new Deno.Command("mise", {
    args: ["upgrade", "modmux"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await proc.spawn().status;
  if (!status.success) {
    console.error(`Error: mise upgrade exited with code ${status.code}`);
    Deno.exit(status.code ?? 1);
  }
}

async function fetchLatestBinaryUpgradePlan(): Promise<
  BinaryUpgradePlan | null
> {
  const assetName = detectAssetName();
  if (!assetName) {
    console.error(
      `Error: Unsupported platform: ${Deno.build.os}/${Deno.build.arch}`,
    );
    Deno.exit(1);
  }

  console.log("Checking for updates...");
  let release: GithubRelease;
  try {
    const res = await fetch(GITHUB_API, {
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (!res.ok) {
      console.error(`Error: GitHub API returned ${res.status}`);
      Deno.exit(1);
    }
    release = await res.json() as GithubRelease;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to fetch release info: ${msg}`);
    Deno.exit(1);
  }

  const latestTag = release.tag_name;
  const latestVersion = latestTag.replace(/^v/, "");

  if (latestVersion === VERSION) {
    console.log(`Already at latest version (${VERSION}).`);
    return null;
  }

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    console.error(
      `Error: No asset named "${assetName}" found in release ${latestTag}.`,
    );
    Deno.exit(1);
  }

  const currentPath = Deno.execPath();
  const helperPath = join(
    dirname(currentPath),
    `${basename(currentPath)}.upgrade-helper${Deno.pid}`,
  );

  return {
    currentPath,
    helperPath,
    latestTag,
    downloadUrl: asset.browser_download_url,
  };
}

async function launchUpgradeHelper(plan: BinaryUpgradePlan): Promise<void> {
  if (isDenoExecutable(plan.currentPath)) {
    console.error(
      "Error: Self-upgrade is only supported from a compiled modmux binary.",
    );
    Deno.exit(1);
  }

  try {
    await Deno.copyFile(plan.currentPath, plan.helperPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Could not prepare upgrade helper: ${msg}`);
    Deno.exit(1);
  }

  try {
    await spawnDetached(plan.helperPath, [
      "--upgrade-helper",
      plan.currentPath,
      plan.downloadUrl,
      plan.latestTag,
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await Deno.remove(plan.helperPath).catch(() => {});
    console.error(`Error: Could not launch upgrade helper: ${msg}`);
    Deno.exit(1);
  }

  console.log(`Upgrading from v${VERSION} to ${plan.latestTag}...`);
  console.log("modmux will finish upgrading in the background.");
}

async function replaceBinary(
  targetPath: string,
  downloadedBytes: Uint8Array,
): Promise<void> {
  const tmpPath = `${targetPath}.upgrade-tmp`;

  try {
    await Deno.writeFile(tmpPath, downloadedBytes, { mode: 0o755 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Could not write temporary file: ${msg}`);
    Deno.exit(1);
  }

  try {
    await Deno.rename(tmpPath, targetPath);
  } catch {
    try {
      await Deno.copyFile(tmpPath, targetPath);
      await Deno.remove(tmpPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await Deno.remove(tmpPath).catch(() => {});
      console.error(`Error: Could not replace binary: ${msg}`);
      Deno.exit(1);
    }
  }
}

async function downloadReleaseAsset(downloadUrl: string): Promise<Uint8Array> {
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      console.error(`Error: Failed to download asset: HTTP ${res.status}`);
      Deno.exit(1);
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Download failed: ${msg}`);
    Deno.exit(1);
  }
}

async function upgradeBinary(): Promise<void> {
  const plan = await fetchLatestBinaryUpgradePlan();
  if (plan === null) return;
  await launchUpgradeHelper(plan);
}

export async function runUpgradeHelper(
  targetPath: string,
  downloadUrl: string,
  latestTag: string,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const downloadedBytes = await downloadReleaseAsset(downloadUrl);
  const wasRunning = await stopDaemon().catch(() => false);
  await replaceBinary(targetPath, downloadedBytes);

  if (wasRunning) {
    await startDaemon().catch(() => {});
  }

  console.log(`Modmux upgraded to ${latestTag}.`);

  await Deno.remove(Deno.execPath()).catch(() => {});
}

export async function upgrade(): Promise<void> {
  if (isRunningFromMiseInstall()) {
    await upgradeMise();
  } else {
    await upgradeBinary();
  }
}

export const _test = {
  detectAssetNameFor,
};
