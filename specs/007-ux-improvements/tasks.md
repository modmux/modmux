# Tasks: UX Improvements

**Input**: Design documents from `/specs/007-ux-improvements/`
**Prerequisites**: spec.md ✅, plan.md ✅, clarifications recorded 2026-03-08

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story. All three stories are independently
deployable — no cross-dependencies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Confirm baseline passes and align all documents before any changes
land.

- [ ] T001 Run existing test suite to establish green baseline: `deno task test`
- [ ] T002 Explore `~/.claude/` directory structure on the current machine to
      identify session file format and session ID field name; document findings
      as a comment block at the top of `src/cli/session.ts` (create the file for
      this purpose — leave implementation empty)
- [ ] T017 Update `plan.md` Phase 1 Design section to reflect the clarified
      resume hint format (session ID from `~/.claude/` with fallback) so plan.md
      is accurate before US3 implementation begins

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the session reader stub needed by US3 so contract tests can
be written against it (TDD — stub first, tests second, implementation third).
US1 and US2 have no foundational prerequisites beyond the baseline.

**⚠️ CRITICAL**: T003 must complete before US3 tasks begin. T002 (path research)
must complete before T003.

- [ ] T003 [US3] In `src/cli/session.ts` (created in T002), add the exported
      function stub:
      `export async function getLatestSessionId(): Promise<string | null> { return null; }`
      — this is an intentionally failing stub so T011 tests can be written
      against it before T013 implements it

---

## Phase 3: User Story 1 — Extend Token Expiration (Priority: P1) 🎯 MVP

**Goal**: OAuth token `expiresAt` set to 30 days; users re-authenticate at most
once per month.

**Independent Test**: After device flow completes, assert
`token.expiresAt - token.createdAt === 30 * 24 * 60 * 60 * 1000`

### Tests for User Story 1

- [ ] T004 [P] [US1] Add unit test in `tests/auth/auth_test.ts` — assert
      `token.expiresAt - token.createdAt` equals `2_592_000_000` ms (30 days)
      after a successful `authenticate()` call
- [ ] T005 [P] [US1] Add unit test in `tests/auth/auth_test.ts` — assert
      `isTokenValid()` returns `true` for a token created 7 days ago and `false`
      for one created 31 days ago

### Implementation for User Story 1

- [ ] T006 [US1] In `src/cli/auth.ts` line ~53, change `8 * 60 * 60 * 1000` to
      `30 * 24 * 60 * 60 * 1000` in the `expiresAt` assignment inside
      `authenticate()`
- [ ] T007 [US1] Run `deno task test` and confirm T004 and T005 pass; confirm no
      existing tests regress

---

## Phase 4: User Story 2 — Clear Screen Before Launch (Priority: P2)

**Goal**: Terminal is cleared (TTY only) immediately before Claude Code starts,
so Claude appears at the top with no claudio startup output above it.

**Independent Test**: Run `claudio` on a TTY; observe terminal clears and Claude
appears at top. Run `claudio --help` (non-TUI path) — no clear fires. Pipe
output (`claudio 2>&1 | cat`) — no ANSI clear codes in stream.

### Tests for User Story 2

- [ ] T008 [P] [US2] Add test in `tests/contract/cli_test.ts` — spawn
      `claudio --help` with `stdout: "piped"` and assert output does NOT contain
      ANSI clear escape sequence (`\x1b[2J` or `\x1bc`)

### Implementation for User Story 2

- [ ] T009 [US2] In `src/cli/main.ts` `main()`, after `startServer()` returns
      and after `findClaudeBinary()` succeeds (i.e., just before the `try` block
      that calls `launchClaudeCode()`), insert:
  ```typescript
  if (Deno.stdout.isTerminal()) {
    console.clear();
  }
  ```
- [ ] T010 [US2] Run `deno task test` and confirm T008 passes; confirm no
      existing tests regress

---

## Phase 5: User Story 3 — Exit Message Branding (Priority: P3)

**Goal**: After Claude exits cleanly (exit code 0), claudio prints
``Run `claudio --resume <id>` to resume.`` (or generic fallback) so users have
the exact branded command to restore their session.

**Independent Test**: Exit a `claudio` session with `/exit` (exit code 0) —
verify branded hint appears. Simulate non-zero exit — verify hint does NOT
appear. Simulate missing `~/.claude/` — verify generic fallback appears.

**Dependency**: T003 (`src/cli/session.ts`) must be complete.

### Tests for User Story 3

- [ ] T011 [P] [US3] Add contract tests in `tests/contract/session_test.ts` for
      `getLatestSessionId()` (write FIRST against the stub from T003 — tests
      MUST fail before T013 implements):
  - Returns `null` when `~/.claude/` does not exist
  - Returns `null` when directory exists but contains no session files
  - Returns the correct session ID from the most recently modified session file
  - Does not throw on permission errors (returns `null`)
- [ ] T012 [P] [US3] Add tests in `tests/contract/cli_test.ts`:
  - When a mock/stub Claude exits with code 0, captured stdout includes
    ``Run `claudio` to resume`` (fallback form at minimum)
  - When a mock/stub Claude exits with code 1, captured stdout does NOT contain
    ``Run `claudio` to resume`` (verifies FR-005)

### Implementation for User Story 3

- [ ] T013 [US3] Implement `getLatestSessionId()` in `src/cli/session.ts` using
      the path and session ID field confirmed by T002 — use `Deno.readDir` to
      list the session directory; `Deno.stat` each entry for `mtime`; extract
      the session ID per the documented format; wrap all I/O in try/catch
      returning `null` on any error (replaces the stub from T003; T011 tests
      MUST now pass)
- [ ] T014 [US3] In `src/cli/main.ts`, import `getLatestSessionId` from
      `./session.ts`
- [ ] T015 [US3] In `src/cli/main.ts` `main()`, after
      `exitCode = await launchClaudeCode(...)` and before `Deno.exit(exitCode)`,
      insert resume hint logic:
  ```typescript
  if (exitCode === 0) {
    const sessionId = await getLatestSessionId();
    if (sessionId) {
      console.log(`Run \`claudio --resume ${sessionId}\` to resume.`);
    } else {
      console.log("Run `claudio` to resume.");
    }
  }
  ```
- [ ] T016 [US3] Run `deno task test` and confirm T011 and T012 pass; confirm no
      existing tests regress

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Run full test suite one final time (`deno task test`) and confirm
      all tests green
- [ ] T019 Smoke test on a real TTY: run `claudio`, authenticate if needed,
      observe clear screen, start a session, exit with `/exit`, verify branded
      resume hint with session ID appears

---

## Dependencies

```
T001 → T002 → T003 → T011 → T013 → T014 → T015 → T016
T001 → [T004, T005] → T006 → T007
T001 → T008 → T009 → T010
T002 → T017
[T007, T010, T016] → T018 → T019
```

All three user story phases (3, 4, 5) are **independent of each other** — US1
and US2 can begin in parallel once T001 completes.

## Parallel Execution

**After T001 (baseline passes):**

| Track A (US1 — auth.ts)     | Track B (US2 — main.ts)  | Track C (US3 — session.ts + main.ts) |
| --------------------------- | ------------------------ | ------------------------------------ |
| T004, T005 (parallel tests) | T008 (piped output test) | T002 (research ~/.claude/ format)    |
| T006 (change constant)      | T009 (clear screen impl) | T003 (create session.ts)             |
| T007 (verify)               | T010 (verify)            | T011 (unit tests)                    |
|                             |                          | T013 (implement getLatestSessionId)  |
|                             |                          | T014, T015 (wire into main.ts)       |
|                             |                          | T016 (verify)                        |

**US1 and US2 are fully parallelizable.** US3 requires T002/T003 first but is
otherwise independent.

## Implementation Strategy

**MVP** = Phase 3 (US1) alone — token expiry change ships value immediately with
minimal risk.

**Recommended delivery order**: US1 → US2 → US3 (by priority and complexity).

**Total tasks**: 19\
**Tasks per story**: US1: 4, US2: 3, US3: 7\
**Parallel opportunities**: T004+T005, T008, T011+T012, T017+T018\
**New files**: `src/cli/session.ts`, `tests/contract/session_test.ts`,
`tests/auth/auth_test.ts`\
**Modified files**: `src/cli/auth.ts`, `src/cli/main.ts`,
`tests/contract/cli_test.ts`
