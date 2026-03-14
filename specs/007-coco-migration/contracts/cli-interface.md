# Contract: CLI Interface

**Feature**: `007-coco-migration` | **Phase**: 1

Coco's CLI is the primary human interface. The binary is named `coco`.

---

## Command Summary

| Command | Description |
|---|---|
| `coco` | Open the TUI (on TTY) or print status (non-TTY) |
| `coco start` | Start the background service |
| `coco stop` | Stop the background service |
| `coco restart` | Restart the background service |
| `coco status` | Print service and auth status |
| `coco configure <agent>` | Write config for a specific agent |
| `coco unconfigure <agent>` | Revert config for a specific agent |
| `coco doctor` | Scan and report all agents' state |
| `coco models` | List available Copilot model IDs |
| `coco --help` | Show help |
| `coco --version` | Show version |

---

## `coco` (bare invocation)

**On a TTY**: Opens the interactive TUI.

```
Coco — Local AI Gateway
──────────────────────────────────────────────
Status: Running on http://localhost:11434
Copilot: Authenticated ✓

Agents
──────────────────────────────────────────────
[x] Claude Code      detected
[ ] Cline            installed
[x] Kilo Code        installed
[ ] OpenCode         detected
[ ] Goose            detected
[-] Aider            installed  (misconfigured)
[ ] GPT-Engineer     installed
[ ] Continue.dev     not installed

──────────────────────────────────────────────
Space: toggle   Enter: apply   q: quit
```

**On non-TTY**: Prints `coco status` output and exits 0.

**Exit codes**: 0 on clean quit (`q`) or successful apply; 1 on apply error.

---

## `coco start`

Spawn the background service daemon.

**Output (success)**:
```
Coco is running on http://localhost:11434
```

**Output (already running)**:
```
Coco is already running on http://localhost:11434
```

**Exit codes**: 0 on success or already-running; 1 on failure.

---

## `coco stop`

Send SIGTERM to the daemon and wait for it to exit.

**Output**:
```
Coco stopped.
```

**Output (not running)**:
```
Coco is not running.
```

**Exit codes**: 0 always.

---

## `coco restart`

Stop then start. Preserves port.

**Output**:
```
Coco stopped.
Coco is running on http://localhost:11434
```

**Exit codes**: 0 on success; 1 if start fails.

---

## `coco status`

```
Status:  Running on http://localhost:11434
Copilot: Authenticated ✓
```

Or when not running:
```
Status:  Not running
Copilot: Authenticated ✓
```

**Exit codes**: 0 if running; 1 if not running.

---

## `coco configure <agent>`

Agent names match the `name` field of `AgentRecord` (kebab-case):
`claude-code`, `cline`, `kilo`, `opencode`, `goose`, `aider`, `gpt-engineer`

**Output (success)**:
```
claude-code configured.
```

**Output (already configured)**:
```
claude-code is already configured.
```

**Output (not installed/detected)**:
```
claude-code is not installed or detected on this system.
```

**Output (validation warning)**:
```
claude-code configured, but validation failed: <reason>
```

**Exit codes**: 0 on success or already-configured; 1 on error; 2 on validation failure (configured but invalid).

---

## `coco unconfigure <agent>`

**Output (success)**:
```
claude-code unconfigured.
```

**Output (not configured)**:
```
claude-code is not configured.
```

**Exit codes**: 0 always.

---

## `coco doctor`

Scans and reports all agents. Two columns: state + configured status.

```
Coco Doctor
──────────────────────────────────────────────
claude-code     installed    configured ✓
cline           installed    not configured
kilo            installed    configured ✓
opencode        detected     not configured
goose           detected     not configured
aider           installed    misconfigured ⚠
gpt-engineer    installed    not configured
──────────────────────────────────────────────
Log: ~/.coco/coco.log
Last 5 errors: (none)
```

**Exit codes**: 0 always.

---

## `coco models`

```
Available models (via GitHub Copilot):

  gpt-4o
  gpt-4o-mini
  o1
  o1-mini
  claude-3.5-sonnet
  claude-3.5-haiku
  gemini-2.0-flash

Run 'coco configure <agent>' to route an agent through Coco.
```

**Exit codes**: 0 on success; 1 if not authenticated (after prompting).

---

## Global Flags

| Flag | Description |
|---|---|
| `--help`, `-h` | Show help and exit 0 |
| `--version`, `-v` | Print `Coco v{VERSION}` and exit 0 |
| `--daemon` | Internal flag: run as background daemon (not for direct use) |

---

## Authentication

If the stored Copilot token is missing or expired, any command that requires
authentication triggers the OAuth device flow before proceeding. Output:

```
Visit https://github.com/login/device and enter: ABCD-1234
Waiting for authorization...
Authenticated ✓
```

---

## Error Format

All fatal errors print to **stderr** with a calm, single-line message:

```
Error: <message>
```

No stack traces. No internal paths. Exit code 1.
