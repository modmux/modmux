# Research: Coco — Universal Local AI Gateway

**Branch**: `007-coco-migration` | **Phase**: 0

---

## R-001: Deno Process Daemonisation

**Decision**: Re-spawn the compiled `coco` binary as a detached child process using
`Deno.Command` with `detached: true`, `stdin/stdout/stderr: "null"`, then exit the parent.

**Rationale**: Deno has no native `fork()`. The self-respawn pattern (`coco start` spawns
`coco --daemon`) is fully cross-platform, requires no OS-level service tooling, and
produces a single compiled binary. The child writes `~/.coco/coco.pid` with `Deno.pid`,
then the parent calls `Deno.exit(0)` without awaiting `child.status`.

**Implementation pattern**:
```typescript
const child = new Deno.Command(Deno.execPath(), {
  args: ["--daemon"],
  stdin: "null", stdout: "null", stderr: "null",
  detached: true,
  cwd: Deno.env.get("HOME") ?? "/tmp",  // stable working directory
}).spawn();
await Deno.mkdir(cocoDir, { recursive: true });
await Deno.writeTextFile(pidFile, `${child.pid}\n`, { mode: 0o644 });
Deno.exit(0);  // parent exits immediately; child runs independently
```

**PID liveness check**:
- Unix: `kill -0 <pid>` via `Deno.Command("kill", { args: ["-0", pid] })`
- Windows: `Get-Process -Id <pid>` via PowerShell

**Platform notes**:
- macOS/Linux: Full Unix daemon semantics via `posix_spawn` with `POSIX_SPAWN_SETPGROUP`
- Windows: `CREATE_NEW_PROCESS_GROUP`; child survives parent exit; SIGTERM is emulated
- Signal handling: `Deno.addSignalListener("SIGTERM", ...)` for graceful shutdown;
  also handle `SIGHUP` on Unix to survive terminal close

**Alternatives considered**:
- OS-level service (launchd/systemd/NSSM): Rejected — requires platform-specific setup,
  breaks single-binary distribution model
- Long-running foreground process: Rejected — blocks the terminal, poor DX
- Separate `coco-server` binary: Rejected — increases distribution complexity

---

## R-002: Terminal UI Rendering in Deno (No npm)

**Decision**: Pure ANSI/VT100 rendering using `Deno.stdout.write()` with escape sequences.
Use `Deno.stdin.setRaw(true)` for single-keypress input. Use `@std/fmt/colors` from the
Deno standard library for color helpers if available; otherwise inline escape codes.

**Rationale**: Deno has no native Ink equivalent. The TUI is a simple, bounded list
(~10 agents) with no complex layout — raw ANSI is sufficient, keeps zero npm dependencies,
and is consistent with the existing codebase's `console.log` ANSI patterns.

**Key ANSI sequences**:
```
\x1b[?25l        Hide cursor
\x1b[?25h        Show cursor
\x1b[2J\x1b[H   Clear screen + cursor to top-left
\x1b[{n}A        Move cursor up n lines
\x1b[2K\r        Clear current line, return to start
\x1b[1m          Bold
\x1b[2m          Dim (grey — for not-installed agents)
\x1b[0m          Reset all attributes
\x1b[32m         Green (authenticated / selected)
\x1b[33m         Yellow (misconfigured warning)
\x1b[34m         Blue (accent)
```

**Raw keyboard input**:
```typescript
Deno.stdin.setRaw(true);
const buf = new Uint8Array(8);
const n = await Deno.stdin.read(buf);
// Space = 0x20, Enter = 0x0D or 0x0A, q = 0x71
// Arrow up = [0x1B, 0x5B, 0x41], Arrow down = [0x1B, 0x5B, 0x42]
// Ctrl+C = 0x03
```

**Render loop**: Full redraw on each keypress. For ~10 rows the performance is trivial.
Cursor is hidden during render, shown on exit. TTY guard: only enter raw mode when
`Deno.stdout.isTerminal()` is true.

**Alternatives considered**:
- npm/Ink: Rejected — requires npm, contradicts Self-Containment principle
- Blessed.js port: Rejected — too large, no Deno-native port

---

## R-003: OpenAI Chat Completions API Format

**Decision**: Implement full OpenAI v1 chat completions wire format as documented.

**Non-streaming request** (POST `/v1/chat/completions`):
```jsonc
{
  "model": "gpt-4o",                         // required
  "messages": [                              // required
    { "role": "system", "content": "..." },
    { "role": "user",   "content": "..." }
  ],
  "stream": false,                           // optional, default false
  "temperature": 1.0,                        // optional 0.0–2.0
  "max_tokens": 4096                         // optional
}
```

**Non-streaming response**:
```jsonc
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699564865,
  "model": "gpt-4o",
  "usage": { "prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30 },
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Hello!" },
    "finish_reason": "stop"
  }]
}
```

**Streaming SSE chunks** (`Content-Type: text/event-stream`):
```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**`/v1/models` response**:
```jsonc
{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "created": 1677649963, "owned_by": "openai" }
  ]
}
```

**Error response** (mirrors OpenAI format):
```jsonc
{
  "error": { "message": "...", "type": "invalid_request_error", "code": "..." }
}
```

**Copilot → OpenAI translation notes**:
- Copilot uses a chat-completions-like format natively; the translation layer maps
  `messages` arrays, normalises `model` via the model alias map, and re-frames
  the response with the `chatcmpl-` prefix ID format.
- Streaming: Copilot streams JSON chunks; Coco wraps them in `data: {...}\n\n` SSE framing.

---

## R-004: Agent Config File Locations

**Decision**: Use a per-agent config writer that targets the canonical config path for
each agent. Where agents use environment variables (Aider, GPT-Engineer), Coco writes
a shell-sourceable `.env` fragment to `~/.coco/env/<agent>.env` and prints activation
instructions.

| Agent | Config Path | Key | Format |
|---|---|---|---|
| Claude Code | `~/.claude/settings.json` | `env.ANTHROPIC_BASE_URL` | JSON |
| Cline | `~/.cline/endpoints.json` | `apiBaseUrl` | JSON |
| Kilo Code | `.kilocode/config.json` (project) | `apiBaseUrl` | JSON |
| OpenCode | env var `OPENAI_API_BASE` | — | env |
| Goose | `~/.goose/config.toml` | `[openai].base_url` | TOML |
| Aider | `~/.aider.conf.yml` | `openai-api-base` | YAML |
| GPT-Engineer | `~/.coco/env/gpt-engineer.env` | `OPENAI_API_BASE` | env file |

**Backup strategy**: Before writing, Coco copies the existing file to `<path>.coco-backup`.
On `unconfigure`, the backup is restored; if no backup exists the file is removed.

**Alternatives considered**:
- Patching VS Code `settings.json` directly: Rejected — too invasive, risk of corrupting
  user settings with unrelated edits. Per-extension config files are cleaner and safer.

---

## R-005: VS Code Extension & Binary Detection

**Decision**: Multi-strategy detection in priority order: (1) PATH binary, (2) VS Code
extension directories across known editors, (3) JetBrains plugin directories.

**VS Code extension paths**:
| OS | Path |
|---|---|
| macOS/Linux | `~/.vscode/extensions/`, `~/.cursor/extensions/`, `~/.vscode-insiders/extensions/` |
| Windows | `%APPDATA%\.vscode\extensions\` etc. |

**Extension IDs**:
| Agent | Extension ID |
|---|---|
| Cline | `saoudrizwan.claude-dev` |
| Goose | `0xgoose.goose` |
| Continue.dev | `Continue.continue` |
| Claude Code | `anthropic.claude-code` |
| Kilo Code | `kilo.kilo-code` |
| OpenCode | `opencode.opencode` |

**Binary names on PATH**:
| Agent | Binary |
|---|---|
| Claude Code | `claude` |
| Aider | `aider` |
| GPT-Engineer | `gpt-engineer` |
| Goose | `goose` |
| OpenCode | `opencode` |
| Kilo Code | `kilo` |
| Cline | `cline` |

**JetBrains plugin path (macOS)**: `~/Library/Application Support/JetBrains/{IDE}/plugins/`

**Detection implementation**: Extend the existing `findClaudeBinary()` pattern in
`src/cli/launch.ts` into a generalised `findBinary(name)` utility in `src/lib/process.ts`.

---

## R-006: Model Alias Map

**Decision**: Bundle a default alias map in `src/agents/models.ts`. At runtime, merge
with any user overrides from `~/.coco/config.json#modelMap`.

**Default map (seed)**:
```typescript
export const DEFAULT_MODEL_MAP: Record<string, string> = {
  // OpenAI aliases → Copilot model IDs
  "gpt-4o":                    "gpt-4o",
  "gpt-4o-mini":               "gpt-4o-mini",
  "gpt-4":                     "gpt-4",
  "gpt-3.5-turbo":             "gpt-3.5-turbo",
  "o1":                        "o1",
  "o1-mini":                   "o1-mini",
  // Anthropic aliases → Copilot model IDs
  "claude-opus-4-5":           "claude-opus-4-5",
  "claude-sonnet-4-5":         "claude-sonnet-4-5",
  "claude-3-5-sonnet-20241022":"claude-3.5-sonnet",
  "claude-3-5-haiku-20241022": "claude-3.5-haiku",
  // Gemini aliases
  "gemini-2.0-flash":          "gemini-2.0-flash",
};
```

**Lookup logic**: `modelMap[requestedModel] ?? requestedModel` — unknown names pass through.

---

## R-007: Constitution Amendment Required

**Finding**: The current Claudio Constitution (v1.3.0) explicitly forbids background
daemons in three places (Principle V, Technical Standards, Non-Responsibilities).
The Coco migration violates all three.

**Decision**: The `speckit.constitution` command MUST be run before implementation begins
to amend the constitution. The amended constitution ("Coco Constitution") must:
- Replace Principle I scope: "universal local AI gateway" instead of "bridges Claude Code"
- Remove "No background daemons" from Principle V and Technical Standards
- Remove "Running as a background daemon" from Non-Responsibilities
- Add Principle for Configuration Management (reversible, validated)
- Update Success Criteria to reflect multi-agent, not Claude Code-only

**Gate status**: ⚠️ BLOCKED — implementation MUST NOT begin until `speckit.constitution`
is run and the constitution is updated to Coco v1.0.0.

Principles that continue to apply unchanged: Self-Containment (VII), Transparency (VI),
Contract Testing (VIII), Quality Gates (IX), Calm UX (II), Predictability (III).
