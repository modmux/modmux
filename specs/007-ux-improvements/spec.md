# Feature Specification: UX Improvements

**Feature Branch**: `007-ux-improvements`\
**Created**: 2026-03-08\
**Status**: Draft\
**Input**: User description: "exit message branding, clear screen before launch,
extend token expiry"

## Clarifications

### Session 2026-03-08

- Q: Should the exit resume hint include Claude's session ID/resume argument, or
  be a generic fixed string, or be suppressed entirely? → A: Forward Claude's
  session resume args — detect session ID from Claude's session storage
  post-exit and include it in the hint (e.g., `Run \`claudio --resume abc123\`
  to resume.`); fall back to generic hint if undetectable.
- Q: How should claudio detect the session ID after Claude exits? → A: Read
  Claude's session storage directory (`~/.claude/`) after exit — scan for the
  most recently modified session file and extract the ID; no output interception
  or PTY required.
- Q: When a fresh device flow ran during startup and the screen-clear fires
  before Claude launches, should the re-auth messages be preserved or is
  clearing them acceptable? → A: Always clear unconditionally — by the time the
  clear fires, auth is complete and the URL/code are no longer needed.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Extend Token Expiration (Priority: P1)

When a user authenticates with GitHub Copilot via the device flow, their stored
OAuth token expires after 30 days instead of 8 hours. Users who work daily no
longer need to re-authenticate more than once a month.

**Why this priority**: Token expiration at 8 hours means users who start early
and work late must re-authenticate mid-session or across days. This is the most
friction-reducing change with zero UX risk.

**Independent Test**: Can be fully tested by authenticating, then verifying the
stored token's `expiresAt` timestamp is approximately 30 days in the future.

**Acceptance Scenarios**:

1. **Given** a user completes the OAuth device flow, **When** the token is
   saved, **Then** `expiresAt` is set to `Date.now() + 30 * 24 * 60 * 60 * 1000`
2. **Given** a stored token created 7 days ago, **When** `isTokenValid()` is
   called, **Then** it returns `true`
3. **Given** a stored token created 31 days ago, **When** `isTokenValid()` is
   called, **Then** it returns `false` and re-authentication is triggered

---

### User Story 2 - Clear Screen Before Claude Launches (Priority: P2)

After the proxy server starts and authentication is confirmed, the terminal is
cleared so that Claude Code appears at the top of the screen with no prior
claudio startup output above it.

**Why this priority**: Claudio's startup output (auth status, server info)
clutters the terminal above Claude's TUI. Clearing the screen provides a clean
slate consistent with the "Claudio disappears" principle in the constitution.

**Independent Test**: Can be fully tested by running `claudio` and observing
that the terminal is cleared immediately before Claude Code's interface appears,
with no claudio output visible above it.

**Acceptance Scenarios**:

1. **Given** claudio has printed startup messages (auth, server port) including
   any re-authentication flow, **When** the proxy server is ready and Claude is
   about to launch, **Then** the terminal is always cleared unconditionally
2. **Given** the clear screen occurs, **When** Claude Code starts, **Then**
   Claude's interface appears at the top of the terminal
3. **Given** Claude is not found and claudio exits with an error, **When** the
   clear screen would have fired, **Then** the clear does NOT happen (error
   message remains visible)

---

### User Story 3 - Exit Message Branding (Priority: P3)

When a user exits Claude Code, claudio prints a branded resume hint that
includes the session resume argument captured from Claude's session storage, so
the user has the exact command needed to restore context. Example output:
`Run \`claudio --resume abc123\` to resume.`

**Why this priority**: Claude's native exit message references `claude`
directly. This is a polish feature that reinforces the claudio brand. It is
lower priority because the user can still function correctly even if Claude's
message shows `claude`.

**Independent Test**: Can be fully tested by exiting a `claudio` session and
verifying that a `Run \`claudio --resume <id>\` to resume.` line appears after
Claude's TUI closes, with the correct session ID.

**Acceptance Scenarios**:

1. **Given** a user exits Claude Code normally (exit code 0) and a session ID is
   detectable, **When** Claude's process terminates, **Then** claudio prints
   `Run \`claudio --resume <session-id>\` to resume.` to stdout before exiting
2. **Given** a user exits Claude Code normally (exit code 0) but no session ID
   can be detected, **When** Claude's process terminates, **Then** claudio
   prints the fallback `Run \`claudio\` to resume.`
3. **Given** a user exits Claude Code with a non-zero exit code (crash/error),
   **When** Claude's process terminates, **Then** claudio does NOT print the
   resume hint
4. **Given** the resume hint is printed, **When** the user reads it, **Then**
   the command shown uses `claudio`, not `claude`

---

### Edge Cases

- What happens if `console.clear()` is called on a non-TTY (e.g., piped output)?
  Must not break scripted/CI usage — guard with `Deno.stdout.isTerminal()`.
- What if the token expiry on the GitHub side is shorter than 30 days? The
  stored `expiresAt` is a local client-side guard; the Copilot API token
  exchange will fail with 401 first, which triggers re-authentication anyway.
- What if the user presses Ctrl+C to exit Claude (SIGINT)? Exit code will be
  non-zero; the resume hint should not print.
- What if no session ID can be detected after Claude exits? Fall back to the
  generic `Run \`claudio\` to resume.`hint without a`--resume` flag.
- What if `~/.claude/` session storage is missing or unreadable (permissions,
  first run, non-standard install)? Use the generic fallback; do not error.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The OAuth token saved after device flow MUST have `expiresAt` set
  to 30 days from the current time.
- **FR-002**: The terminal MUST be cleared after the proxy server is confirmed
  ready and before `launchClaudeCode()` is called — unconditionally, including
  when a fresh device flow ran during the same startup.
- **FR-003**: The clear screen MUST only execute when stdout is a TTY
  (`Deno.stdout.isTerminal()`).
- **FR-004**: After Claude exits with exit code 0, claudio MUST scan
  `~/.claude/` for the most recently modified session file and extract the
  session ID to construct `Run \`claudio --resume <session-id>\` to resume.`
- **FR-005**: The resume hint MUST NOT be printed when Claude exits with a
  non-zero exit code.
- **FR-006**: If `~/.claude/` does not exist, is unreadable, or contains no
  session files, claudio MUST fall back to `Run \`claudio\` to resume.`

### Key Entities

- **AuthToken**: Extended `expiresAt` from 8-hour offset to 30-day offset
- **main()**: Gains a `console.clear()` call and a post-exit resume hint

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: After authentication, `token.expiresAt - token.createdAt` equals
  exactly `30 * 24 * 60 * 60 * 1000` ms (2,592,000,000 ms)
- **SC-002**: Running `claudio` on a TTY results in a cleared terminal with
  Claude at the top — no claudio startup lines visible
- **SC-003**: Exiting Claude cleanly (`/exit`) results in `Run \`claudio
  --resume <id>\` to resume.` appearing on the terminal (or the generic fallback
  if no session ID detected)
- **SC-004**: All three changes are independently releasable and have no
  cross-dependencies
