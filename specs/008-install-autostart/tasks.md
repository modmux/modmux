---
description: "Task list for Global Install & Daemon Autostart"
---

# Tasks: Global Install & Daemon Autostart

**Input**: `/specs/008-install-autostart/`
**Branch**: `008-install-autostart`
**User Stories**: 3 (P1 global install, P2 daemon autostart, P3 README quickstart)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete task dependencies)
- **[Story]**: Which user story this belongs to (US1 = global install, US2 = daemon autostart, US3 = README)
- Exact file paths included in each task description

---

## Phase 1: Setup

**Purpose**: Verify structure and confirm no blockers before implementation

No new project setup is required — this is an existing Deno/TypeScript project. All dependencies are already present.

- [x] T001 Confirm existing `src/service/daemon.ts`, `src/lib/process.ts`, `src/cli/main.ts`, `.mise.toml`, and `deno.json` are present and unmodified

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Establish the `autostart.ts` module interface — US2 implementation blocks on this

**⚠️ CRITICAL**: US2 CLI commands cannot be implemented until T002 is complete

- [x] T002 Create `src/service/autostart.ts` with exported types, function signatures, and `UnsupportedPlatformError` class — no implementation bodies yet; just the public interface as described in `plan.md` (`ServiceInstallResult`, `ServiceUninstallResult`, `installService()`, `uninstallService()`, `isServiceInstalled()` accepting `options?: { dryRun?: boolean; home?: string }`)

**Checkpoint**: Module interface defined — US1 and US2 can now proceed

---

## Phase 3: User Story 1 — One-Command Global Install (Priority: P1) 🎯 MVP

**Goal**: Developers can run a single command from the repo root to install `coco` globally in PATH

**Independent Test**: Clone repo → run `deno task install` → open new terminal → `coco --version` prints version string

- [x] T003 [P] [US1] Add `"install"` task to `deno.json` `tasks` section: `"deno install --global --allow-all -n coco --force src/cli/main.ts"` — if Deno is not installed the raw deno error is propagated as-is (no custom pre-check required)
- [x] T004 [P] [US1] Add `[tasks.install]` section to `.mise.toml` (existing hidden file at repo root — append below existing `[settings]` block): `description = "Install coco globally via deno"` + `run = "deno install --global --allow-all -n coco --force src/cli/main.ts"`

**Checkpoint**: `deno task install` and `mise run install` both produce a working global `coco` binary

---

## Phase 4: User Story 2 — Daemon Survives System Restarts (Priority: P2)

**Goal**: `coco install-service` registers the daemon with the OS service manager; after reboot, `coco status` shows running with zero manual steps

**Independent Test**: Run `coco install-service` → reboot → `coco status` shows running

**Prerequisites**: T002 (autostart module interface) must be complete

### Implementation for User Story 2

- [x] T005 [US2] Implement macOS LaunchAgent path in `src/service/autostart.ts`: generate plist XML with absolute `coco` binary path (from `findBinary`), write to `~/Library/LaunchAgents/com.coco.plist`, run `launchctl bootout gui/$(id -u)` (ignore error) then `launchctl bootstrap gui/$(id -u) <plist>` — supports `dryRun` (return plist string, skip write/launchctl)
- [x] T006 [US2] Implement Linux systemd path in `src/service/autostart.ts`: generate `.service` unit file with absolute binary path, write to `~/.config/systemd/user/coco.service`, run `systemctl --user daemon-reload && systemctl --user enable --now coco.service` — supports `dryRun`; detect non-systemd via `which systemctl` absence and throw `UnsupportedPlatformError`
- [x] T007 [US2] Implement Windows and unsupported-platform path in `src/service/autostart.ts`: detect via `Deno.build.os === "windows"` or missing `systemctl`; throw `UnsupportedPlatformError` with calm message `"Autostart service support for this platform is coming soon. Run 'coco start' manually after each login."`
- [x] T008 [US2] Implement `uninstallService()` in `src/service/autostart.ts`: macOS — `launchctl bootout gui/$(id -u)` then remove plist file; Linux — `systemctl --user disable --now coco.service` then remove unit file; idempotent (not-installed → `{ removed: false }`); supports `dryRun`
- [x] T009 [US2] Implement `isServiceInstalled()` in `src/service/autostart.ts`: macOS — check plist file existence; Linux — check unit file existence; other — return false
- [x] T010 [P] [US2] Add `cmdInstallService()` function and `"install-service"` route in `src/cli/main.ts`: calls `installService()`; catches `UnsupportedPlatformError` (print calm message, exit 0); catches other errors (print error, exit 1); prints success output per contracts/cli-commands.md
- [x] T011 [P] [US2] Add `cmdUninstallService()` function and `"uninstall-service"` route in `src/cli/main.ts`: calls `uninstallService()`; idempotent (not-installed → print "Coco service is not installed.", exit 0); catches errors (print, exit 1)
- [x] T012 [US2] Update `showHelp()` in `src/cli/main.ts` to include `install-service` and `uninstall-service` in the commands list with brief descriptions

### Tests for User Story 2

- [x] T013 [P] [US2] Write unit tests in `tests/unit/autostart_test.ts`: test plist XML content (dryRun, verify keys present), test systemd unit content (dryRun), test `UnsupportedPlatformError` thrown on mock unsupported OS, test `isServiceInstalled()` with temp files, test idempotency (install twice, uninstall when not installed)
- [x] T014 [P] [US2] Write contract tests in `tests/contract/cli-install-service_test.ts`: verify `coco install-service` appears in `--help` output, verify `coco uninstall-service` appears in `--help` output, verify unsupported platform exits 0 with calm message

**Checkpoint**: `coco install-service` and `coco uninstall-service` work correctly on macOS and Linux; unsupported platforms exit cleanly

---

## Phase 5: User Story 3 — README Quickstart (Priority: P3)

**Goal**: A developer can follow the README quickstart from a fresh clone to a running Coco instance in under 5 minutes

**Independent Test**: Follow README quickstart on a clean machine with Deno installed → `coco doctor` shows no errors

- [x] T015 [US3] Update `README.md` quickstart section: replace or supplement existing install instructions with the 3-step flow from `specs/008-install-autostart/quickstart.md` — Step 1: `deno task install` (and `mise run install` variant), Step 2: `coco start`, Step 3 (optional): `coco install-service`; keep existing `coco --help` and agent configuration content intact

**Checkpoint**: README quickstart is clear, accurate, and matches actual CLI behaviour

---

## Phase 6: Polish & Quality Gates

**Purpose**: Ensure all quality gates pass before merging

- [x] T016 Run `deno lint` — fix any lint errors introduced by new files
- [x] T017 Run `deno fmt --check` — run `deno fmt` if any formatting issues found
- [x] T018 Run `deno check src/**/*.ts tests/**/*.ts` — resolve any type errors
- [x] T019 Run `deno test --allow-all` — all tests must pass (including T013, T014 from Phase 4)

---

## Dependencies

```
T001 (verify structure)
  ├─ T003, T004 [parallel] (US1 — deno.json + .mise.toml) ← no T002 dependency
  └─ T002 (autostart module interface)
       ├─ T005 → T006 → T007 → T008 → T009 (US2 — autostart.ts implementation)
       │    └─ T010, T011 [parallel] (US2 — CLI commands)
       │         └─ T012 (US2 — help text)
       │              └─ T013, T014 [parallel] (US2 — tests)
       └─ T015 (US3 — README, independent)
T016 → T017 → T018 → T019 (polish — run after all above)
```

---

## Parallel Execution

**Maximum parallelism within US1** (after T001, no T002 dependency):
```
T003 (deno.json) ─┐
                   ├─ done
T004 (.mise.toml) ─┘
```

**Maximum parallelism within US2** (after T009):
```
T010 (cmdInstallService) ─┐
T011 (cmdUninstallService)─┤
                           ├─ T012 (showHelp update)
                           └─ T013, T014 [parallel tests]
```

**Cross-story parallelism**:
- US1 (T003, T004) can start immediately after T001 — no dependency on T002
- US1 (T003, T004) and US2 autostart.ts implementation (T005–T009) can proceed simultaneously after T001
- US3 (T015) is fully independent of US2 CLI work

---

## Implementation Strategy

**MVP** = Phase 3 (US1) only: one-command global install with `deno task install` and `mise run install`. Delivers immediate developer value with zero risk — no OS-level changes.

**Full release** = all phases: US1 + US2 + US3, with quality gates passing on macOS and Linux.

**Suggested order for a single developer**:
1. T001 → T002 (5 min)
2. T003 + T004 in parallel (5 min) ← US1 MVP done (can start concurrently with step 3)
3. T005 → T006 → T007 → T008 → T009 (macOS first, then Linux, then Windows stub)
4. T010 → T011 → T012 (CLI wiring)
5. T013 + T014 in parallel (tests)
6. T015 (README)
7. T016 → T017 → T018 → T019 (quality gates)

---

## Summary

| Phase | Story | Tasks | Files |
|-------|-------|-------|-------|
| 1 — Setup | — | T001 | (verify existing) |
| 2 — Foundational | — | T002 | `src/service/autostart.ts` |
| 3 — Global Install | US1 (P1) | T003–T004 | `deno.json`, `.mise.toml` |
| 4 — Daemon Autostart | US2 (P2) | T005–T014 | `src/service/autostart.ts`, `src/cli/main.ts`, `tests/` |
| 5 — README | US3 (P3) | T015 | `README.md` |
| 6 — Polish | — | T016–T019 | (quality gates) |
| **Total** | | **19 tasks** | 6 files |

**Parallel opportunities**: 5 identified (T003/T004, T010/T011, T013/T014, US1+US2 concurrent, US3 independent)
