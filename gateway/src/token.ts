import {
  winCredDelete,
  winCredRead,
  winCredWrite,
} from "./windows-credential.ts";

export interface AuthToken {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  createdAt: number;
}

export interface TokenStore {
  save(token: AuthToken): Promise<void>;
  load(): Promise<AuthToken | null>;
  clear(): Promise<void>;
  isValid(token: AuthToken | null): boolean;
}

// ---------------------------------------------------------------------------
// Factory -- selects the most secure store available for the current platform
// ---------------------------------------------------------------------------

/**
 * Returns the most secure TokenStore available on the current platform:
 * - macOS  : macOS Keychain via `security` CLI
 * - Windows: Windows Credential Manager via FFI (primary) or PowerShell P/Invoke (fallback),
 *            with a file-based fallback when both are unavailable.
 * - Linux  : Secret Service via `secret-tool`, falling back to a
 *            permission-locked (0600) file when the daemon is unavailable
 */
export function createTokenStore(): TokenStore {
  if (Deno.build.os === "darwin") {
    return new MacOSKeychainStore();
  }
  if (Deno.build.os === "windows") {
    return new WindowsCredentialManagerStore();
  }
  // Linux / other -- try Secret Service; fall back to locked file
  return new SecretServiceStore(
    new FileTokenStore(getDataDir(), getLegacyDataDir()),
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function homeDir(): string {
  return Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
}

function getDataDir(): string {
  return `${homeDir()}/.modmux`;
}

function getLegacyDataDir(): string {
  return `${homeDir()}/.modmux`;
}

const KEYCHAIN_SERVICE = "modmux";
const LEGACY_KEYCHAIN_SERVICE = "modmux";
const KEYCHAIN_ACCOUNT = "copilot";

function parseToken(raw: string): AuthToken | null {
  try {
    return JSON.parse(raw.trim()) as AuthToken;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// macOS Keychain  (security CLI -- ships with every macOS install)
// ---------------------------------------------------------------------------

class MacOSKeychainStore implements TokenStore {
  async save(token: AuthToken): Promise<void> {
    const value = JSON.stringify(token);
    // -U updates an existing entry; creates a new one if absent
    const { success, stderr } = await new Deno.Command("security", {
      args: [
        "add-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
        value,
        "-U",
      ],
      stderr: "piped",
    }).output();

    if (!success) {
      const msg = new TextDecoder().decode(stderr).trim();
      throw new Error(`Keychain save failed: ${msg}`);
    }
  }

  async load(): Promise<AuthToken | null> {
    const canonical = await this.loadForService(KEYCHAIN_SERVICE);
    if (canonical) return canonical;
    return this.loadForService(LEGACY_KEYCHAIN_SERVICE);
  }

  async clear(): Promise<void> {
    for (const service of [KEYCHAIN_SERVICE, LEGACY_KEYCHAIN_SERVICE]) {
      await new Deno.Command("security", {
        args: [
          "delete-generic-password",
          "-s",
          service,
          "-a",
          KEYCHAIN_ACCOUNT,
        ],
        stderr: "piped",
      }).output().catch(() => {});
    }
  }

  isValid(token: AuthToken | null): boolean {
    return !!token && token.expiresAt > Date.now();
  }

  private async loadForService(service: string): Promise<AuthToken | null> {
    const { success, stdout } = await new Deno.Command("security", {
      args: [
        "find-generic-password",
        "-s",
        service,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();

    if (!success) return null;
    return parseToken(new TextDecoder().decode(stdout));
  }
}

// ---------------------------------------------------------------------------
// Windows  (Credential Manager via FFI or PowerShell P/Invoke, file fallback)
// ---------------------------------------------------------------------------

const WIN_CRED_TARGET = "modmux";

class WindowsCredentialManagerStore implements TokenStore {
  private readonly fallback = new FileTokenStore(getDataDir(), getLegacyDataDir());

  async save(token: AuthToken): Promise<void> {
    try {
      await winCredWrite(WIN_CRED_TARGET, KEYCHAIN_ACCOUNT, JSON.stringify(token));
    } catch {
      return this.fallback.save(token);
    }
  }

  async load(): Promise<AuthToken | null> {
    try {
      const raw = await winCredRead(WIN_CRED_TARGET);
      if (raw !== null) {
        const token = parseToken(raw);
        if (token) return token;
      }
    } catch {
      return this.fallback.load();
    }

    // One-time migration from legacy plain-text file store.
    const fileToken = await this.fallback.load();
    if (fileToken) {
      try {
        await winCredWrite(WIN_CRED_TARGET, KEYCHAIN_ACCOUNT, JSON.stringify(fileToken));
        await this.fallback.clear();
      } catch {
        // Migration failed; return file token as-is
      }
      return fileToken;
    }
    return null;
  }

  async clear(): Promise<void> {
    try {
      await winCredDelete(WIN_CRED_TARGET);
    } catch {
      // not found or already cleared — ok
    }
    await this.fallback.clear();
  }

  isValid(token: AuthToken | null): boolean {
    return !!token && token.expiresAt > Date.now();
  }
}

// ---------------------------------------------------------------------------
// Linux Secret Service  (secret-tool -- part of libsecret)
// ---------------------------------------------------------------------------

/**
 * Uses `secret-tool` (GNOME/libsecret) when available.
 * Transparently delegates to a FileTokenStore fallback if the daemon is
 * absent or the command fails.
 */
class SecretServiceStore implements TokenStore {
  constructor(private fallback: FileTokenStore) {}

  async save(token: AuthToken): Promise<void> {
    if (!(await this.isAvailable())) {
      return this.fallback.save(token);
    }

    const value = JSON.stringify(token);
    const child = new Deno.Command("secret-tool", {
      args: [
        "store",
        "--label=Modmux Copilot Token",
        "service",
        KEYCHAIN_SERVICE,
        "account",
        KEYCHAIN_ACCOUNT,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(value));
    await writer.close();

    const { success } = await child.status;
    if (!success) {
      return this.fallback.save(token);
    }
  }

  async load(): Promise<AuthToken | null> {
    if (!(await this.isAvailable())) {
      return this.fallback.load();
    }

    const canonical = await this.loadForService(KEYCHAIN_SERVICE);
    if (canonical) return canonical;

    const legacy = await this.loadForService(LEGACY_KEYCHAIN_SERVICE);
    if (legacy) return legacy;

    return this.fallback.load();
  }

  async clear(): Promise<void> {
    if (await this.isAvailable()) {
      for (const service of [KEYCHAIN_SERVICE, LEGACY_KEYCHAIN_SERVICE]) {
        await new Deno.Command("secret-tool", {
          args: [
            "clear",
            "service",
            service,
            "account",
            KEYCHAIN_ACCOUNT,
          ],
          stderr: "piped",
        }).output().catch(() => {});
      }
    }
    await this.fallback.clear();
  }

  isValid(token: AuthToken | null): boolean {
    return !!token && token.expiresAt > Date.now();
  }

  private async isAvailable(): Promise<boolean> {
    try {
      const { success } = await new Deno.Command("secret-tool", {
        args: ["--version"],
        stdout: "piped",
        stderr: "piped",
      }).output();
      return success;
    } catch {
      return false;
    }
  }

  private async loadForService(service: string): Promise<AuthToken | null> {
    const { success, stdout } = await new Deno.Command("secret-tool", {
      args: [
        "lookup",
        "service",
        service,
        "account",
        KEYCHAIN_ACCOUNT,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();

    if (!success) return null;

    const raw = new TextDecoder().decode(stdout).trim();
    if (!raw) return null;

    return parseToken(raw);
  }
}

// ---------------------------------------------------------------------------
// File fallback  (permission-locked; last resort when no keychain is present)
// ---------------------------------------------------------------------------

export class FileTokenStore implements TokenStore {
  private readonly path: string;
  private readonly legacyPath: string | null;

  constructor(private readonly dir: string, legacyDir?: string) {
    this.path = `${this.dir}/tokens.json`;
    this.legacyPath = legacyDir ? `${legacyDir}/tokens.json` : null;
  }

  async save(token: AuthToken): Promise<void> {
    await Deno.mkdir(this.dir, { recursive: true });
    const data = await this.readAll();
    data[KEYCHAIN_ACCOUNT] = token;
    await Deno.writeTextFile(this.path, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  }

  async load(): Promise<AuthToken | null> {
    try {
      const data = await this.readAll();
      return data[KEYCHAIN_ACCOUNT] ?? null;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    for (const path of [this.path, this.legacyPath]) {
      if (!path) continue;
      try {
        const raw = await Deno.readTextFile(path);
        const parsed = JSON.parse(raw) as Record<string, AuthToken>;
        delete parsed[KEYCHAIN_ACCOUNT];
        await Deno.writeTextFile(path, JSON.stringify(parsed, null, 2), {
          mode: 0o600,
        });
      } catch {
        // Ignore errors on clear
      }
    }
  }

  isValid(token: AuthToken | null): boolean {
    return !!token && token.expiresAt > Date.now();
  }

  private async readAll(): Promise<Record<string, AuthToken>> {
    try {
      return JSON.parse(await Deno.readTextFile(this.path));
    } catch {
      if (!this.legacyPath) return {};
      try {
        return JSON.parse(await Deno.readTextFile(this.legacyPath));
      } catch {
        return {};
      }
    }
  }
}
