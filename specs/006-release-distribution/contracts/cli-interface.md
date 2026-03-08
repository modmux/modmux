# Contract: CLI Interface

**Package**: `claudio` (npm), `@myty/claudio` (JSR), compiled binaries\
**Version**: matches `deno.json` version\
**Contract Type**: CLI Command Interface\
**Stability**: Stable

## Overview

This document defines the stable CLI interface contract for Claudio. All
distribution channels (compiled binary, npm shim, JSR/deno install) MUST expose
identical behaviour. Contract tests in `tests/contract/` verify this interface.

---

## Invocation

```
claudio [OPTIONS] [CLAUDE_ARGS...]
```

Any option not listed in the **Options** section below is forwarded verbatim to
the `claude` subprocess.

---

## Options

### `--help` / `-h`

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

### `--version` / `-v`

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

### `--server`

Starts the proxy server only (does not launch Claude Code). Used for development
and testing.

**Exit code**: `0` on clean shutdown

---

## Normal Operation (no flags)

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

## Exit Codes

| Code | Condition                                               |
| ---- | ------------------------------------------------------- |
| `0`  | Successful execution or `--help`/`--version`            |
| `1`  | Authentication failure                                  |
| `1`  | `claude` binary not found on PATH                       |
| `1`  | Proxy failed to start                                   |
| `N`  | Forwards `claude` subprocess exit code (any non-zero N) |

---

## Environment Variables (consumed)

| Variable               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `CLAUDIO_DEBUG`        | If set to `1`, enables verbose debug logging |
| `HOME` / `USERPROFILE` | Used to locate the token store               |

---

## Environment Variables (injected into subprocess)

| Variable             | Value                                                |
| -------------------- | ---------------------------------------------------- |
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:{port}/v1`                         |
| `ANTHROPIC_API_KEY`  | `claudio-proxy` (placeholder; actual auth via proxy) |

---

## Forwarded Arguments

All arguments that are NOT in the set `{--help, -h, --version, -v, --server}`
are forwarded verbatim as positional arguments to the `claude` subprocess.

**Example**:

```bash
claudio --dark-mode --model claude-3-5-sonnet-20241022
# Launches: claude --dark-mode --model claude-3-5-sonnet-20241022
```

---

## Stability Guarantees

- `--help` output format is **informational** and MAY change between minor
  versions.
- `--version` output format `Claudio v{VERSION}` is **stable** across all major
  versions.
- Exit codes are **stable** across all versions.
- Environment variable names are **stable** across all major versions.
- The proxy is **ephemeral**: it starts when `claudio` starts and stops when
  `claude` exits. Consumers MUST NOT depend on the proxy persisting.
