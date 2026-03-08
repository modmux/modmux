# Quickstart: Release Distribution

**Feature**: `006-release-distribution`\
**Audience**: Developer working on the Claudio project

## Prerequisites

- Deno 2.x installed
- Node.js 18+ and npm 9+ installed (for npm shim development)
- GitHub CLI (`gh`) authenticated as `myty`
- npm account with publish rights to `claudio` and `@claudio/*` org packages

---

## Local Development: Compile a Binary

```bash
# Compile for your current platform (no --target needed)
deno compile \
  --allow-net --allow-env --allow-run --allow-read --allow-write \
  --output ./bin/claudio \
  src/cli/main.ts

# Test the binary
./bin/claudio --version
```

## Cross-Compile for All Platforms

```bash
# macOS arm64
deno compile --allow-net --allow-env --allow-run --allow-read --allow-write \
  --target aarch64-apple-darwin --output bin/claudio-macos-arm64 src/cli/main.ts

# macOS x64
deno compile --allow-net --allow-env --allow-run --allow-read --allow-write \
  --target x86_64-apple-darwin --output bin/claudio-macos-x64 src/cli/main.ts

# Linux x64
deno compile --allow-net --allow-env --allow-run --allow-read --allow-write \
  --target x86_64-unknown-linux-gnu --output bin/claudio-linux-x64 src/cli/main.ts

# Linux arm64
deno compile --allow-net --allow-env --allow-run --allow-read --allow-write \
  --target aarch64-unknown-linux-gnu --output bin/claudio-linux-arm64 src/cli/main.ts

# Windows x64
deno compile --allow-net --allow-env --allow-run --allow-read --allow-write \
  --target x86_64-pc-windows-msvc --output bin/claudio-windows-x64 src/cli/main.ts
# Note: Deno auto-appends .exe → bin/claudio-windows-x64.exe
```

---

## Releasing a New Version

### 1. Update the version in `deno.json`

```json
{
  "version": "0.3.0"
}
```

### 2. Sync version to all dependent files

```bash
deno run -A scripts/sync-version.ts
```

This updates:

- `src/version.ts` — VERSION constant
- `npm/claudio/package.json` — version + optionalDependencies versions
- `npm/@claudio/*/package.json` — version fields

### 3. Commit, tag, and push

```bash
git add deno.json src/version.ts npm/
git commit -m "chore: release v0.3.0"
git tag v0.3.0
git push origin main --follow-tags
```

### 4. Watch the release workflow

```bash
gh run watch
```

The GitHub Actions workflow will:

1. Compile all 5 platform binaries in parallel
2. Generate `release-manifest.json`
3. Create a GitHub Release with all assets
4. Publish all 6 npm packages
5. Publish the JSR package

---

## Install via Each Channel (Post-Release)

### GitHub Release (direct download)

```bash
# macOS arm64
curl -L https://github.com/myty/claudio/releases/latest/download/claudio-macos-arm64 \
  -o /usr/local/bin/claudio && chmod +x /usr/local/bin/claudio
```

### npm

```bash
npm install -g claudio
```

### JSR (Deno)

```bash
deno install -A -n claudio jsr:@myty/claudio
```

### mise

```bash
mise use -g claudio
```

---

## Project Structure (this feature)

```
.github/
└── workflows/
    └── release.yml           # Triggered on v* tags; builds + publishes

scripts/
└── sync-version.ts           # Keeps version in sync across all packages

src/
└── version.ts                # AUTO-GENERATED — Claudio version constant

npm/
├── claudio/                  # Main npm shim package
│   ├── package.json
│   └── bin/
│       └── claudio.js        # Node.js binary resolver shim
└── @claudio/
    ├── darwin-arm64/
    │   └── package.json
    ├── darwin-x64/
    │   └── package.json
    ├── linux-x64/
    │   └── package.json
    ├── linux-arm64/
    │   └── package.json
    └── win32-x64/
        └── package.json

tests/
└── contract/
    └── cli-interface.test.ts  # Validates --version, --help, exit codes
```

---

## Troubleshooting

### Binary not executable after npm install

```bash
chmod +x $(which claudio)
```

If using pnpm or Yarn Berry, ensure `preferUnplugged: true` is in the platform
package. This forces the package manager to materialise the binary to disk.

### Wrong platform binary selected

The shim uses `process.platform` + `process.arch`. Check:

```bash
node -e "console.log(process.platform, process.arch)"
```

Should print e.g. `darwin arm64`. If this doesn't match a supported platform,
the shim falls back to `deno run` or prints an error with the GitHub Releases
URL.

### deno compile downloads target runtime on first run

First cross-compile run downloads the Deno runtime for the target (~80–120 MB).
This is cached in `~/.deno/dl`. Subsequent runs use the cache. CI pipelines
should cache `~/.deno` across runs.
