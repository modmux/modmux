# Tasks: Coco — Universal Local AI Gateway

**Input**: Design documents from `specs/008-coco-migration/`  
**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ ✓ quickstart.md ✓

**Tests**: Contract tests included per Constitution Principle VIII (NON-NEGOTIABLE: every user story MUST have corresponding tests).

**Organization**: Tasks grouped by user story for independent implementation and delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths are included in all descriptions

---

## Pre-Flight Gate (REQUIRED — blocks all implementation)

> ⛔ **Constitution violation blocker.** The current Claudio Constitution v1.3.0 explicitly
> prohibits background daemons in Principle V, Technical Standards, and Non-Responsibilities.
> This migration intentionally violates all three locations. The constitution MUST be amended
> to Coco Constitution v1.0.0 before any code is written.

- [ ] T000 Run `speckit.constitution` to produce Coco Constitution v1.0.0: remove "No background daemons or persistent processes" from Principle V and Technical Standards; remove "Running as a background daemon" from Non-Responsibilities; update Principle I scope from "bridges Claude Code" → "universal local AI gateway"; add Configuration Management principle (reversible writes, validation test call); update Success Criteria for multi-agent support

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Rename binary, scaffold new module directories, seed shared utilities, remove replaced files.

- [ ] T001 Update `deno.json`: rename binary output from `claudio` → `coco` in compile task; update task names referencing `claudio`
- [ ] T002 [P] Create `src/lib/log.ts`: structured JSON logger (`log(level, msg, meta?)`) appending newline-delimited entries to `~/.coco/coco.log`; respects `logLevel` from config; no-op when log file unwritable
- [ ] T003 [P] Create `src/lib/process.ts`: generalise existing `findClaudeBinary()` into `findBinary(name: string): Promise<string | null>` with PATH + npm/pip fallback paths; add `isProcessAlive(pid: number): Promise<boolean>` using `kill -0` (Unix) or PowerShell `Get-Process` (Windows)
- [ ] T004 [P] Create `src/config/store.ts`: `loadConfig(): Promise<CocoConfig>` (read `~/.coco/config.json`, create with defaults if absent) and `saveConfig(config: CocoConfig): Promise<void>` (schema-validate then write); export `DEFAULT_CONFIG`
- [ ] T005 Delete `src/cli/launch.ts` and `src/cli/session.ts`; remove all imports of these files from `src/cli/main.ts`; also delete `tests/contract/launch_test.ts` and `tests/contract/session_test.ts` (these files import the deleted sources directly and would cause compile failures; their coverage is superseded by T012's `cli_test.ts`)
- [ ] T006 Bump version string in `src/version.ts` to `0.2.0` (first Coco release candidate)

**Checkpoint**: Shared utilities available; old Claudio-specific files removed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data types and registries that EVERY user story depends on. No user story can begin until this phase is complete.

**⚠️ CRITICAL**: All user story phases are blocked until this phase is done.

- [ ] T007 [P] Create `src/agents/registry.ts`: define `AgentRecord` interface and export `AGENT_REGISTRY: AgentRecord[]` with all 7 agents — `claude-code`, `cline`, `kilo`, `opencode`, `goose`, `aider`, `gpt-engineer` — each with `name`, `displayName`, `binaryNames[]`, `extensionIds[]`
- [ ] T008 [P] Create `src/agents/models.ts`: export `DEFAULT_MODEL_MAP: Record<string, string>` mapping common OpenAI and Anthropic model aliases to their Copilot model IDs; export `resolveModel(requested: string, overrides: Record<string,string>): string` applying user overrides over defaults
- [ ] T009 [P] Add OpenAI types to `src/server/types.ts`: `OpenAIRequest`, `OpenAIResponse`, `OpenAIStreamChunk`, `OpenAIDelta`, `OpenAIErrorResponse`, `OpenAIModel`, `OpenAIModelList` — matching contracts/openai-proxy.md schemas exactly
- [ ] T010 Create `tests/unit/config-store_test.ts`: assert `loadConfig()` returns `DEFAULT_CONFIG` on first run; assert round-trip write/read preserves all fields; assert invalid `logLevel` is rejected
- [ ] T011 [P] Create `tests/unit/model-map_test.ts`: assert known alias `"gpt-4o"` resolves to Copilot ID; assert unknown name passes through unchanged; assert user override in `modelMap` wins over default

**Checkpoint**: Registry, model map, OpenAI types, and config store ready — user story implementation can begin

---

## Phase 3: User Story 1 — Background Service (Priority: P1) 🎯 MVP

**Goal**: `coco start` daemonises the proxy; `coco stop/restart/status` manage it reliably.

**Independent Test**: Run `coco start`, close the terminal, open a new one, run `coco status` — service reports running. Run `coco stop` — PID file gone, service reports not running.

- [ ] T012 [P] [US1] Create `tests/contract/cli_test.ts`: assert `coco start` prints `Coco is running on http://localhost:11434`; assert `coco stop` prints `Coco stopped.`; assert `coco status` exits 0 when running and 1 when not running (write FAILING — implement after T017)
- [ ] T013 [P] [US1] Create `tests/integration/daemon_test.ts`: spawn `coco start` → assert `~/.coco/coco.pid` written → assert process alive via `isProcessAlive()` → spawn `coco stop` → assert PID file removed → assert process dead; also test port-conflict scenario: pre-occupy port 11434 with a dummy listener → assert `coco start` selects a different port → assert that port is persisted in `CocoConfig.port` (write FAILING — implement after T016)
- [ ] T014 [US1] Create `src/service/daemon.ts`: `startDaemon()` — check stale PID, attempt to bind port (default 11434; if occupied, scan upward for the next available port and persist selection to `CocoConfig.port` via `saveConfig()`), spawn `coco --daemon` with `detached: true, stdin/stdout/stderr: "null"`, write PID file, exit parent; `stopDaemon()` — read PID, send SIGTERM, poll until dead, remove PID file; `restartDaemon()` — stop then start; `isDaemonRunning(): Promise<boolean>` — PID file + liveness check
- [ ] T015 [US1] Create `src/service/status.ts`: `getServiceState(): Promise<ServiceState>` — reads PID file, checks liveness, reads port from `CocoConfig`, calls `/health` to confirm running, checks stored token validity for `authStatus`
- [ ] T016 [US1] Update `src/server/server.ts`: when `--daemon` arg is present, emit a structured startup log entry via `src/lib/log.ts`, register `SIGTERM` and `SIGHUP` signal handlers for graceful shutdown, bind exclusively to `127.0.0.1` on the port stored in `CocoConfig.port` (PID file writing is done by `src/service/daemon.ts` before this process starts)
- [ ] T017 [US1] Update `src/cli/main.ts`: replace `launch.ts` / `session.ts` imports with `service/daemon.ts` and `service/status.ts`; add `start`, `stop`, `restart`, `status` sub-command handlers; output strings must match `contracts/cli-interface.md` exactly
- [ ] T018 [US1] Run failing tests from T012 and T013 to confirm they now pass; verify `coco start` exits 0 with correct output; verify stale-PID recovery (kill daemon, leave PID file, run `coco start` again); manually time `coco start` and `coco stop` on local machine — both MUST complete in under 1 second (SC-002)

**Checkpoint**: Background service fully functional and independently testable

---

## Phase 4: User Story 3 — OpenAI-Compatible Endpoint (Priority: P1)

**Goal**: `POST /v1/chat/completions`, `GET /v1/models`, `GET /health` all return correct wire-format responses.

**Independent Test**: Run `curl -s http://localhost:11434/v1/chat/completions -d '{"model":"gpt-4o","messages":[{"role":"user","content":"ping"}]}'` — receive a valid OpenAI completion JSON response.

- [ ] T019 [P] [US3] Create `tests/contract/health_test.ts`: assert `GET /health` returns `{"status":"ok"}` with HTTP 200 and no auth required (write FAILING — implement after T023)
- [ ] T020 [P] [US3] Create `tests/contract/openai-proxy_test.ts`: assert non-streaming `/v1/chat/completions` returns `object: "chat.completion"` schema; assert streaming returns `text/event-stream` with `data: [DONE]` terminator; assert `/v1/models` returns `object: "list"` with at least one model (write FAILING — implement after T023)
- [ ] T021 [P] [US3] Create `tests/unit/openai-transform_test.ts`: assert `translateOpenAIRequest()` maps `messages`, resolves model alias, preserves `stream` flag; assert `translateCopilotToOpenAI()` produces correct `id`, `object`, `choices[0].message` fields; assert streaming delta wrapping produces valid SSE chunk format
- [ ] T022 [US3] Create `src/server/openai.ts`: `translateOpenAIRequest(req: OpenAIRequest, modelMap): CopilotRequest`; `translateCopilotToOpenAI(res: CopilotResponse, model: string): OpenAIResponse`; `translateCopilotStreamToOpenAIDelta(chunk): string` (returns `data: {...}\n\n` SSE line); `buildOpenAIError(status, message): OpenAIErrorResponse`
- [ ] T023 [US3] Update `src/server/router.ts`: add `POST /v1/chat/completions` route (non-streaming + streaming via `src/server/openai.ts`); add `GET /v1/models` route (fetch from Copilot API, return OpenAI model list format); add `GET /health` route returning `{"status":"ok"}`
- [ ] T024 [US3] Update `src/server/copilot.ts`: before forwarding, call `resolveModel()` from `src/agents/models.ts` to apply alias map; add 429 retry with exponential backoff — delays 100ms, 200ms, 400ms (max 3 attempts); on exhaustion propagate 429 in caller's error envelope format
- [ ] T025 [US3] Run failing tests from T019, T020, T021 to confirm they now pass; run quickstart.md curl commands against live daemon and verify responses; also verify existing Anthropic proxy tests (`tests/contract/proxy_test.ts`, `tests/contract/server_test.ts`) still pass after router changes (SC-006 regression guard); measure round-trip overhead — MUST be under 150ms excluding Copilot API latency (SC-004)

**Checkpoint**: Both Anthropic and OpenAI proxy endpoints fully functional

---

## Phase 5: User Story 5 — Agent Detection (Priority: P2)

**Goal**: `coco doctor` accurately classifies all 7 agents as `installed`, `detected`, or `not-installed`.

**Independent Test**: Run `coco doctor` — each of the 7 agents shows a state row with name, state, and configured status. At least one agent on the current machine is correctly classified as `installed` or `detected`.

- [ ] T026 [P] [US5] Create `tests/unit/detector_test.ts`: mock PATH to contain a known binary → assert `installed`; mock VS Code extension dir with extension folder → assert `detected`; mock nothing → assert `not-installed`; assert state resolution rule (installed wins over detected)
- [ ] T027 [P] [US5] Create `src/agents/detector.ts`: `detectAll(): Promise<DetectionResult[]>` iterates `AGENT_REGISTRY` and calls `detectOne()`; `detectOne(agent)` runs three strategies in order — (1) `findBinary()` from `src/lib/process.ts` for each `binaryName`, (2) scan VS Code/Cursor/VSCode-Insiders extension dirs (`~/.vscode/extensions/`, `~/.cursor/extensions/`, `~/.vscode-insiders/extensions/`) for each `extensionId`, (3) scan JetBrains plugin dirs per research.md R-005 (`~/Library/Application Support/JetBrains/` on macOS, `~/.local/share/JetBrains/` on Linux, `%APPDATA%\JetBrains\` on Windows), (4) check known config file paths; resolves state as `installed > detected > not-installed`
- [ ] T028 [US5] Update `src/cli/main.ts`: add `doctor` sub-command handler; call `detectAll()`, read `CocoConfig.agents` for configured status, read last 5 `error`-level lines from `~/.coco/coco.log`; format output per `contracts/cli-interface.md` doctor section
- [ ] T029 [US5] Run failing tests from T026; run `coco doctor` on current machine and verify at least `claude` binary is correctly detected as `installed`

**Checkpoint**: Agent detection engine functional; `coco doctor` output matches contract

---

## Phase 6: User Story 4 — Per-Agent Configuration (Priority: P2)

**Goal**: `coco configure <agent>` writes the correct config file; `coco unconfigure <agent>` perfectly reverses it.

**Independent Test**: Run `coco configure aider` — `~/.aider.conf.yml` gains `openai-api-base: http://127.0.0.1:11434`. Run `coco unconfigure aider` — file is restored to its pre-Coco state (or removed if it didn't exist).

- [ ] T030 [P] [US4] Create `tests/integration/agent-config_test.ts`: for at least one agent (e.g. `aider`), call `configureAgent()` → assert config file written with correct key/value → call `validateConfig()` against running daemon → call `unconfigureAgent()` → assert file restored/removed; assert `backupPath` logic for pre-existing files
- [ ] T031 [US4] Create `src/agents/config.ts`: `configureAgent(agent, port, cocoConfig): Promise<ConfigEntry>` — backs up existing config, writes agent-specific format per `contracts/agent-configs.md`, calls `validateConfig()`, persists `ConfigEntry` to `CocoConfig` via `saveConfig()`; `unconfigureAgent(agentName, cocoConfig): Promise<void>` — restores backup or deletes; `validateConfig(port): Promise<boolean>` — POST to `/v1/chat/completions` with 1-token probe
- [ ] T032 [US4] Implement per-agent config writers inside `src/agents/config.ts`: `writeClaudeCode()` (JSON merge), `writeCline()` (full JSON write), `writeKilo()` (project-relative JSON merge), `writeOpenCode()` (env file), `writeGoose()` (TOML merge), `writeAider()` (YAML merge), `writeGptEngineer()` (env file)
- [ ] T033 [US4] Update `src/cli/main.ts`: add `configure <agent>` and `unconfigure <agent>` sub-command handlers; output strings per `contracts/cli-interface.md`; handle unknown agent names with clear error message
- [ ] T034 [US4] Run failing tests from T030; run `coco configure claude-code` and `coco unconfigure claude-code` on a machine with Claude Code installed; verify config file delta

**Checkpoint**: Per-agent configuration fully functional and reversible

---

## Phase 7: User Story 2 — TUI (Priority: P1 — depends on US1, US3, US4, US5)

**Goal**: Bare `coco` invocation on a TTY opens the TUI; Space toggles, Enter applies, `q` exits without changes.

**Independent Test**: Run `coco` in a terminal. See all 7 agents listed with correct states. Toggle two agents with Space, press Enter — their config files are written. Press `q` on a second run — no files change.

- [ ] T035 [P] [US2] Create `src/tui/input.ts`: `enableRawMode(): Promise<string>` (save terminal settings via `stty -g`); `disableRawMode(saved: string): Promise<void>`; `readKey(): Promise<Key>` reading up to 3 bytes — returns typed enum `{ Space, Enter, Quit, Up, Down, CtrlC, Other }`
- [ ] T036 [P] [US2] Create `src/tui/render.ts`: `renderFull(state: TUIState): void` — draws header (status, Copilot auth), section divider, all 7 agent rows, instructions footer; `renderDirty(state: TUIState, dirtyRows: number[]): void` — redraws only changed rows using cursor-up arithmetic; `renderRow(row: AgentRow, cursor: number, index: number)` — `[x]`/`[ ]`/`[-]` prefix, bold for cursor, dim for `not-installed`, yellow for `misconfigured`; hides cursor during render
- [ ] T037 [US2] Update `src/cli/main.ts`: when invoked on TTY with no sub-command, build `TUIState` from `getServiceState()` + `detectAll()` + `loadConfig()`; enter the Space/Enter/q event loop calling `renderDirty()` on each change; on Enter call `configureAgent()` / `unconfigureAgent()` for each changed row; restore terminal on exit
- [ ] T038 [US2] Add TTY guard: when `coco` is invoked on a non-TTY (`!Deno.stdout.isTerminal()`), print `getServiceState()` output matching `contracts/cli-interface.md` `coco status` format and exit 0
- [ ] T039 [US2] Manual validation: run `coco` in terminal, verify layout matches `contracts/cli-interface.md` TUI example; verify `q` makes no file changes; verify Enter correctly writes/reverts config files for toggled agents; use `time coco` to measure TUI first-render — MUST appear within 200ms (SC-003)

**Checkpoint**: Full TUI functional including service status display and batch agent configuration

---

## Phase 8: User Story 6 — Coco Models List (Priority: P3)

**Goal**: `coco models` prints available Copilot model IDs in calm, minimal output.

**Independent Test**: Run `coco models` (authenticated) — output lists at least one model ID, one per line or in a minimal table.

- [ ] T040 [US6] Update `src/cli/main.ts`: add `models` sub-command handler; if not authenticated, run OAuth device flow first; call Copilot models API; print one model ID per line preceded by two spaces; append `\nRun 'coco configure <agent>' to route an agent through Coco.` footer per `contracts/cli-interface.md`

**Checkpoint**: All 6 user stories independently functional

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Distribution artifacts, documentation, final quality gate.

- [ ] T041 [P] Update `npm/` package: rename package from `claudio` → `coco`; update `bin` field; update description to reflect universal gateway purpose
- [ ] T042 [P] Update `README.md`: reflect new `coco` command name, TUI ASCII layout, sub-commands table, quickstart instructions, new architecture diagram
- [ ] T043 [P] Update `AGENTS.md`: rename claudio→coco throughout, reflect new project structure (`src/service/`, `src/agents/`, `src/tui/`, `src/config/`), update development commands to `deno task` equivalents, update module responsibilities; delete `CLAUDE.md` (stale stub with incorrect commands — `AGENTS.md` is the industry standard picked up by all major AI coding agents)
- [ ] T044 Run full quality gate: `deno lint && deno fmt --check && deno check src/**/*.ts tests/**/*.ts && deno test --allow-all`; fix any failures
- [ ] T045 Run quickstart.md validation end-to-end: start daemon, run all curl commands, run `coco doctor`, open TUI, configure one agent, unconfigure it, stop daemon; confirm all outputs match contracts

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ◄── BLOCKS all user story phases
    │
    ├──► Phase 3 (US1 Background Service)
    │        │
    │        ├──► Phase 4 (US3 OpenAI Endpoint) ─────────────────────┐
    │        │                                                        │
    │        ├──► Phase 5 (US5 Agent Detection) ─────────────────────┤
    │        │              │                                         │
    │        │              └──► Phase 6 (US4 Per-Agent Config) ──────┤
    │        │                            │                           │
    │        └────────────────────────────┴───────────────────────────►
    │                                                    Phase 7 (US2 TUI)
    │
    └──► Phase 8 (US6 Models List) — independent of US2-US5
         │
         ▼
    Final Phase (Polish)
```

### User Story Implementation Dependencies

| Story | Phase | Depends On | Independent? |
|---|---|---|---|
| US1 Background Service | 3 | Foundational only | ✅ Yes |
| US3 OpenAI Endpoint | 4 | Foundational only | ✅ Yes |
| US5 Agent Detection | 5 | US1 (for doctor command) | ✅ Mostly |
| US4 Per-Agent Config | 6 | US3 (validation test call) | ⚠️ Needs US3 proxy up |
| US2 TUI | 7 | US1 + US3 + US4 + US5 | ⚠️ Integrates all |
| US6 Models List | 8 | US1 (auth flow) | ✅ Yes |

### Within Each Phase

1. Contract tests / unit tests (marked `[P]`) — write FAILING first
2. Data types and utilities
3. Core implementation modules
4. CLI integration
5. Validation run

---

## Parallel Opportunities per Story

```
Phase 1:  T002 ║ T003 ║ T004  (parallel — different new files)
Phase 2:  T007 ║ T008 ║ T009 ║ T011  (parallel — different new files)
Phase 3:  T012 ║ T013  (parallel — test files, no impl deps)
Phase 4:  T019 ║ T020 ║ T021  (parallel — different test files)
Phase 5:  T026 ║ T027  (parallel — test + impl can start together)
Phase 6:  T030 alone (needs T027 + T022 to be done)
Phase 7:  T035 ║ T036  (parallel — input.ts and render.ts are independent)
Polish:   T041 ║ T042 ║ T043  (parallel — different doc files)
```

---

## Implementation Strategy

### MVP (User Story 1 Only — Background Service)

1. Complete Phase 1: Setup (T001–T006)
2. Complete Phase 2: Foundational (T007–T011)
3. Complete Phase 3: US1 Background Service (T012–T018)
4. **STOP and VALIDATE**: `coco start/stop/restart/status` working with PID daemon
5. Ship as `coco v0.2.0-alpha` — users can run the Anthropic proxy as a persistent service

### Incremental Delivery

| Milestone | Stories | Value delivered |
|---|---|---|
| v0.2.0-alpha | US1 | Background daemon; persistent proxy |
| v0.2.0-beta | +US3 | OpenAI agents (Aider, GPT-Engineer) can connect |
| v0.2.0-rc1 | +US5 +US4 | Auto-detection + auto-config for all 7 agents |
| v0.2.0 | +US2 | TUI control surface; polished multi-agent experience |
| v0.2.1 | +US6 | `coco models` inspection command |

### Parallel Team Strategy

After Phase 2 (Foundational) completes:

- **Developer A** → Phase 3 (US1 Background Service) → Phase 8 (US6 Models)
- **Developer B** → Phase 4 (US3 OpenAI Endpoint)
- **Developer C** → Phase 5 (US5 Agent Detection) → Phase 6 (US4 Config)
- **All together** → Phase 7 (US2 TUI, integrates A + B + C work)

---

## Summary

| Metric | Count |
|---|---|
| Total tasks | 45 |
| Setup tasks | 6 (T001–T006) |
| Foundational tasks | 5 (T007–T011) |
| US1 tasks | 7 (T012–T018) |
| US3 tasks | 7 (T019–T025) |
| US5 tasks | 4 (T026–T029) |
| US4 tasks | 5 (T030–T034) |
| US2 tasks | 5 (T035–T039) |
| US6 tasks | 1 (T040) |
| Polish tasks | 5 (T041–T045) |
| Parallelizable [P] | 18 tasks |
| Contract/unit tests | 9 test files across 4 stories |
