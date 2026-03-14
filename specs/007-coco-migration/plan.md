# Implementation Plan: Coco — Universal Local AI Gateway

**Branch**: `007-coco-migration` | **Date**: 2026-03-10 | **Spec**: `specs/007-coco-migration/spec.md`  
**Input**: Migrate the Claudio codebase into Coco — a universal AI gateway with background service, multi-API proxy, configuration manager, agent-detection engine, and minimal TUI.

## Summary

Coco evolves Claudio's narrow "launch Claude Code" purpose into a universal local AI
gateway. The proxy (Anthropic-compatible `/v1/messages`) is preserved unchanged. New
work adds an OpenAI-compatible `/v1/chat/completions` endpoint, a background daemon
(self-respawn pattern via `Deno.Command` with `detached: true`), an agent-detection
engine (PATH + VS Code extension + config-file scanning), a per-agent configuration
manager (reversible file writes with backups), and a minimal ANSI TUI (raw keyboard
input, dirty-row rendering, no npm dependencies).

The binary is renamed from `claudio` to `coco`. Two source files are deleted
(`src/cli/launch.ts`, `src/cli/session.ts`). All other existing modules are preserved
or lightly extended.

## Technical Context

**Language/Version**: Deno (latest stable) + TypeScript (strict mode)  
**Primary Dependencies**: Deno std library only — `@std/fmt/colors` (ANSI helpers), `@std/toml` (Goose config merge), `@std/yaml` (Aider config merge); no third-party runtime deps  
**Storage**: `~/.coco/config.json` (CocoConfig), `~/.coco/coco.pid` (daemon PID), `~/.coco/coco.log` (structured log)  
**Testing**: `deno test --allow-all`  
**Target Platform**: macOS (arm64, x64), Linux (x64, arm64), Windows (x64) — single compiled binary  
**Project Type**: CLI + background service + TUI  
**Performance Goals**: <150ms OpenAI proxy overhead; <200ms TUI first render; <1s `coco start`/`coco stop`  
**Constraints**: Bind exclusively to `127.0.0.1`; single binary; no Copilot SDK/CLI deps; `~/.coco/` config dir  
**Scale/Scope**: Local developer tool; bounded concurrency (handful of simultaneous agent connections)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ⚠️ VIOLATIONS — JUSTIFIED AS CONSTITUTIONAL AMENDMENT

The current Claudio Constitution (v1.3.0) explicitly conflicts with Coco's design in
the following places. All violations are **justified** because this spec IS the
constitutional amendment. `speckit.constitution` MUST be run before implementation
to update the constitution to Coco v1.0.0.

| Principle | Violation | Justification |
|---|---|---|
| I — Minimalism | "Does one thing: bridges Claude Code to Copilot models" | Coco's broader purpose is the migration goal; minimalism is preserved within each module |
| IV — Separation of Concerns | "Must NOT continue running after Claude Code begins execution" | Coco runs as a persistent daemon; separation now applies between daemon and TUI |
| V — Portability | "No background daemons or persistent processes" | Background daemon is Coco's core value; portability preserved via self-respawn single binary |
| Non-Responsibilities | "Running as a background daemon" | Explicitly reversed by this migration |
| Technical Standards | "No background daemons or persistent processes" | Same as Principle V |

### ✅ PASSING — Unchanged Principles

| Principle | Status |
|---|---|
| II — Calm UX | ✅ Pass — calm output preserved across all new modules |
| III — Predictability | ✅ Pass — all transforms remain deterministic and spec-driven |
| VI — Transparency | ✅ Pass — all transformations documented in contracts/ |
| VII — Self-Containment | ✅ Pass — no SDK/CLI deps; pure HTTP to Copilot |
| VIII — Contract Testing | ✅ Pass — contract tests required for all new endpoints and CLI commands |
| IX — Quality Gates | ✅ Pass — same `deno lint && deno fmt --check && deno check && deno test` gates |

**⛔ BLOCKED**: Implementation MUST NOT begin until `speckit.constitution` is run to
produce Coco Constitution v1.0.0.

## Project Structure

### Documentation (this feature)

```text
specs/007-coco-migration/
├── plan.md              ← this file
├── research.md          ← Phase 0 complete
├── data-model.md        ← Phase 1 complete
├── quickstart.md        ← Phase 1 complete
├── contracts/
│   ├── openai-proxy.md  ← Phase 1 complete
│   ├── cli-interface.md ← Phase 1 complete
│   └── agent-configs.md ← Phase 1 complete
└── tasks.md             ← Phase 2 (speckit.tasks — not yet created)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── main.ts          # MODIFIED — add sub-commands; default → TUI
│   └── auth.ts          # PRESERVED
├── server/
│   ├── router.ts        # MODIFIED — add /v1/chat/completions, /v1/models, /health
│   ├── server.ts        # MODIFIED — add --daemon mode, structured logging
│   ├── transform.ts     # PRESERVED — Anthropic ↔ Copilot
│   ├── openai.ts        # NEW — OpenAI ↔ Copilot translation
│   ├── copilot.ts       # PRESERVED
│   ├── mod.ts           # PRESERVED
│   └── types.ts         # MODIFIED — add OpenAI request/response types
├── service/
│   ├── daemon.ts        # NEW — spawn/stop/restart; PID management
│   └── status.ts        # NEW — ServiceState resolution
├── agents/
│   ├── registry.ts      # NEW — canonical AgentRecord list (7 agents)
│   ├── detector.ts      # NEW — PATH + extension + config-file detection
│   ├── config.ts        # NEW — per-agent config writer/reverter + validation
│   └── models.ts        # NEW — DEFAULT_MODEL_MAP + runtime merge
├── config/
│   └── store.ts         # NEW — read/write ~/.coco/config.json
├── tui/
│   ├── render.ts        # NEW — ANSI rendering, dirty-row redraws
│   └── input.ts         # NEW — raw keyboard input, keypress parsing
├── auth/ copilot/ lib/  # PRESERVED (lib gains log.ts + process.ts)
└── version.ts           # MODIFIED — version bump

# DELETED
src/cli/launch.ts        # replaced by service/ + agents/config.ts
src/cli/session.ts       # replaced by TUI exit message

tests/
├── contract/            # openai-proxy_test.ts, health_test.ts, cli_test.ts (NEW)
├── integration/         # daemon_test.ts, agent-config_test.ts (NEW)
└── unit/                # detector, config-store, openai-transform, model-map (NEW)
```

**Structure Decision**: Single-project layout. All new modules added as sibling
directories under `src/`. Mirrors existing Claudio structure exactly.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Background daemon | Core feature — agents need a persistent local endpoint | Foreground blocks terminal; agents cannot connect independently |
| TUI (raw ANSI) | Calm multi-agent control surface | CLI-only lacks discoverability; no npm deps allowed |
| Per-agent config writers | Each agent has a different config format | Single env-var approach requires manual shell profile edits |
| Model alias map | Agents send different model names than Copilot uses | Pass-through silently fails for common aliases like `gpt-4o` |
