# Quickstart: Coco Development Guide

**Feature**: `008-coco-migration` | **Branch**: `008-coco-migration`

---

## Prerequisites

- Deno (latest stable) — `deno --version`
- GitHub account with Copilot access
- At least one supported coding agent installed (Claude Code, Aider, etc.)

---

## Quality Gates

Always run before committing:

```bash
deno lint && deno fmt --check && deno check src/**/*.ts && deno test --allow-all
```

Or via task:

```bash
deno task quality
```

---

## Run Coco in Development

```bash
# Start the background service
deno run --allow-all src/cli/main.ts start

# Check status
deno run --allow-all src/cli/main.ts status

# Open the TUI
deno run --allow-all src/cli/main.ts

# Configure an agent
deno run --allow-all src/cli/main.ts configure claude-code

# Scan agents
deno run --allow-all src/cli/main.ts doctor

# Stop the service
deno run --allow-all src/cli/main.ts stop
```

---

## Test the OpenAI Proxy Endpoint

```bash
# Start service first
deno run --allow-all src/cli/main.ts start

# Non-streaming request
curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer coco" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' | jq .

# Streaming request
curl -N http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer coco" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}],"stream":true}'

# List models
curl -s http://localhost:11434/v1/models -H "Authorization: Bearer coco" | jq .

# Health check
curl -s http://localhost:11434/health
```

---

## Project Structure

```
src/
├── cli/
│   ├── main.ts          # Entry point; routes sub-commands
│   └── auth.ts          # Authentication flow (preserved from Claudio)
├── server/
│   ├── router.ts        # HTTP request routing (Anthropic + OpenAI + health)
│   ├── server.ts        # HTTP server lifecycle (now with daemon mode)
│   ├── transform.ts     # Anthropic ↔ Copilot translation (preserved)
│   ├── openai.ts        # OpenAI ↔ Copilot translation (new)
│   ├── copilot.ts       # Copilot API forwarding (preserved)
│   └── types.ts         # Shared server types
├── service/
│   ├── daemon.ts        # Spawn/stop/restart daemon; PID file management
│   └── status.ts        # Read service state (PID liveness + /health check)
├── agents/
│   ├── registry.ts      # Canonical AgentRecord list
│   ├── detector.ts      # Multi-strategy agent detection
│   ├── config.ts        # Per-agent config writer / reverter
│   └── models.ts        # DEFAULT_MODEL_MAP + runtime merge
├── config/
│   └── store.ts         # Read/write ~/.coco/config.json with schema validation
├── tui/
│   ├── render.ts        # ANSI rendering; row drawing; cursor management
│   └── input.ts         # Raw keyboard input; keypress parsing
├── auth/
│   └── copilot.ts       # OAuth device flow (preserved from Claudio)
├── copilot/
│   └── ...              # Copilot API client (preserved from Claudio)
├── lib/
│   ├── errors.ts        # Error utilities (preserved)
│   ├── token.ts         # Token utilities (preserved)
│   ├── log.ts           # Structured logger → ~/.coco/coco.log (new)
│   └── process.ts       # Generalised findBinary() + kill-0 check (new)
└── version.ts           # Version string

tests/
├── contract/
│   ├── openai-proxy_test.ts       # /v1/chat/completions contract tests
│   ├── anthropic-proxy_test.ts    # /v1/messages contract tests (existing)
│   ├── health_test.ts             # /health contract test
│   └── cli_test.ts                # CLI command output contract tests
├── integration/
│   ├── daemon_test.ts             # start/stop/restart lifecycle
│   └── agent-config_test.ts      # configure/unconfigure round-trip
└── unit/
    ├── detector_test.ts           # Agent detection strategies
    ├── config-store_test.ts       # CocoConfig read/write/validate
    ├── openai-transform_test.ts   # OpenAI ↔ Copilot translation
    └── model-map_test.ts          # Model alias resolution
```

---

## New Module Responsibilities

### `src/service/daemon.ts`
- `startDaemon()` — spawn `coco --daemon`, write PID, exit parent
- `stopDaemon()` — read PID, send SIGTERM, wait for process to exit, remove PID
- `restartDaemon()` — stop + start
- `isDaemonRunning()` — read PID + liveness check

### `src/service/status.ts`
- `getServiceState(): Promise<ServiceState>` — combines PID check + /health + auth check

### `src/agents/registry.ts`
- `AGENT_REGISTRY: AgentRecord[]` — the 7 canonical agent records
- `getAgent(name: string): AgentRecord | undefined`

### `src/agents/detector.ts`
- `detectAll(): Promise<DetectionResult[]>` — runs all strategies for all agents
- `detectOne(agent: AgentRecord): Promise<DetectionResult>`

### `src/agents/config.ts`
- `configureAgent(agent: AgentRecord, port: number): Promise<ConfigEntry>`
- `unconfigureAgent(agentName: string, config: CocoConfig): Promise<void>`
- `validateConfig(port: number): Promise<boolean>` — test call

### `src/tui/render.ts`
- `renderFull(state: TUIState): void` — initial full draw
- `renderDirty(state: TUIState, changedRows: number[]): void` — partial redraw

### `src/tui/input.ts`
- `enableRawMode(): Promise<string>` — returns saved terminal settings
- `disableRawMode(saved: string): Promise<void>`
- `readKey(): Promise<Key>` — returns semantic key enum

### `src/config/store.ts`
- `loadConfig(): Promise<CocoConfig>` — read ~/.coco/config.json (create defaults if absent)
- `saveConfig(config: CocoConfig): Promise<void>` — write with schema validation

### `src/lib/log.ts`
- `log(level, msg, meta?)` — append JSON log line to ~/.coco/coco.log

### `src/lib/process.ts`
- `findBinary(name: string): Promise<string | null>` — generalises existing `findClaudeBinary()`
- `isProcessAlive(pid: number): Promise<boolean>` — kill -0 / PowerShell

---

## Files Removed

| File | Replacement |
|---|---|
| `src/cli/launch.ts` | `src/agents/config.ts` + `src/service/daemon.ts` |
| `src/cli/session.ts` | TUI exit message in `src/tui/render.ts` |

---

## Constitutional Amendment Required

Before implementing, run:

```bash
# Update constitution from Claudio v1.3.0 → Coco v1.0.0
```

Use `speckit.constitution` to amend:
- Remove "No background daemons" constraints
- Update scope from "Claude Code bridge" to "universal AI gateway"
- Add Configuration Management principle
- Update Success Criteria

---

## Key Conventions (unchanged from Claudio)

- **Calm output**: Short, emotionally neutral messages. No stack traces to users.
- **Explicit transforms**: All Anthropic/OpenAI ↔ Copilot translations are documented in contracts/.
- **No SDK dependencies**: All Copilot communication via direct HTTP.
- **Quality gates**: `deno lint && deno fmt --check && deno check && deno test` must pass.
- **Contract tests first**: Every user story gets a contract test before implementation.
