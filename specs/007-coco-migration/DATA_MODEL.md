## Data Model

**Branch**: `007-coco-migration` | **Phase**: 1

---

### Entity Overview

```
CocoConfig
  ├── port: number
  ├── logLevel: LogLevel
  ├── modelMap: Record<string, string>
  ├── agents: ConfigEntry[]
  └── lastStarted: string | null

AgentRegistry
  └── agents: AgentRecord[]
        ├── name: string
        ├── displayName: string
        ├── binaryNames: string[]
        ├── extensionIds: string[]
        ├── configWriter: AgentConfigWriter
        └── state: AgentState          (runtime, not persisted)

DetectionResult
  ├── agent: AgentRecord
  ├── state: "installed" | "detected" | "not-installed"
  └── evidence: string[]               (paths / extension IDs found)

ConfigEntry
  ├── agentName: string
  ├── configPath: string
  ├── backupPath: string | null
  ├── endpoint: string
  ├── appliedAt: string
  └── validatedAt: string | null

ServiceState
  ├── running: boolean
  ├── pid: number | null
  ├── port: number | null
  └── authStatus: "authenticated" | "unauthenticated" | "unknown"

TUIState
  ├── service: ServiceState
  ├── agents: AgentRow[]
  └── cursor: number

AgentRow
  ├── detection: DetectionResult
  ├── configured: boolean
  ├── selected: boolean               (TUI toggle, ephemeral)
  └── misconfigured: boolean
```

---

### Entities

#### CocoConfig

Persisted to `~/.coco/config.json`. Loaded at startup; written on
configure/unconfigure.

```typescript
interface CocoConfig {
  /** TCP port the proxy listens on. Default: 11434. */
  port: number;
  /** Log level for ~/.coco/coco.log. Default: "info". */
  logLevel: "debug" | "info" | "warn" | "error";
  /**
   * Model alias map: requested model name → Copilot model ID.
   * Merged over DEFAULT_MODEL_MAP at runtime. User entries win.
   */
  modelMap: Record<string, string>;
  /** Per-agent configuration records. */
  agents: ConfigEntry[];
  /** ISO timestamp of last successful daemon start. */
  lastStarted: string | null;
}
```

**Defaults**:

```typescript
const DEFAULT_CONFIG: CocoConfig = {
  port: 11434,
  logLevel: "info",
  modelMap: {}, // merged with DEFAULT_MODEL_MAP at runtime
  agents: [],
  lastStarted: null,
};
```

**Validation rules**:

- `port`: 1024–65535
- `logLevel`: one of the four enum values
- `modelMap`: all keys and values must be non-empty strings
- `agents`: each entry must have non-empty `agentName`, `configPath`, `endpoint`

---

#### AgentRecord

In-memory only. Defined in `src/agents/registry.ts`.

```typescript
interface AgentRecord {
  /** Canonical identifier (kebab-case, matches CLI arg). e.g. "claude-code" */
  name: string;
  /** Human-readable name for TUI display. e.g. "Claude Code" */
  displayName: string;
  /** Binary names to look for on PATH. */
  binaryNames: string[];
  /** VS Code extension marketplace IDs. */
  extensionIds: string[];
  /** Resolved detection state — set by detector at runtime. */
  state: AgentState;
}

type AgentState = "installed" | "detected" | "not-installed";
```

**Registry entries** (canonical list, `src/agents/registry.ts`):

| `name`         | `displayName` | `binaryNames`      | `extensionIds`               |
| -------------- | ------------- | ------------------ | ---------------------------- |
| `claude-code`  | Claude Code   | `["claude"]`       | `["anthropic.claude-code"]`  |
| `cline`        | Cline         | `["cline"]`        | `["saoudrizwan.claude-dev"]` |
| `kilo`         | Kilo Code     | `["kilo"]`         | `["kilo.kilo-code"]`         |
| `opencode`     | OpenCode      | `["opencode"]`     | `["opencode.opencode"]`      |
| `goose`        | Goose         | `["goose"]`        | `["0xgoose.goose"]`          |
| `aider`        | Aider         | `["aider"]`        | `[]`                         |
| `gpt-engineer` | GPT-Engineer  | `["gpt-engineer"]` | `[]`                         |

---

#### DetectionResult

Output of the agent-detection engine for one agent.

```typescript
interface DetectionResult {
  agent: AgentRecord;
  /** Aggregate state across all detection strategies. */
  state: AgentState;
  /** Human-readable evidence (paths or extension IDs found). */
  evidence: string[];
}
```

**State resolution rule** (highest wins):

1. If any binary found on PATH → `"installed"`
2. Else if any extension or config file found → `"detected"`
3. Else → `"not-installed"`

---

#### ConfigEntry

One entry in `CocoConfig.agents`. Represents a successfully applied
configuration.

```typescript
interface ConfigEntry {
  /** Matches AgentRecord.name */
  agentName: string;
  /** Absolute path to the config file written. */
  configPath: string;
  /** Absolute path to the backup of the original file, or null if none existed. */
  backupPath: string | null;
  /** The proxy endpoint written into the config (e.g. "http://127.0.0.1:11434"). */
  endpoint: string;
  /** ISO timestamp when configuration was applied. */
  appliedAt: string;
  /** ISO timestamp of last successful validation test call, or null. */
  validatedAt: string | null;
}
```

---

#### ServiceState

Runtime-only. Computed by `src/service/status.ts` from the PID file and
`/health` endpoint.

```typescript
interface ServiceState {
  running: boolean;
  pid: number | null;
  port: number | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
}
```

**Resolution**:

1. Read `~/.coco/coco.pid` → `pid`
2. Check process liveness (`kill -0` / PowerShell)
3. If alive: GET `http://127.0.0.1:{port}/health` → `running = true`
4. Read `~/.coco/config.json` → `port`
5. Check stored token validity → `authStatus`

---

#### TUIState & AgentRow

Ephemeral in-memory state for the TUI render loop.

```typescript
interface TUIState {
  service: ServiceState;
  /** All 7 registered agents with detection and config state. */
  agents: AgentRow[];
  /** Index into agents[] of the currently highlighted row. */
  cursor: number;
}

interface AgentRow {
  detection: DetectionResult;
  /** True if a ConfigEntry exists for this agent in CocoConfig.agents. */
  configured: boolean;
  /**
   * TUI-only toggle: true = will be configured on Enter, false = will be
   * unconfigured. Initialised to match `configured`. Not persisted.
   */
  selected: boolean;
  /**
   * True if configured but last validation test call failed.
   * Shown as [-] with yellow tint in TUI.
   */
  misconfigured: boolean;
}
```

---

### State Machines

#### Agent Configuration State Machine

```
not-configured
    │  coco configure <agent>
    ▼
configuring ──► validation-failed (warning, stays configured)
    │
    ▼
configured
    │  coco unconfigure <agent>
    ▼
unconfiguring
    │
    ▼
not-configured
```

#### Service Lifecycle State Machine

```
stopped
  │  coco start (spawn --daemon child)
  ▼
starting ──► start-failed (port occupied / auth failure)
  │
  ▼
running ◄──────────────────────────────────────────────────────
  │  coco stop (SIGTERM to PID)          │  coco restart
  ▼                                      │
stopping                              stopping → starting → running
  │
  ▼
stopped
```

---

### File System Layout

```
~/.coco/
├── config.json      # CocoConfig (schema above)
├── coco.pid         # PID of running daemon (decimal, newline-terminated)
└── coco.log         # Daemon log file (newline-delimited JSON log entries)
```

**Log entry format** (`coco.log`):

```jsonc
{
  "ts": "2026-03-10T03:00:00.000Z",
  "level": "info",
  "msg": "Server started",
  "port": 11434
}
```
