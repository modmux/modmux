# Implementation Plan: UX Improvements

**Branch**: `006-ux-improvements` | **Date**: 2026-03-08 | **Spec**:
[spec.md](./spec.md) **Input**: Feature specification from
`/specs/006-ux-improvements/spec.md`

## Summary

Three independent UX polish changes to the claudio CLI:

1. **Token expiry → 30 days** (was 8 hours): reduces re-authentication friction
   for daily users; change one constant in `src/cli/auth.ts`
2. **Clear screen before Claude launches**: adds `console.clear()` in `main()`
   after server start and before `launchClaudeCode()`; guarded by TTY check
3. **Exit resume hint**: prints `Run \`claudio\` to
   resume.`after Claude exits
   with code 0; appended in`main()`before`Deno.exit()`

No new dependencies. All changes are in `src/cli/main.ts` and `src/cli/auth.ts`.

## Technical Context

**Language/Version**: Deno (latest stable) + TypeScript\
**Primary Dependencies**: Deno std/http, @github/copilot-sdk (no new deps)\
**Storage**: Platform secure token storage (Keychain/Credential Manager/Secret
Service)\
**Testing**: `deno test` (existing test suite in `tests/`)\
**Target Platform**: macOS, Linux, Windows (cross-platform CLI binary)\
**Project Type**: CLI tool / proxy binary\
**Performance Goals**: N/A (startup-path changes only)\
**Constraints**: Must not break non-TTY/piped usage; must not intercept Claude's
TUI\
**Scale/Scope**: 2 source files, 3 one-line changes

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status  | Notes                                                                         |
| -------------------------- | ------- | ----------------------------------------------------------------------------- |
| I. Minimalism              | ✅ PASS | Three single-line changes; no new features, no new config surfaces            |
| II. Calm UX                | ✅ PASS | Clear screen reinforces "Claudio disappears"; resume hint is quiet and direct |
| III. Predictability        | ✅ PASS | Behavior is deterministic; TTY guard prevents piped-mode surprises            |
| IV. Separation of Concerns | ✅ PASS | Changes are in startup/teardown path only; no interference with Claude's TUI  |
| V. Portability             | ✅ PASS | `Deno.stdout.isTerminal()` is cross-platform; no new deps                     |
| VI. Transparency           | ✅ PASS | No transformations changed; startup/teardown path only                        |
| VII. Self-Containment      | ✅ PASS | No new SDK or CLI dependencies                                                |
| VIII. Contract Testing     | ✅ PASS | No proxy contracts changed                                                    |
| IX. Quality Gates          | ✅ PASS | Existing test suite covers auth token; new tests for TTY guard and exit hint  |

No violations. No Complexity Tracking table needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-ux-improvements/
├── plan.md              # This file
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── auth.ts          # Change: expiresAt 8h → 30d (FR-001)
│   ├── session.ts       # New: getLatestSessionId() — scans ~/.claude/ (FR-004, FR-006)
│   └── main.ts          # Change: clear screen + resume hint (FR-002..005)

tests/
├── auth/
│   └── auth_test.ts     # New: verify 30-day expiresAt (US1)
└── contract/
    ├── cli_test.ts      # Extended: clear screen guard + resume hint on/off (US2, US3)
    └── session_test.ts  # New: getLatestSessionId() contract tests (US3)
```

**Structure Decision**: Single-project layout; changes are surgical and
localized to two existing files.

## Phase 0: Research

_No NEEDS CLARIFICATION items. Token expiry preference confirmed by user (30
days). All implementation details are known from codebase exploration._

**research.md**: Not required — all decisions resolved during planning.

| Decision                                                            | Rationale                                           | Alternatives Considered                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| 30-day token expiry                                                 | Matches GitHub CLI (`gh`) behavior; user confirmed  | 24h (too frequent), never-expire (security risk if keychain compromised)        |
| `console.clear()` guarded by `Deno.stdout.isTerminal()`             | Prevents clearing output in piped/CI contexts       | Unconditional clear (breaks scripted use), ANSI escape directly (less portable) |
| Post-exit resume hint (append after Claude exits, exit code 0 only) | Non-invasive; no PTY/pipe needed; doesn't break TUI | PTY interception to replace Claude's "claude" text (complex, fragile)           |

## Phase 1: Design

### Data Model Changes

**AuthToken** (`src/cli/auth.ts`, line 53):

```typescript
// Before
expiresAt: Date.now() + 8 * 60 * 60 * 1000,        // 8 hours

// After
expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,  // 30 days
```

### main() Control Flow Changes

```typescript
// src/cli/main.ts — updated main() sequence

// 1. Auth (unchanged)
// 2. Start proxy server (unchanged)

// NEW: Clear screen only on TTY, only when Claude is about to start
if (Deno.stdout.isTerminal()) {
  console.clear();
}

// 3. Launch Claude (unchanged)
exitCode = await launchClaudeCode(binary, port, forwardedArgs);

// NEW: Resume hint after clean exit — session ID from ~/.claude/ with generic fallback
if (exitCode === 0) {
  const sessionId = await getLatestSessionId();
  if (sessionId) {
    console.log(`Run \`claudio --resume ${sessionId}\` to resume.`);
  } else {
    console.log("Run `claudio` to resume.");
  }
}
```

### Contracts

No external interface changes. The proxy HTTP API is unchanged. No contracts/
directory needed.
