# Feature Specification: Coco — Universal Local AI Gateway (Migration from Claudio)

**Feature Branch**: `007-coco-migration`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: Evolve the Claudio codebase into Coco — a universal local AI gateway with a background service, multi-API proxy, configuration manager, agent-detection engine, and a minimal TUI.

---

## Clarifications

### Session 2026-03-10

- Q: How should `coco start` daemonise the background service? → A: Re-spawn itself as a detached child process — `coco start` spawns a second `coco --daemon` process with detached stdio, then exits the parent.
- Q: What network address should the Coco proxy bind to? → A: `127.0.0.1` only — localhost-only, never network-accessible.
- Q: Where should the background service write its logs? → A: File log at `~/.coco/coco.log`, configurable log level (default: `info`).
- Q: How should Coco handle a `429 Too Many Requests` from the Copilot API? → A: Retry with exponential backoff (max 3 attempts, up to ~4s total), then propagate 429 to the caller.
- Q: How should Coco handle model name mapping between agent requests and Copilot model IDs? → A: Static mapping table — a bundled default map (e.g. `gpt-4o` → Copilot gpt-4o model ID, `claude-3-5-sonnet` → Copilot claude-3.5-sonnet model ID) stored in `~/.coco/config.json`; user can extend or override entries.

---

## Delta Plan: Claudio → Coco

### What Stays (Reuse as-is)

| Module | Path | Reason |
|---|---|---|
| GitHub Copilot OAuth flow | `src/auth/` | Device flow is unchanged; token storage is reused |
| Copilot API client | `src/copilot/` | Token management, model listing, request forwarding all preserved |
| Anthropic request/response transformation | `src/server/transform.ts` | Core translation logic is unchanged |
| Proxy HTTP server scaffold | `src/server/server.ts` | Port binding, graceful shutdown remain |
| Existing Anthropic route | `src/server/router.ts` → `/v1/messages` | Kept; OpenAI route added alongside it |
| Shared utilities | `src/lib/` | Error handling and token utilities unchanged |
| Version tracking | `src/version.ts` | Bumped; not rewritten |
| Calm, minimal UX tone | All `console.log` strings | Preserved verbatim across all new modules |

### What Changes (Expand or modify)

| Module | Change |
|---|---|
| `src/cli/main.ts` | Becomes Coco's CLI entry point; adds `start`, `stop`, `restart`, `status`, `configure`, `unconfigure`, `doctor`, `models` sub-commands; default invocation opens TUI |
| `src/server/router.ts` | Adds `/v1/chat/completions` (OpenAI), `/v1/models`, `/health` alongside existing Anthropic route |
| `src/server/server.ts` | Gains daemonisation support (background mode); writes PID file; emits status to TUI |
| `src/server/transform.ts` | Extended to handle OpenAI ↔ Copilot translation in addition to existing Anthropic ↔ Copilot path |
| Binary name | Renamed `claudio` → `coco` in all build artifacts and distribution |
| `deno.json` tasks | Updated compile task, binary output name |

### What Is Removed

| Module | Reason |
|---|---|
| `src/cli/launch.ts` | Single-tool "launch Claude Code" assumption replaced by agent-detection + multi-agent configuration |
| `src/cli/session.ts` | Session resume hint tied to Claude Code; replaced by generic TUI exit message |
| Hardcoded `ANTHROPIC_BASE_URL` launch pattern | Replaced by configuration manager writing per-agent config files |

### What Is Added

| New Module | Path | Description |
|---|---|---|
| Background service | `src/service/` | Daemonise the proxy; PID management; start/stop/restart/status |
| Agent-detection engine | `src/agents/detector.ts` | Scans PATH, VS Code extensions, JetBrains plugins, config files |
| Configuration manager | `src/agents/config.ts` | Writes/reverts per-agent config files; validates with test call |
| Agent registry | `src/agents/registry.ts` | Canonical list of supported agents with metadata |
| OpenAI proxy translator | `src/server/openai.ts` | OpenAI ↔ Copilot request/response transformation |
| TUI | `src/tui/` | Ink-style terminal UI; radio-button toggles; launched by default `coco` invocation |
| Config store | `src/config/store.ts` | Reads/writes `~/.coco/config.json`; schema-validated |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-Run Background Service Start (Priority: P1)

A developer runs `coco start`. Coco authenticates (if needed), starts the
background proxy service, and confirms it is listening. Subsequent terminal
sessions do not require re-launch.

**Why this priority**: The background service is the foundational layer that all
other features depend on. Without a running service there is nothing to
configure agents against.

**Independent Test**: Run `coco start`, then close the terminal and open a new
one; run `coco status` and verify the service is still running on the expected
port.

**Acceptance Scenarios**:

1. **Given** no Coco service is running, **When** the user runs `coco start`,
   **Then** Coco daemonises the proxy, writes a PID file to `~/.coco/coco.pid`,
   and prints `Coco is running on http://localhost:11434`.
2. **Given** a Coco service is already running, **When** the user runs
   `coco start`, **Then** Coco prints `Coco is already running` and exits 0
   without starting a second instance.
3. **Given** the service is running, **When** the user runs `coco stop`, **Then**
   the proxy shuts down gracefully, the PID file is removed, and Coco prints
   `Coco stopped`.
4. **Given** the service is running, **When** the user runs `coco status`, **Then**
   Coco prints `Running on http://localhost:11434` and the Copilot auth status.
5. **Given** the service is not running, **When** the user runs `coco status`,
   **Then** Coco prints `Not running` and exits 1.

---

### User Story 2 — TUI: Toggle and Apply Agent Configuration (Priority: P1)

A developer runs `coco` (bare invocation). The TUI opens showing all detected
agents. They press Space to toggle which agents Coco should configure, then
press Enter to apply changes in batch.

**Why this priority**: The TUI is the primary user interface for Coco. It
replaces the single-tool "launch Claude Code" UX with a calm multi-agent
control surface.

**Independent Test**: Run `coco` with Claude Code and Cline installed; toggle
Claude Code on and Cline on; press Enter; verify both agents have their config
files written pointing to `http://localhost:11434`.

**Acceptance Scenarios**:

1. **Given** the TUI is open and the service is running, **When** the user presses
   Space on an installed agent row, **Then** the selection toggles `[x]` ↔ `[ ]`.
2. **Given** the TUI is open and selections have been made, **When** the user
   presses Enter, **Then** Coco writes config files for all selected agents and
   reverts config files for all deselected agents, then exits the TUI.
3. **Given** the TUI is open, **When** the user presses `q`, **Then** the TUI
   exits without applying any changes.
4. **Given** an agent is in state `not-installed`, **When** the TUI renders its
   row, **Then** the row is displayed greyed out and cannot be toggled.
5. **Given** an agent is in state `misconfigured`, **When** the TUI renders its
   row, **Then** the row shows a subtle warning indicator (e.g., `[-]`).

---

### User Story 3 — OpenAI-Compatible Endpoint (Priority: P1)

A developer configures an OpenAI-compatible agent (e.g., Aider, GPT-Engineer)
to point at `http://localhost:11434/v1`. The agent sends OpenAI-format requests
and receives OpenAI-format responses.

**Why this priority**: Without the OpenAI endpoint, the majority of the agent
ecosystem cannot be supported. This doubles the proxy's reach.

**Independent Test**: Send a POST to `/v1/chat/completions` with a valid
OpenAI-format body; verify the response is a valid OpenAI-format completion
object forwarded from Copilot.

**Acceptance Scenarios**:

1. **Given** the service is running, **When** a POST to `/v1/chat/completions`
   is received with a valid OpenAI request body, **Then** Coco translates it to
   Copilot format, forwards it, and returns an OpenAI-format response.
2. **Given** an OpenAI streaming request (`stream: true`), **When** the request
   is received, **Then** Coco streams `data: {...}` SSE chunks in OpenAI delta
   format.
3. **Given** a GET to `/v1/models`, **When** the request is received, **Then**
   Coco returns a JSON list of available Copilot model IDs in OpenAI model
   format.
4. **Given** a GET to `/health`, **When** the request is received, **Then** Coco
   returns `{"status":"ok"}` with HTTP 200.

---

### User Story 4 — Per-Agent Configuration (Priority: P2)

A developer runs `coco configure claude-code`. Coco writes the Claude Code
config file pointing to Coco's proxy, then performs a test call to validate it.

**Why this priority**: Per-agent CLI commands support automation and scripting
workflows where the TUI is not desired.

**Independent Test**: Run `coco configure claude-code`; inspect the output
config file; run `coco unconfigure claude-code` and verify the config is
reverted.

**Acceptance Scenarios**:

1. **Given** the service is running, **When** the user runs
   `coco configure <agent>`, **Then** Coco writes the agent's config file
   (location varies by agent) and prints `<agent> configured`.
2. **Given** an agent is configured, **When** the user runs
   `coco unconfigure <agent>`, **Then** Coco reverts the config file to its
   prior state and prints `<agent> unconfigured`.
3. **Given** configuration completes, **When** the validation test call fails,
   **Then** Coco prints a warning and exits with a non-zero code.

---

### User Story 5 — Agent Detection (Priority: P2)

A developer runs `coco doctor`. Coco scans PATH, VS Code extensions, JetBrains
plugins, and known config file locations, then prints the state of every
supported agent.

**Why this priority**: Users need to know which agents are eligible before
configuring them. `doctor` is the diagnostic/inspection command.

**Independent Test**: Run `coco doctor`; verify all installed agents on the
system are reported as `installed` or `detected`; verify absent agents are
reported as `not-installed`.

**Acceptance Scenarios**:

1. **Given** an agent binary is on PATH, **When** `coco doctor` runs, **Then**
   the agent is reported as `installed`.
2. **Given** a VS Code extension is present but the binary is absent, **When**
   `coco doctor` runs, **Then** the agent is reported as `detected`.
3. **Given** no evidence of an agent, **When** `coco doctor` runs, **Then**
   the agent is reported as `not-installed`.
4. **Given** the doctor output is printed, **When** the user reads it, **Then**
   each row includes agent name, state, and configured status.

---

### User Story 6 — Coco Models List (Priority: P3)

A developer runs `coco models`. Coco queries the Copilot API and prints the
available model IDs in a calm, minimal table.

**Why this priority**: Visibility into available models helps users understand
what Coco can route to; useful for debugging and scripting.

**Independent Test**: Run `coco models`; verify the output contains at least one
model ID returned from the Copilot API.

**Acceptance Scenarios**:

1. **Given** the user is authenticated, **When** `coco models` is run, **Then**
   Coco prints a list of model IDs (one per line or in a minimal table).
2. **Given** the user is not authenticated, **When** `coco models` is run, **Then**
   Coco triggers the OAuth device flow before listing models.

---

### Edge Cases

- What if the PID file exists but the process is dead? → `coco start` detects
  stale PID, removes it, and starts a fresh instance.
- What if port 11434 is occupied? → Coco tries the next available port and
  stores it in `~/.coco/config.json`; `coco status` always reflects the actual
  port.
- What if an agent's config file does not exist before configuration? → Coco
  creates it; `unconfigure` removes it entirely rather than reverting.
- What if the Copilot API returns `429 Too Many Requests`? → Coco retries with exponential backoff (100ms, 200ms, 400ms — max 3 attempts). After exhausting retries, the `429` is propagated verbatim to the calling agent in the appropriate format (Anthropic or OpenAI error envelope).
- What happens on a non-TTY invocation of `coco`? → Falls back to `coco status`
  output without opening the TUI.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Background Service

- **FR-001**: `coco start` MUST re-spawn itself as a detached child process by invoking `coco --daemon` with detached stdio (no TTY), then exit the parent process. The child writes a PID file to `~/.coco/coco.pid` and begins serving.
- **FR-002**: `coco stop` MUST send SIGTERM to the PID in `~/.coco/coco.pid`,
  wait for the process to exit, and remove the PID file.
- **FR-003**: `coco restart` MUST stop then start the service, preserving port
  assignment.
- **FR-004**: `coco status` MUST read the PID file, verify the process is alive,
  and print port and auth status; exit 1 if not running.
- **FR-005**: The service MUST bind exclusively to `127.0.0.1` (never `0.0.0.0`) and expose `/health` returning `{"status":"ok"}`.
- **FR-005a**: The daemon MUST write structured log lines to `~/.coco/coco.log` at configurable log level (default: `info`; valid values: `debug`, `info`, `warn`, `error`). Log level is stored in `~/.coco/config.json` under `logLevel`.
- **FR-005b**: `coco doctor` MUST display the path to the log file and the last 5 error-level log lines (if any).

#### Multi-API Proxy

- **FR-006**: The server MUST expose `POST /v1/messages` with full
  Anthropic-compatible request/response and streaming (preserved from Claudio).
- **FR-007**: The server MUST expose `POST /v1/chat/completions` with
  OpenAI-compatible request/response and streaming.
- **FR-008**: The server MUST expose `GET /v1/models` returning models in
  OpenAI format, listing the real Copilot model IDs available via the API.
- **FR-008a**: Coco MUST maintain a bundled default model alias map (e.g. `gpt-4o`, `claude-3-5-sonnet-20241022` → their Copilot model IDs). When a request arrives with a known alias, Coco MUST translate the model name to its Copilot ID before forwarding. When the requested model name is not in the map, it is passed through unchanged. The map MUST be overridable via `modelMap` in `~/.coco/config.json`.
- **FR-009**: The server MUST translate OpenAI request bodies to Copilot HTTP
  format and translate Copilot responses back to OpenAI format.
- **FR-009a**: On a `429` from the Copilot API, Coco MUST retry with exponential backoff (delays: 100ms, 200ms, 400ms; max 3 attempts). After exhausting retries, Coco MUST propagate a `429` response to the caller in the caller's native error format (Anthropic error envelope for `/v1/messages`, OpenAI error envelope for `/v1/chat/completions`).
- **FR-010**: Streaming MUST use SSE with `data: {...}\n\n` framing for OpenAI
  and existing `event: ...\ndata: {...}\n\n` framing for Anthropic.

#### Configuration Manager

- **FR-011**: `coco configure <agent>` MUST write the agent's config file to
  the canonical location for that agent.
- **FR-012**: `coco unconfigure <agent>` MUST revert the agent's config file to
  its pre-Coco state (restore backup if present, otherwise remove).
- **FR-013**: After writing a config file, Coco MUST perform a test API call to
  verify the configuration is valid.
- **FR-014**: Configuration state MUST be persisted in `~/.coco/config.json`.
- **FR-015**: The configuration manager MUST support: Claude Code, Cline, Kilo,
  OpenCode, Goose, Aider, GPT-Engineer.

#### Agent-Detection Engine

- **FR-016**: The detector MUST scan PATH for each agent's known binary name.
- **FR-017**: The detector MUST scan `~/.vscode/extensions/` for known VS Code
  extension IDs.
- **FR-018**: The detector MUST scan known JetBrains plugin directories.
- **FR-019**: The detector MUST scan known agent config file locations.
- **FR-020**: Each agent MUST be classified as `installed`, `detected`, or
  `not-installed`.

#### TUI

- **FR-021**: Running `coco` on a TTY MUST open the TUI.
- **FR-022**: The TUI MUST display service status (running/not running, port)
  and Copilot auth status at the top.
- **FR-023**: Each detected/installed agent MUST be shown as a toggleable row
  (`[ ]` / `[x]`).
- **FR-024**: `not-installed` agents MUST be shown greyed out and non-toggleable.
- **FR-025**: Spacebar MUST toggle the selected row; Enter MUST apply all
  changes in batch; `q` MUST exit without applying.
- **FR-026**: Misconfigured agents (configured but test call fails) MUST show
  `[-]` with a subtle warning.
- **FR-027**: Running `coco` on a non-TTY MUST print `coco status` output and
  exit 0.

#### CLI

- **FR-028**: The binary name MUST be `coco`.
- **FR-029**: `coco doctor` MUST print each supported agent's name, detection
  state, and configuration status.
- **FR-030**: `coco models` MUST print available Copilot model IDs.

### Key Entities

- **CocoService**: Background daemon; manages HTTP server lifecycle and PID file
- **AgentRecord**: `{ name, binaryNames, extensionIds, configPaths, state, configured }`
- **DetectionResult**: `{ agent: AgentRecord, state: "installed" | "detected" | "not-installed" }`
- **ConfigEntry**: `{ agent, configPath, backupPath, endpoint, appliedAt }`
- **CocoConfig**: `{ port, logLevel, modelMap: Record<string,string>, agents: ConfigEntry[], lastStarted }` — persisted to `~/.coco/config.json`; `modelMap` ships with a bundled default and is user-overridable
- **OpenAIRequest**: `{ model, messages, stream?, temperature?, max_tokens? }`
- **OpenAIResponse**: `{ id, object, model, choices: [{ message, finish_reason }] }`
- **OpenAIDelta**: SSE delta for streaming — `{ id, object, choices: [{ delta, finish_reason }] }`
- **TUIState**: `{ serviceRunning, port, authStatus, agents: AgentRow[], cursor }`

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Multiple coding agents (Claude Code, Cline, Aider) run
  seamlessly through Coco with zero manual environment variable setup.
- **SC-002**: `coco start` / `coco stop` complete in under 1 second each on a
  modern laptop.
- **SC-003**: The TUI renders in under 200ms on first open.
- **SC-004**: OpenAI-compatible requests round-trip through the proxy in under
  150ms overhead (excluding Copilot API latency).
- **SC-005**: `coco configure <agent>` and `coco unconfigure <agent>` are
  deterministically reversible — the config file is byte-identical to its
  pre-Coco state after unconfigure.
- **SC-006**: All existing Claudio tests pass after migration (no regression on
  Anthropic proxy or auth paths).
- **SC-007**: `coco doctor` correctly classifies agents on a fresh macOS, Linux,
  and Windows machine.
- **SC-008**: Calm, minimal output is preserved across all CLI commands — no
  stack traces, no verbose internal logging exposed to the user.
