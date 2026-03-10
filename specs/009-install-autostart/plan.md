# Implementation Plan: Global Install & Daemon Autostart

**Branch**: `009-install-autostart` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)

## Summary

Add two related developer experience improvements to Coco: (1) a single-command global install using Deno's native install mechanism plus a `.mise.toml` convenience task, and (2) `coco install-service` / `coco uninstall-service` commands that register/deregister the Coco daemon with the native OS login service manager (LaunchAgent on macOS, systemd user unit on Linux), making the daemon survive reboots without manual `coco start` after login.

## Technical Context

**Language/Version**: Deno 2.7.x, TypeScript strict mode  
**Primary Dependencies**: `@cliffy/ansi` (existing), `@std/fmt` (existing) — no new deps  
**Storage**: Plist at `~/Library/LaunchAgents/com.coco.plist` (macOS), unit file at `~/.config/systemd/user/coco.service` (Linux)  
**Testing**: `deno test --allow-all` (existing)  
**Target Platform**: macOS (primary), Linux with systemd (secondary), Windows (install only; service = coming soon)  
**Project Type**: CLI tool  
**Performance Goals**: `install-service` completes in under 3 seconds  
**Constraints**: No sudo required; no new runtime dependencies  
**Scale/Scope**: 2 new CLI commands, 1 new source module, 2 new config files (deno.json task + .mise.toml)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| No new runtime dependencies | V, VII | ✅ PASS | No new JSR/npm deps; `findBinary` already in codebase |
| No sudo required | V | ✅ PASS | LaunchAgent (user-level) + systemd --user both require no root |
| CLI MUST NOT contain business logic | IV | ✅ PASS | Logic in `src/service/autostart.ts`; CLI only dispatches |
| Quality gates pass | IX | ✅ PASS | Enforced in tasks |
| Contract tests required | VIII | ✅ PASS | CLI contract tests for new commands |
| Calm UX output | II | ✅ PASS | All output follows existing calm tone |
| ⚠️ Principle V tension | V | ⚠️ JUSTIFIED | Principle V says "no OS service manager required" — this feature adds OPTIONAL service registration on top of the existing daemon model. The self-spawn `--daemon` pattern remains unchanged; `install-service` is an optional convenience, not a requirement for running Coco. |

## Project Structure

### Documentation (this feature)

```text
specs/009-install-autostart/
├── plan.md              ← this file
├── research.md          ← Phase 0 complete
├── contracts/
│   └── cli-commands.md  ← new commands contract
├── quickstart.md        ← updated quickstart
└── tasks.md             ← Phase 2 (speckit.tasks)
```

### Source Code Changes

```text
# New file
src/service/autostart.ts      — installService(), uninstallService(), isServiceInstalled()
                                 macOS: plist write + launchctl bootstrap
                                 Linux: systemd unit write + systemctl --user enable --now
                                 Windows/other: "coming soon" message

# Modified files
src/cli/main.ts               — add cmdInstallService(), cmdUninstallService(), help entries
deno.json                     — add "install" task
.mise.toml                     — modified: add [tasks.install] section (existing hidden file at repo root)
README.md                     — update quickstart section

# Test files
tests/unit/autostart_test.ts  — unit tests for plist/unit generation, platform detection
tests/contract/cli-install-service_test.ts  — contract tests for CLI command behaviour
```

**Structure Decision**: Single project layout, consistent with existing codebase. New module `autostart.ts` follows the existing pattern of `daemon.ts` in `src/service/`.

## Phase 0: Research

✅ Complete — see [research.md](./research.md)

Key findings:
- `deno install --global --allow-all -n coco --force src/cli/main.ts` is the correct Deno 2.x command
- `.mise.toml` task format is `[tasks.install]` with `run = "..."` — no plugin required
- macOS: `launchctl bootstrap gui/$(id -u)` is the modern (non-deprecated) load command
- Linux: `systemctl --user enable --now coco.service` enables + starts atomically
- `findBinary("coco")` from `src/lib/process.ts` already handles cross-platform path resolution
- Unsupported platforms detected via `Deno.build.os` + `which systemctl`

## Phase 1: Design & Contracts

### Data Model

No persistent entities. Service state is represented by:
- Presence/absence of the plist or unit file on disk
- Return code of `launchctl list | grep com.coco` (macOS)
- Return code of `systemctl --user is-active coco.service` (Linux)

### Module Design: `src/service/autostart.ts`

```typescript
export interface ServiceInstallResult {
  installed: boolean;   // true = newly installed; false = already was installed
  binaryPath: string;   // absolute path used in service file
  configPath: string;   // path to plist/unit file written
}

export interface ServiceUninstallResult {
  removed: boolean;     // true = removed; false = was not installed
}

export async function installService(): Promise<ServiceInstallResult>
export async function uninstallService(): Promise<ServiceUninstallResult>
export async function isServiceInstalled(): Promise<boolean>
```

Platform dispatch inside each function via `Deno.build.os`.  
Unsupported platforms throw a typed `UnsupportedPlatformError` caught by the CLI handler.

### New CLI Commands

```
coco install-service     Register daemon with OS login service manager (macOS/Linux)
coco uninstall-service   Deregister daemon from OS login service manager
```

Both are idempotent (FR-009, FR-010) and appear in `coco --help`.

### Testability Strategy

- `autostart.ts` accepts optional `options.home` and `options.dryRun` for testability
- `dryRun: true` returns the would-be config file content without writing to disk or running `launchctl`/`systemctl`
- Unit tests use `dryRun` to verify plist/unit content without touching the OS
- Contract tests stub Deno.Command to verify correct CLI args are passed

## Complexity Tracking

No constitution violations requiring justification beyond the Principle V note in the Constitution Check above.
