const decoder = new TextDecoder();
const encoder = new TextEncoder();

// ------------------------------------------------------------
// 1. Resolve OS / arch → correct GitHub MCP Server archive
// ------------------------------------------------------------
type PlatformInfo = {
  archiveName: string;
  binaryName: string;
  isZip: boolean;
};

function getPlatformInfo(): PlatformInfo {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  // macOS ARM64 (your machine)
  if (os === "darwin" && arch === "aarch64") {
    return {
      archiveName: "github-mcp-server_Darwin_arm64.tar.gz",
      binaryName: "github-mcp-server",
      isZip: false,
    };
  }

  // macOS Intel
  if (os === "darwin" && arch === "x86_64") {
    return {
      archiveName: "github-mcp-server_Darwin_amd64.tar.gz",
      binaryName: "github-mcp-server",
      isZip: false,
    };
  }

  // Linux x64
  if (os === "linux" && arch === "x86_64") {
    return {
      archiveName: "github-mcp-server_Linux_amd64.tar.gz",
      binaryName: "github-mcp-server",
      isZip: false,
    };
  }

  // Windows x64
  if (os === "windows" && arch === "x86_64") {
    return {
      archiveName: "github-mcp-server_Windows_amd64.zip",
      binaryName: "github-mcp-server.exe",
      isZip: true,
    };
  }

  console.error(`Unsupported platform: ${os} ${arch}`);
  Deno.exit(1);
}

// ------------------------------------------------------------
// 2. Download + extract + cache the GitHub MCP Server binary
// ------------------------------------------------------------
async function ensureGithubMcpBinary(): Promise<string> {
  const { archiveName, binaryName, isZip } = getPlatformInfo();

  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  const cacheDir = `${home}/.cache/github-mcp-server`;
  await Deno.mkdir(cacheDir, { recursive: true });

  const binPath = `${cacheDir}/${binaryName}`;

  // Already cached?
  try {
    await Deno.stat(binPath);
    return binPath;
  } catch {
    // not cached
  }

  const url =
    `https://github.com/github/github-mcp-server/releases/latest/download/${archiveName}`;
  console.error(`Downloading GitHub MCP Server from ${url} ...`);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.error(`Failed to download binary: ${res.status} ${res.statusText}`);
    Deno.exit(1);
  }

  const archivePath = `${cacheDir}/${archiveName}`;
  const archiveFile = await Deno.open(archivePath, {
    create: true,
    write: true,
    truncate: true,
  });
  for await (const chunk of res.body) {
    await archiveFile.write(chunk);
  }
  archiveFile.close();

  // Extract
  if (isZip) {
    // Windows: Expand-Archive
    const ps = new Deno.Command("powershell", {
      args: [
        "-Command",
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${cacheDir}" -Force`,
      ],
      stdout: "inherit",
      stderr: "inherit",
    });
    const psStatus = await ps.output();
    if (psStatus.code !== 0) {
      console.error("Failed to extract zip archive");
      Deno.exit(1);
    }
  } else {
    // macOS / Linux: tar
    const tar = new Deno.Command("tar", {
      args: ["-xzf", archivePath, "-C", cacheDir],
      stdout: "inherit",
      stderr: "inherit",
    });
    const tarStatus = await tar.output();
    if (tarStatus.code !== 0) {
      console.error("Failed to extract tar.gz archive");
      Deno.exit(1);
    }
  }

  // Make executable on non-Windows
  if (Deno.build.os !== "windows") {
    await Deno.chmod(binPath, 0o755);
  }

  return binPath;
}

// ------------------------------------------------------------
// 3. Load GitHub token (env → gh CLI)
// ------------------------------------------------------------
async function loadGithubToken(): Promise<string> {
  let token = Deno.env.get("GITHUB_PERSONAL_ACCESS_TOKEN") ??
    Deno.env.get("GITHUB_TOKEN") ??
    Deno.env.get("GH_TOKEN");

  if (!token) {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
    const ghPath = `${home}/.config/gh/hosts.yml`;

    try {
      const yaml = await Deno.readTextFile(ghPath);
      const match = yaml.match(/oauth_token:\s*(.+)/);
      if (match) token = match[1].trim();
    } catch {
      // ignore
    }
  }

  if (!token) {
    console.error(
      "GitHub token not found (GITHUB_PERSONAL_ACCESS_TOKEN, GITHUB_TOKEN, GH_TOKEN, or gh CLI)",
    );
    Deno.exit(1);
  }

  return token;
}

// ------------------------------------------------------------
// 4. Main: ensure binary, load token, spawn server, pipe STDIO
// ------------------------------------------------------------
const binPath = await ensureGithubMcpBinary();
const token = await loadGithubToken();

const cmd = new Deno.Command(binPath, {
  args: ["stdio"],
  env: {
    ...Deno.env.toObject(),
    GITHUB_PERSONAL_ACCESS_TOKEN: token,
  },
  stdin: "piped",
  stdout: "piped",
  stderr: "inherit",
});

const child = cmd.spawn();

// Pipe client → server
(async () => {
  const writer = child.stdin.getWriter();
  for await (const chunk of Deno.stdin.readable) {
    await writer.write(chunk);
  }
  writer.releaseLock();
  await child.stdin.close();
})();

// Pipe server → client
child.stdout.pipeTo(Deno.stdout.writable);

const status = await child.status;
Deno.exit(status.code);
