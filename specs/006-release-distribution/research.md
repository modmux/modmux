# Research: Release Distribution

**Feature**: `006-release-distribution`\
**Phase**: 0 — Research\
**Status**: Complete

## 1. `deno compile` — Cross-Platform Binaries

### Decision

Use `deno compile` with explicit `--target` flags for each platform. Embed all
required permissions at compile time. Use `deno.json`'s `compile.permissions`
block to codify the permission set.

### Rationale

`deno compile` produces a single self-contained executable that bundles the V8
snapshot, the TypeScript source, and all static imports. No Deno runtime
installation is required on the target machine. This directly satisfies
Principle V (Portability) and Principle VII (Self-Containment).

### Target Triples

| Platform    | Deno `--target`             | Runner for CI                                  | Output filename           |
| ----------- | --------------------------- | ---------------------------------------------- | ------------------------- |
| macOS arm64 | `aarch64-apple-darwin`      | `macos-latest` (native)                        | `claudio-macos-arm64`     |
| macOS x64   | `x86_64-apple-darwin`       | `macos-13` (Intel)                             | `claudio-macos-x64`       |
| Linux x64   | `x86_64-unknown-linux-gnu`  | `ubuntu-latest` (native)                       | `claudio-linux-x64`       |
| Linux arm64 | `aarch64-unknown-linux-gnu` | `ubuntu-latest` (cross-compile via `--target`) | `claudio-linux-arm64`     |
| Windows x64 | `x86_64-pc-windows-msvc`    | `windows-latest` (native)                      | `claudio-windows-x64.exe` |

**Note**: Deno automatically appends `.exe` for Windows targets when `--output`
does not already include the extension.

### Required Permissions

All permissions are baked into the binary at compile time:

```bash
deno compile \
  --allow-net \
  --allow-env \
  --allow-run \
  --allow-read \
  --allow-write \
  --target <triple> \
  --output <artifact-name> \
  src/cli/main.ts
```

These map to `deno.json`:

```json
"compile": {
  "permissions": {
    "net": true,
    "env": true,
    "run": true,
    "read": true,
    "write": true
  }
}
```

### Known Limitations

- **Dynamic imports**: Not bundled unless `--include` is used. Claudio has no
  dynamic imports — not a concern.
- **macOS code-signing**: arm64 binaries are auto-signed by Deno. No additional
  step required.
- **First-run download**: CI caches `~/.deno` between runs to avoid
  re-downloading target runtimes (~50–100 MB each).
- **Binary size**: Expect ~80–120 MB per binary (V8 snapshot included). Within
  GitHub's 2 GB release asset limit.

### Alternatives Considered

- **`deno bundle` + Node.js wrapper**: Rejected — requires Node.js on target.
- **Packaging with `pkg` (Node)**: Rejected — adds complexity, not Deno-native.

---

## 2. GitHub Actions Release Workflow

### Decision

A single workflow file (`.github/workflows/release.yml`) is triggered on
`push: tags: v*`. It uses a matrix job to build all five binaries in parallel,
then a dependent `release` job uploads them via
`softprops/action-gh-release@v2`.

### Rationale

`softprops/action-gh-release@v2` is the modern standard for GitHub release
creation in Actions — it handles creating the release, setting the body, and
uploading assets in one step. The matrix pattern parallelises builds and keeps
the YAML readable.

### Workflow Structure

```
trigger: push tag v*
  └── job: build (matrix × 5)
        ├── macos-latest    → claudio-macos-arm64
        ├── macos-13        → claudio-macos-x64
        ├── ubuntu-latest   → claudio-linux-x64  (native)
        ├── ubuntu-latest   → claudio-linux-arm64 (cross-compile --target)
        └── windows-latest  → claudio-windows-x64.exe
        each uploads to actions/upload-artifact@v4 (TTL: 1 day)
  └── job: release (needs: build)
        downloads all artifacts → softprops/action-gh-release@v2
```

### Key Actions Used

- `actions/checkout@v4`
- `denoland/setup-deno@v1` with `deno-version: v2.x`
- `actions/upload-artifact@v4`
- `actions/download-artifact@v4`
- `softprops/action-gh-release@v2` (creates release + uploads assets)

### Runner → Target Mapping

- `macos-latest` → arm64 native (Apple Silicon)
- `macos-13` → x64 native (Intel Haswell)
- `ubuntu-latest` → x64 native; cross-compile arm64 with `--target` flag
- `windows-latest` → x64 native

### Alternatives Considered

- **`goreleaser`**: Designed for Go, not Deno. Rejected.
- **Single runner for all targets**: Slower (sequential), harder to cache.
  Rejected.

---

## 3. npm Shim Package

### Decision

Publish 6 npm packages using the `optionalDependencies` pattern:

- `claudio` — main shim package (contains a Node.js launcher script)
- `@claudio/darwin-arm64` — macOS arm64 binary wrapper
- `@claudio/darwin-x64` — macOS x64 binary wrapper
- `@claudio/linux-x64` — Linux x64 binary wrapper
- `@claudio/linux-arm64` — Linux arm64 binary wrapper
- `@claudio/win32-x64` — Windows x64 binary wrapper

### Rationale

This is the pattern used by esbuild, Biome, Turbo, and other high-performance
CLI tools. npm evaluates `"os"` and `"cpu"` constraints in
`optionalDependencies` and installs only the matching platform package. Users
download ~80–120 MB instead of the full ~600 MB across all platforms. The main
shim is pure JavaScript (~50 lines) and runs under Node.js without Deno.

### npm Package Structure

**Main `claudio` package.json** (excerpt):

```json
{
  "name": "claudio",
  "version": "0.2.0",
  "bin": { "claudio": "bin/claudio.js" },
  "optionalDependencies": {
    "@claudio/darwin-arm64": "0.2.0",
    "@claudio/darwin-x64": "0.2.0",
    "@claudio/linux-x64": "0.2.0",
    "@claudio/linux-arm64": "0.2.0",
    "@claudio/win32-x64": "0.2.0"
  }
}
```

**Platform package `@claudio/darwin-arm64` package.json** (excerpt):

```json
{
  "name": "@claudio/darwin-arm64",
  "version": "0.2.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "preferUnplugged": true,
  "bin": {}
}
```

**Shim (`bin/claudio.js`)** logic:

1. Detect `process.platform` + `os.arch()`
2. Resolve binary path from the matching optional package
3. `execFileSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' })`
4. If no binary package is installed and `deno` is on PATH → fallback to
   `deno run -A jsr:@myty/claudio`
5. If neither: print error with GitHub Releases URL and exit 1

### Version Synchronisation

The npm package `version` field MUST match `deno.json`'s `version` field. A
pre-publish script reads `deno.json` and writes all six `package.json` files.

### Alternatives Considered

- **Single npm package with bundled binary**: Too large (~80–120 MB per
  package). Rejected.
- **Shell script postinstall that downloads binary**: Fragile with proxies,
  offline environments, and npm audit. Rejected.

---

## 4. JSR Package

### Decision

Publish `@myty/claudio` to JSR on every tagged release using `deno publish` with
OIDC trusted publishers (no stored API tokens required).

### Rationale

JSR is the preferred distribution channel for Deno-native TypeScript packages.
OIDC trusted publishers means zero secrets to manage. `deno publish` validates
types and formatting automatically.

### deno.json Changes Required

```json
{
  "name": "@myty/claudio",
  "version": "0.2.0",
  "exports": {
    ".": "./src/cli/main.ts"
  }
}
```

### JSR Publish Workflow

```yaml
# Separate job in release.yml or standalone publish-jsr.yml
permissions:
  contents: read
  id-token: write # REQUIRED for OIDC
steps:
  - uses: actions/checkout@v4
  - uses: denoland/setup-deno@v1
  - run: deno publish
```

### JSR Requirements Checklist

- ✅ `name` field: `@myty/claudio`
- ✅ `version` field: semver from `deno.json`
- ✅ `exports` field pointing to CLI entry
- ✅ Passes `deno check --all` (no slow_types)
- ✅ Passes `deno lint` and `deno fmt --check`
- ✅ Trusted publisher configured on jsr.io for `myty/claudio` repo

### Alternatives Considered

- **Token-based publishing**: Requires secret rotation. Rejected in favour of
  OIDC.
- **Only publishing to npm**: Misses the Deno developer audience. Rejected.

---

## 5. mise Backend

### Decision

Use the `github` backend (`github:myty/claudio`). No registration in an external
registry is required. Release asset names follow a convention that mise's
`github` backend auto-detects.

### Rationale

The `github` backend is the current recommended approach for tools distributed
as GitHub release binaries. It uses an intelligent scoring system to match OS
and architecture to the correct asset. The `ubi` backend (older) is now
deprecated. The `aqua` backend requires a pull request to the aqua-registry.

### Asset Naming Convention

mise's `github` backend scores assets using OS/arch keywords. The following
naming convention ensures reliable auto-detection:

| Asset                     | OS Token            | Arch Token           |
| ------------------------- | ------------------- | -------------------- |
| `claudio-macos-arm64`     | `macos` or `darwin` | `arm64` or `aarch64` |
| `claudio-macos-x64`       | `macos` or `darwin` | `x64` or `amd64`     |
| `claudio-linux-x64`       | `linux`             | `x64` or `amd64`     |
| `claudio-linux-arm64`     | `linux`             | `arm64` or `aarch64` |
| `claudio-windows-x64.exe` | `windows` or `win`  | `x64` or `amd64`     |

The convention `claudio-{os}-{arch}[.exe]` is consistent with mise's expected
patterns and requires no extra configuration.

### User Experience

```bash
# Install globally
mise use -g claudio

# Install specific version
mise install claudio@0.2.0

# Update
mise up claudio
```

### .mise.toml (project-level, optional)

```toml
[tools]
claudio = "latest"
```

### Alternatives Considered

- **aqua backend**: Requires a PR to the upstream aqua-registry. Additional
  maintenance burden. Not worth it until adoption grows.
- **ubi backend**: Deprecated. Rejected.
- **http backend**: Manual URL templates — more fragile. Rejected.

---

## 6. Version Synchronisation Strategy

### Decision

`deno.json` is the single source of truth for the version. A helper script
(`scripts/sync-version.ts`) reads the version from `deno.json` and writes it
into all npm `package.json` files. This script runs as part of the release
workflow before publishing to npm.

### Version Flow

```
deno.json { "version": "X.Y.Z" }
    ↓
scripts/sync-version.ts
    ↓  writes
├── npm/claudio/package.json          { "version": "X.Y.Z" }
├── npm/@claudio/darwin-arm64/package.json   { "version": "X.Y.Z" }
├── npm/@claudio/darwin-x64/package.json     { "version": "X.Y.Z" }
├── npm/@claudio/linux-x64/package.json      { "version": "X.Y.Z" }
├── npm/@claudio/linux-arm64/package.json    { "version": "X.Y.Z" }
└── npm/@claudio/win32-x64/package.json      { "version": "X.Y.Z" }
    ↓
GitHub Actions: npm publish (all 6 packages)
GitHub Actions: deno publish (JSR)
```

The `showVersion()` function in `src/cli/main.ts` MUST read the version from a
generated constant (`src/version.ts`) that is updated by the same script.
