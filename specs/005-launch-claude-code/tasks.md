# Tasks: Launch Claude Code Subprocess

**Branch**: `005-launch-claude-code`\
**Input**: `specs/005-launch-claude-code/spec.md`,
`specs/005-launch-claude-code/plan.md`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Exact file paths required in all descriptions

---

## Phase 1: Setup

**Purpose**: Prepare the new source file and update the server lifecycle
interface.

- [x] T001 Create `src/cli/launch.ts` with module scaffold (empty exports:
      `findClaudeBinary`, `launchClaudeCode`, `printInstallInstructions`)
- [x] T002 [P] Update `src/server/router.ts`: change `startServer()` to return
      `{ port: number; stop: () => Promise<void> }` instead of `Promise<void>`,
      using `Deno.serve()`'s returned `HttpServer` object for `.shutdown()`

---

## Phase 2: Foundational

**Purpose**: Core launcher functions that both US1 and US2 depend on.

**⚠️ CRITICAL**: Must complete before user story phases.

- [x] T003 Implement `findClaudeBinary(): Promise<string | null>` in
      `src/cli/launch.ts` — try `which claude` (macOS/Linux) / `where claude`
      (Windows) via `Deno.Command`, then fall back to known npm global paths
      (`~/.npm-global/bin/claude`, `~/.local/share/npm/bin/claude`); return
      absolute path or `null`
- [x] T004 Implement `printInstallInstructions(): void` in `src/cli/launch.ts` —
      prints calm, minimal message with
      `npm install -g @anthropic-ai/claude-code` and
      `https://claude.ai/download`
- [x] T005 Extract `CLAUDIO_FLAGS` constant in `src/cli/main.ts` — set of flags
      consumed by Claudio (`--help`, `--version`, `--server`) so forwarded args
      can be computed as `Deno.args.filter(a => !CLAUDIO_FLAGS.has(a))`

**Checkpoint**: Foundation ready — US1 and US2 can proceed independently.

---

## Phase 3: User Story 1 — Happy Path Launch (P1)

**Story Goal**: After the proxy starts, Claude Code launches with correct env
vars and inherited stdio; its exit code is propagated and the proxy stops
cleanly.

**Independent Test**: Run `claudio` with a mock `claude` binary that exits 0;
verify env vars are set, stdio is inherited, proxy stops, and Claudio exits 0.

- [x] T006 [US1] Implement
      `launchClaudeCode(binaryPath: string, port: number, forwardedArgs: string[]): Promise<number>`
      in `src/cli/launch.ts` — spawns `binaryPath` via `Deno.Command` with
      `inherit` stdio, sets `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` and
      `ANTHROPIC_API_KEY=claudio` merged into `Deno.env.toObject()`, awaits
      `status`, returns `status.code ?? 1`
- [x] T007 [US1] Update `main()` in `src/cli/main.ts` — replace `startServer()`
      call with `const { port, stop } = await startServer();`, then call
      `findClaudeBinary()` → `launchClaudeCode()` → `await stop()` →
      `Deno.exit(exitCode)`
- [x] T008 [P] [US1] Write contract tests in `tests/contract/launch_test.ts`:
      (a) `launchClaudeCode` with a real `deno run` no-op script exits 0, (b)
      env vars `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` are present in
      spawned process env, (c) exit code 1 from subprocess is returned as 1

---

## Phase 4: User Story 2 — Claude Code Not Installed (P2)

**Story Goal**: When `claude` is absent from PATH, Claudio prints calm install
instructions and exits 1.

**Independent Test**: Call `findClaudeBinary()` with a stubbed PATH that has no
`claude`; verify it returns `null`. Call `printInstallInstructions()` and verify
output contains both the npm command and the URL.

- [x] T009 [P] [US2] Write contract tests in `tests/contract/launch_test.ts`:
      (a) `findClaudeBinary()` returns `null` when `which`/`where` fails and
      fallback paths don't exist, (b) `printInstallInstructions()` output
      contains `npm install -g @anthropic-ai/claude-code` and
      `https://claude.ai/download`
- [x] T010 [US2] Add `null` branch in `main()` in `src/cli/main.ts` — after
      `findClaudeBinary()` returns `null`, call `printInstallInstructions()`,
      then `await stop()` (proxy is already running), then `Deno.exit(1)`

---

## Phase 5: User Story 3 — Proxy Shutdown on Claude Code Exit (P1)

**Story Goal**: Proxy stops cleanly whether Claude Code exits normally or via
signal.

**Independent Test**: Spawn a `claude` subprocess that exits non-zero; verify
`stop()` is called before `Deno.exit()` and exit code matches.

- [x] T011 [US3] Verify `stop()` is called in `main()` in `src/cli/main.ts` in
      both the success and error paths of `launchClaudeCode()` — wrap in
      `try/finally` to guarantee `stop()` runs even if `launchClaudeCode` throws
- [x] T012 [P] [US3] Add contract tests in `tests/contract/launch_test.ts`: (a)
      subprocess that exits with code 42 causes `launchClaudeCode()` to return
      42; (b) subprocess killed by signal (where `status.code` is `null`) causes
      `launchClaudeCode()` to return 1 via the `?? 1` fallback

---

## Phase 6: Polish

**Purpose**: Edge cases, quality gate, and help text update.

- [x] T013 [P] Handle spawn failure in `launchClaudeCode()` in
      `src/cli/launch.ts` — wrap `Deno.Command.spawn()` in try/catch; if OS
      error is permission-denied print `"claude: permission denied"` and return
      1; for all other OS errors print a brief error message and return 1 (do
      NOT rethrow — callers rely on a numeric return value for `Deno.exit()`)
- [x] T014 [P] Update `showHelp()` in `src/cli/main.ts` — add note that all args
      not consumed by Claudio (`--help`, `--version`, `--server`) are forwarded
      verbatim to `claude` (e.g., `claudio --dark-mode` passes `--dark-mode` to
      claude)
- [x] T015 Run `deno task quality` and fix any lint/format/type errors across
      `src/cli/launch.ts`, `src/cli/main.ts`, `src/server/router.ts`,
      `tests/contract/launch_test.ts`

---

## Dependencies

```
T001 → T003, T004, T005
T002 → T006, T007
T003 → T006, T007, T009
T004 → T010
T005 → T007
T006 → T008
T007 → T011
T003, T006 → T012
Phase 2 complete → Phase 3 and Phase 4 (independent, run in parallel)
Phase 3 and Phase 4 complete → Phase 5
Phase 5 complete → Phase 6
```

## Parallel Execution

**Phase 1**: T001 and T002 are independent — run in parallel.

**Phase 2**: T003, T004, T005 are independent — run in parallel.

**Phase 3 + Phase 4**: US1 (T006–T008) and US2 (T009–T010) are independent
stories — can begin in parallel once Phase 2 is done.

**Phase 6**: T013, T014 are independent — run in parallel.

## Implementation Strategy

**MVP** (Stories 1 + 3 — the core flow): Complete Phases 1–3 + Phase 5. This
gives a fully working `claudio` that launches Claude Code and shuts down
cleanly.

**Full delivery**: Add Phase 4 (not-installed message) and Phase 6 (polish).
