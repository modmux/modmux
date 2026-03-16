## Plan

### Summary

Coco evolves Claudio's narrow "launch Claude Code" purpose into a universal
local AI gateway. The proxy (Anthropic-compatible `/v1/messages`) is preserved
unchanged. New work adds an OpenAI-compatible `/v1/chat/completions` endpoint, a
background daemon (self-respawn pattern via `Deno.Command` with
`detached: true`), an agent-detection engine (PATH + VS Code extension +
config-file scanning), a per-agent configuration manager (reversible file writes
with backups), and a minimal ANSI TUI (raw keyboard input, dirty-row rendering,
no npm dependencies).

The binary is renamed from `claudio` to `coco`. Two source files are deleted
(`src/cli/launch.ts`, `src/cli/session.ts`). All other existing modules are
preserved or lightly extended.

### Project Structure

#### Documentation (this feature)

```text
specs/007-coco-migration/
├── plan.md              ← this file
├── research.md          ← Phase 0 complete
├── DATA_MODEL.md        ← Phase 1 complete
├── quickstart.md        ← Phase 1 complete
├── CONTRACTS.md         ← Phase 1 complete
└── tasks.md             ← Phase 2 (lean-spec tasks — not yet created)
```

#### Source Code (repository root)

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

## DELETED
src/cli/launch.ts        # replaced by service/ + agents/config.ts
src/cli/session.ts       # replaced by TUI exit message

tests/
├── contract/            # openai-proxy_test.ts, health_test.ts, cli_test.ts (NEW)
├── integration/         # daemon_test.ts, agent-config_test.ts (NEW)
└── unit/                # detector, config-store, openai-transform, model-map (NEW)
```

**Structure Decision**: Single-project layout. All new modules added as sibling
directories under `src/`. Mirrors existing Claudio structure exactly.

### Complexity Tracking

| Violation                | Why Needed                                             | Simpler Alternative Rejected Because                            |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| Background daemon        | Core feature — agents need a persistent local endpoint | Foreground blocks terminal; agents cannot connect independently |
| TUI (raw ANSI)           | Calm multi-agent control surface                       | CLI-only lacks discoverability; no npm deps allowed             |
| Per-agent config writers | Each agent has a different config format               | Single env-var approach requires manual shell profile edits     |
| Model alias map          | Agents send different model names than Copilot uses    | Pass-through silently fails for common aliases like `gpt-4o`    |
