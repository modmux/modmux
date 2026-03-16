## Contracts

### cli-interface

**Package**: `claudio` (npm), `@myty/claudio` (JSR), compiled binaries\
**Version**: matches `deno.json` version\
**Contract Type**: CLI Command Interface\
**Stability**: Stable

### Overview

This document defines the stable CLI interface contract for Claudio. All
distribution channels (compiled binary, npm shim, JSR/deno install) MUST expose
identical behaviour. Contract tests in `tests/contract/` verify this interface.

---

### Invocation

```
claudio [OPTIONS] [CLAUDE_ARGS...]
```

Any option not listed in the **Options** section below is forwarded verbatim to
the `claude` subprocess.

---

### Options

#### `--help` / `-h`

Prints usage information to stdout and exits with code `0`.

**Output format** (exact):

```
Claudio - GitHub Copilot Bridge

Usage: claudio [OPTIONS] [CLAUDE_ARGS...]

Options:
  --help       Show this help message
  --version    Show version
  --server     Start the proxy server (default)

Any options not listed above are forwarded verbatim to claude.
For example: claudio --dark-mode passes --dark-mode to claude.
```

**Exit code**: `0`

---

#### `--version` / `-v`

Prints the version to stdout and exits with code `0`.

**Output format** (exact):

```
Claudio v{VERSION}
```

Where `{VERSION}` is the semver string from `src/version.ts` (e.g., `0.2.0`).

**Example**:

```
Claudio v0.2.0
```

**Exit code**: `0`

---

#### `--server`

Starts the proxy server only (does not launch Claude Code). Used for development
and testing.

**Exit code**: `0` on clean shutdown

---

### Normal Operation (no flags)

When invoked with no recognised flags (or only forwarded flags):

1. Reads stored authentication token from the Deno-managed token store.
2. If no valid token: runs the GitHub OAuth device flow interactively.
3. Starts the local Anthropic-compatible proxy on a random available port.
4. Discovers the `claude` binary on `PATH`.
5. Launches `claude` with forwarded args and `ANTHROPIC_BASE_URL` /
   `ANTHROPIC_API_KEY` set.
6. Inherits stdin/stdout/stderr of the `claude` subprocess.
7. On `claude` exit: stops the proxy and exits with the same exit code.

---

### Exit Codes

| Code | Condition                                               |
| ---- | ------------------------------------------------------- |
| `0`  | Successful execution or `--help`/`--version`            |
| `1`  | Authentication failure                                  |
| `1`  | `claude` binary not found on PATH                       |
| `1`  | Proxy failed to start                                   |
| `N`  | Forwards `claude` subprocess exit code (any non-zero N) |

---

### Environment Variables (consumed)

| Variable               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `CLAUDIO_DEBUG`        | If set to `1`, enables verbose debug logging |
| `HOME` / `USERPROFILE` | Used to locate the token store               |

---

### Environment Variables (injected into subprocess)

| Variable             | Value                                                |
| -------------------- | ---------------------------------------------------- |
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:{port}/v1`                         |
| `ANTHROPIC_API_KEY`  | `claudio-proxy` (placeholder; actual auth via proxy) |

---

### Forwarded Arguments

All arguments that are NOT in the set `{--help, -h, --version, -v, --server}`
are forwarded verbatim as positional arguments to the `claude` subprocess.

**Example**:

```bash
claudio --dark-mode --model claude-3-5-sonnet-20241022
## Launches: claude --dark-mode --model claude-3-5-sonnet-20241022
```

---

### Stability Guarantees

- `--help` output format is **informational** and MAY change between minor
  versions.
- `--version` output format `Claudio v{VERSION}` is **stable** across all major
  versions.
- Exit codes are **stable** across all versions.
- Environment variable names are **stable** across all major versions.
- The proxy is **ephemeral**: it starts when `claudio` starts and stops when
  `claude` exits. Consumers MUST NOT depend on the proxy persisting.

### npm-package

**Package**: `claudio` (npm)\
**Version**: matches `deno.json` version\
**Contract Type**: npm Package Interface\
**Stability**: Stable

### Overview

Defines the stable interface contract for the `claudio` npm package and its
platform-specific optional dependency packages. This contract describes the
package graph structure, binary resolution behaviour, and fallback semantics.

---

### Package Graph

```
claudio@X.Y.Z
├── optionalDependencies:
│   ├── @claudio/darwin-arm64@X.Y.Z   (macOS arm64)
│   ├── @claudio/darwin-x64@X.Y.Z     (macOS x64)
│   ├── @claudio/linux-x64@X.Y.Z      (Linux x64)
│   ├── @claudio/linux-arm64@X.Y.Z    (Linux arm64)
│   └── @claudio/win32-x64@X.Y.Z      (Windows x64)
└── bin:
    └── claudio → ./bin/claudio.js
```

---

### Main Package (`claudio`)

#### `package.json` Contract

```jsonc
{
  "name": "claudio",
  "version": "{VERSION}", // MUST match deno.json version
  "description": "GitHub Copilot bridge for Claude Code",
  "bin": {
    "claudio": "./bin/claudio.js" // STABLE: path must not change
  },
  "engines": {
    "node": ">=18" // Minimum supported Node.js
  },
  "optionalDependencies": { // STABLE: these package names must not change
    "@claudio/darwin-arm64": "{VERSION}",
    "@claudio/darwin-x64": "{VERSION}",
    "@claudio/linux-x64": "{VERSION}",
    "@claudio/linux-arm64": "{VERSION}",
    "@claudio/win32-x64": "{VERSION}"
  }
}
```

#### Shim Behaviour Contract (`bin/claudio.js`)

The shim MUST implement the following resolution algorithm:

```
1. Determine current platform:
   - key = process.platform + " " + process.arch
   - Examples: "darwin arm64", "linux x64", "win32 x64"

2. Resolve optional package name:
   - "darwin arm64"  → @claudio/darwin-arm64
   - "darwin x64"    → @claudio/darwin-x64
   - "linux x64"     → @claudio/linux-x64
   - "linux arm64"   → @claudio/linux-arm64
   - "win32 x64"     → @claudio/win32-x64

3. Attempt require.resolve("{package}/bin/claudio[.exe]")
   - If succeeds: const result = spawnSync(path, process.argv.slice(2), {stdio:'inherit', shell:false})
     process.exit(result.status ?? 1)
   - If fails: continue to step 4

4. Check if `deno` is available on PATH:
   - If yes: spawn deno run -A jsr:@myty/claudio -- args...
   - If no: print error and exit 1

Error message format (step 4, no fallback):
  "Claudio is not supported on this platform ({platform}).
   Download a binary from: https://github.com/myty/claudio/releases"
```

#### Binary Location in Platform Packages

Each platform package MUST provide its binary at:

| Package                 | Binary path       |
| ----------------------- | ----------------- |
| `@claudio/darwin-arm64` | `bin/claudio`     |
| `@claudio/darwin-x64`   | `bin/claudio`     |
| `@claudio/linux-x64`    | `bin/claudio`     |
| `@claudio/linux-arm64`  | `bin/claudio`     |
| `@claudio/win32-x64`    | `bin/claudio.exe` |

---

### Platform Package (`@claudio/<os>-<arch>`)

#### `package.json` Contract

```jsonc
{
  "name": "@claudio/{os}-{arch}", // e.g., @claudio/darwin-arm64
  "version": "{VERSION}", // MUST match main package version
  "os": ["{os}"], // e.g., ["darwin"]
  "cpu": ["{arch}"], // e.g., ["arm64"]
  "preferUnplugged": true, // REQUIRED: binary must be on filesystem
  "bin": {} // Empty: binary is not on PATH directly
}
```

#### Constraints

- `preferUnplugged: true` MUST be set. Without it, PnP-based package managers
  (Yarn Berry, pnpm with virtual store) may not materialise the binary to disk.
- `bin` MUST be empty `{}`. The binary is NOT exposed directly to PATH from
  platform packages; only the main `claudio` shim is on PATH.
- The binary file MUST be executable (`chmod +x`) in the published package.

---

### Postinstall Behaviour

Platform packages MUST NOT have a `postinstall` script. Binary permissions are
set at publish time (not install time) to avoid npm audit warnings and
installation failures in restricted environments.

The main `claudio` package MAY include a `postinstall` script that verifies the
platform binary is executable, but MUST NOT download anything.

---

### Version Contract

- All 6 packages MUST be published atomically with the same version string.
- The npm version MUST match the `deno.json` version.
- `npm install claudio@0.2.0` MUST install `@claudio/<platform>@0.2.0`.
- Mixing versions (e.g., main `0.2.0` with platform `0.1.0`) is undefined
  behaviour and MUST NOT be possible in a correct release.
