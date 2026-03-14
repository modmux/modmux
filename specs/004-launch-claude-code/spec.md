# Feature Specification: Launch Claude Code Subprocess

**Feature Branch**: `004-launch-claude-code`\
**Created**: 2026-03-08\
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Happy Path Launch (Priority: P1)

A developer runs `claudio`. After authenticating and the proxy starts, Claude
Code launches automatically. The developer sees Claude Code's UI take over the
terminal.

**Why this priority**: This is Claudio's core value proposition — the entire
tool exists to bridge Claude Code to Copilot models.

**Independent Test**: Run `claudio`, complete auth, verify the proxy starts and
Claude Code launches as a subprocess with the correct environment variables set.

**Acceptance Scenarios**:

1. **Given** the proxy is running and `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`
   are set, **When** Claudio spawns Claude Code, **Then** Claude Code starts
   with inherited stdio and those env vars in scope.
2. **Given** Claude Code exits with code 0, **When** the subprocess completes,
   **Then** Claudio shuts down the proxy and exits with code 0.
3. **Given** Claude Code exits with a non-zero code, **When** the subprocess
   completes, **Then** Claudio shuts down the proxy and exits with the same
   code.

---

### User Story 2 — Claude Code Not Installed (Priority: P2)

A developer runs `claudio` but does not have Claude Code installed. Claudio
detects this, prints calm installation instructions, and exits cleanly.

**Why this priority**: Silent failure or a cryptic OS error is a poor first-run
experience. Clear guidance is essential.

**Independent Test**: Run `claudio` with a `PATH` that does not include a
`claude` binary; verify the installation message is printed and Claudio exits
non-zero.

**Acceptance Scenarios**:

1. **Given** `claude` is not found on `PATH`, **When** Claudio attempts to
   launch it, **Then** Claudio prints calm installation instructions and
   exits 1.
2. **Given** the installation message is displayed, **When** the user reads it,
   **Then** the message includes the install URL (`https://claude.ai/download`)
   and the `npm install -g @anthropic-ai/claude-code` command.

---

### User Story 3 — Proxy Shutdown on Claude Code Exit (Priority: P1)

When Claude Code exits for any reason, the proxy shuts down cleanly. No orphan
processes are left.

**Why this priority**: Constitution requirement — Claudio must not continue
running after Claude Code begins/ends execution.

**Acceptance Scenarios**:

1. **Given** Claude Code exits, **When** the subprocess ends, **Then** the HTTP
   server is stopped before Claudio exits.
2. **Given** Claude Code is killed by a signal, **When** the subprocess ends
   with a non-zero exit, **Then** Claudio still shuts down the proxy and exits.

---

### Edge Cases

- What if `claude` is found but is not executable (permissions)?
- What if the proxy port is still binding when Claude Code starts?
- What happens if `Deno.Command` spawn fails for an unknown OS reason?
- What additional args/flags should be forwarded to Claude Code (if any)?

## Requirements

### Functional Requirements

- **FR-001**: After the proxy starts successfully, Claudio MUST locate the
  `claude` binary on `PATH` (or a well-known install location).
- **FR-002**: If `claude` is not found, Claudio MUST print installation
  instructions (URL + npm command) and exit with code 1.
- **FR-003**: Claudio MUST spawn `claude` as a subprocess with inherited stdio
  so the user's terminal is handed off entirely.
- **FR-004**: Claudio MUST set `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`
  environment variables pointing to the local proxy before spawning.
- **FR-005**: Claudio MUST wait for the Claude Code subprocess to exit.
- **FR-006**: On Claude Code exit, Claudio MUST stop the proxy server and exit
  with the same exit code as Claude Code.
- **FR-007**: Any args passed to `claudio` that are not Claudio-specific flags
  MUST be forwarded to the `claude` subprocess.

### Key Entities

- **ClaudeCodeLauncher**: Locates the binary, sets env, spawns, waits, exits.
- **ProxyLifecycle**: Start → ready signal → launch Claude Code → stop on exit.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Running `claudio` on a machine with Claude Code installed results
  in Claude Code launching within 500ms of the proxy becoming ready.
- **SC-002**: Running `claudio` without Claude Code installed shows the
  installation message within 1 second and exits 1.
- **SC-003**: No proxy process remains after Claude Code exits.
- **SC-004**: Claude Code's exit code is faithfully propagated to the shell.
