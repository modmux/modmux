## Contracts

### agent-configs

**Feature**: `007-coco-migration` | **Phase**: 1

For each supported agent, Coco writes a config file pointing the agent's API
endpoint at Coco's local proxy (`http://127.0.0.1:{port}`). Coco backs up the
original file before writing and restores it on `unconfigure`.

---

### Claude Code

**Config path**: `~/.claude/settings.json`\
**Key**: `env.ANTHROPIC_BASE_URL`

```jsonc
// Written by coco configure claude-code
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:11434",
    "ANTHROPIC_AUTH_TOKEN": "coco"
  }
}
```

**Merge strategy**: If `~/.claude/settings.json` exists, Coco reads the existing
JSON and sets/overwrites only the `env.ANTHROPIC_BASE_URL` and
`env.ANTHROPIC_AUTH_TOKEN` keys. All other keys are preserved unchanged.

---

### Cline

**Config path**: `~/.cline/endpoints.json`\
**Key**: `apiBaseUrl`

```jsonc
// Written by coco configure cline
{
  "apiBaseUrl": "http://127.0.0.1:11434",
  "appBaseUrl": "http://127.0.0.1:11434",
  "mcpBaseUrl": "http://127.0.0.1:11434"
}
```

**Merge strategy**: Full file write. If a prior file exists, it is backed up to
`~/.cline/endpoints.json.coco-backup` before writing.

---

### Kilo Code

**Config path**: `.kilocode/config.json` (project root)\
**Key**: `apiBaseUrl`

```jsonc
// Written by coco configure kilo
{
  "apiBaseUrl": "http://127.0.0.1:11434",
  "apiKey": "coco"
}
```

**Merge strategy**: Coco writes to the **current working directory** at the time
`coco configure kilo` is run. The user must re-run `coco configure kilo` in each
project root. If the file exists, only `apiBaseUrl` and `apiKey` are updated.

---

### OpenCode

**Config path**: `~/.coco/env/opencode.env` (env file fragment)\
**Key**: `OPENAI_API_BASE`

```bash
## Written by coco configure opencode
OPENAI_API_BASE=http://127.0.0.1:11434
OPENAI_API_KEY=coco
```

**Activation note**: After writing, Coco prints:

```
opencode configured.
Add this to your shell profile to activate:
  source ~/.coco/env/opencode.env
Or run: eval $(coco configure opencode --print-env)
```

---

### Goose

**Config path**: `~/.goose/config.toml`\
**Key**: `[openai].base_url`

```toml
## Written by coco configure goose
[openai]
base_url = "http://127.0.0.1:11434"
api_key = "coco"
```

**Merge strategy**: If `~/.goose/config.toml` exists, Coco parses the TOML,
updates the `[openai]` table, and rewrites the file. Other TOML sections are
preserved. Backup written to `~/.goose/config.toml.coco-backup`.

---

### Aider

**Config path**: `~/.aider.conf.yml`\
**Key**: `openai-api-base`

```yaml
## Written by coco configure aider
openai-api-base: http://127.0.0.1:11434
openai-api-key: coco
```

**Merge strategy**: If `~/.aider.conf.yml` exists, Coco reads and updates only
`openai-api-base` and `openai-api-key` keys. Other YAML keys are preserved.
Backup written to `~/.aider.conf.yml.coco-backup`.

---

### GPT-Engineer

**Config path**: `~/.coco/env/gpt-engineer.env`\
**Key**: `OPENAI_API_BASE`

```bash
## Written by coco configure gpt-engineer
OPENAI_API_BASE=http://127.0.0.1:11434
OPENAI_API_KEY=coco
```

Same activation note pattern as OpenCode.

---

### Backup & Restore Rules

| Scenario                                 | Coco action on `configure`          | Coco action on `unconfigure`            |
| ---------------------------------------- | ----------------------------------- | --------------------------------------- |
| Config file does not exist               | Create file; `backupPath = null`    | Delete the file                         |
| Config file exists                       | Copy to `<path>.coco-backup`; write | Restore backup; delete backup           |
| Config file exists but is already Coco's | Skip backup; overwrite              | Remove Coco keys; if file empty, delete |

---

### Validation Test Call

After writing any config file, Coco performs a validation test:

```
POST http://127.0.0.1:{port}/v1/chat/completions
Content-Type: application/json
Authorization: Bearer coco

{ "model": "gpt-4o", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1 }
```

Expected: HTTP 200. If the call fails, Coco records `validatedAt = null` and
marks the agent as `misconfigured` in the TUI.

### cli-interface

**Feature**: `007-coco-migration` | **Phase**: 1

Coco's CLI is the primary human interface. The binary is named `coco`.

---

### Command Summary

| Command                    | Description                                     |
| -------------------------- | ----------------------------------------------- |
| `coco`                     | Open the TUI (on TTY) or print status (non-TTY) |
| `coco start`               | Start the background service                    |
| `coco stop`                | Stop the background service                     |
| `coco restart`             | Restart the background service                  |
| `coco status`              | Print service and auth status                   |
| `coco configure <agent>`   | Write config for a specific agent               |
| `coco unconfigure <agent>` | Revert config for a specific agent              |
| `coco doctor`              | Scan and report all agents' state               |
| `coco models`              | List available Copilot model IDs                |
| `coco --help`              | Show help                                       |
| `coco --version`           | Show version                                    |

---

### `coco` (bare invocation)

**On a TTY**: Opens the interactive TUI.

```
Coco — Local AI Gateway
──────────────────────────────────────────────
Status: Running on http://localhost:11434
Copilot: Authenticated ✓

Agents
──────────────────────────────────────────────
[x] Claude Code      detected
[ ] Cline            installed
[x] Kilo Code        installed
[ ] OpenCode         detected
[ ] Goose            detected
[-] Aider            installed  (misconfigured)
[ ] GPT-Engineer     installed
[ ] Continue.dev     not installed

──────────────────────────────────────────────
Space: toggle   Enter: apply   q: quit
```

**On non-TTY**: Prints `coco status` output and exits 0.

**Exit codes**: 0 on clean quit (`q`) or successful apply; 1 on apply error.

---

### `coco start`

Spawn the background service daemon.

**Output (success)**:

```
Coco is running on http://localhost:11434
```

**Output (already running)**:

```
Coco is already running on http://localhost:11434
```

**Exit codes**: 0 on success or already-running; 1 on failure.

---

### `coco stop`

Send SIGTERM to the daemon and wait for it to exit.

**Output**:

```
Coco stopped.
```

**Output (not running)**:

```
Coco is not running.
```

**Exit codes**: 0 always.

---

### `coco restart`

Stop then start. Preserves port.

**Output**:

```
Coco stopped.
Coco is running on http://localhost:11434
```

**Exit codes**: 0 on success; 1 if start fails.

---

### `coco status`

```
Status:  Running on http://localhost:11434
Copilot: Authenticated ✓
```

Or when not running:

```
Status:  Not running
Copilot: Authenticated ✓
```

**Exit codes**: 0 if running; 1 if not running.

---

### `coco configure <agent>`

Agent names match the `name` field of `AgentRecord` (kebab-case): `claude-code`,
`cline`, `kilo`, `opencode`, `goose`, `aider`, `gpt-engineer`

**Output (success)**:

```
claude-code configured.
```

**Output (already configured)**:

```
claude-code is already configured.
```

**Output (not installed/detected)**:

```
claude-code is not installed or detected on this system.
```

**Output (validation warning)**:

```
claude-code configured, but validation failed: <reason>
```

**Exit codes**: 0 on success or already-configured; 1 on error; 2 on validation
failure (configured but invalid).

---

### `coco unconfigure <agent>`

**Output (success)**:

```
claude-code unconfigured.
```

**Output (not configured)**:

```
claude-code is not configured.
```

**Exit codes**: 0 always.

---

### `coco doctor`

Scans and reports all agents. Two columns: state + configured status.

```
Coco Doctor
──────────────────────────────────────────────
claude-code     installed    configured ✓
cline           installed    not configured
kilo            installed    configured ✓
opencode        detected     not configured
goose           detected     not configured
aider           installed    misconfigured ⚠
gpt-engineer    installed    not configured
──────────────────────────────────────────────
Log: ~/.coco/coco.log
Last 5 errors: (none)
```

**Exit codes**: 0 always.

---

### `coco models`

```
Available models (via GitHub Copilot):

  gpt-4o
  gpt-4o-mini
  o1
  o1-mini
  claude-3.5-sonnet
  claude-3.5-haiku
  gemini-2.0-flash

Run 'coco configure <agent>' to route an agent through Coco.
```

**Exit codes**: 0 on success; 1 if not authenticated (after prompting).

---

### Global Flags

| Flag              | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `--help`, `-h`    | Show help and exit 0                                         |
| `--version`, `-v` | Print `Coco v{VERSION}` and exit 0                           |
| `--daemon`        | Internal flag: run as background daemon (not for direct use) |

---

### Authentication

If the stored Copilot token is missing or expired, any command that requires
authentication triggers the OAuth device flow before proceeding. Output:

```
Visit https://github.com/login/device and enter: ABCD-1234
Waiting for authorization...
Authenticated ✓
```

---

### Error Format

All fatal errors print to **stderr** with a calm, single-line message:

```
Error: <message>
```

No stack traces. No internal paths. Exit code 1.

### openai-proxy

**Feature**: `007-coco-migration` | **Phase**: 1

Coco exposes two OpenAI-compatible endpoints alongside the existing Anthropic
endpoints. All endpoints are served on `http://127.0.0.1:{port}` (default
11434).

---

### POST /v1/chat/completions

#### Request

```
POST /v1/chat/completions HTTP/1.1
Content-Type: application/json
Authorization: Bearer <any-non-empty-string>
```

```jsonc
{
  "model": "gpt-4o", // required; looked up in modelMap before forwarding
  "messages": [ // required
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }, // optional history
    { "role": "user", "content": "How are you?" }
  ],
  "stream": false, // optional, default false
  "temperature": 1.0, // optional, 0.0–2.0
  "max_tokens": 4096 // optional
}
```

#### Non-Streaming Response (200 OK)

```jsonc
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion",
  "created": 1699564865,
  "model": "gpt-4o", // echo back the Copilot model ID used
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  },
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "I'm doing well!" },
    "finish_reason": "stop" // "stop" | "length" | "content_filter"
  }]
}
```

#### Streaming Response (200 OK, `stream: true`)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"I'm"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" doing well!"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

#### Error Responses

| HTTP | Condition                                      | Body                                                                                          |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 400  | Invalid/missing required field                 | `{"error":{"message":"...","type":"invalid_request_error","code":"invalid_value"}}`           |
| 401  | Missing or empty Authorization header          | `{"error":{"message":"Unauthorized","type":"authentication_error","code":"invalid_api_key"}}` |
| 429  | Copilot rate limit exhausted (after 3 retries) | `{"error":{"message":"Rate limit exceeded","type":"requests","code":"rate_limit_exceeded"}}`  |
| 503  | Copilot API unavailable                        | `{"error":{"message":"Service unavailable","type":"api_error","code":"service_unavailable"}}` |
| 504  | Copilot API timeout                            | `{"error":{"message":"Request timed out","type":"api_error","code":"request_timeout"}}`       |

---

### GET /v1/models

Returns the list of available Copilot model IDs in OpenAI format.

#### Response (200 OK)

```jsonc
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1699564865,
      "owned_by": "github-copilot"
    },
    {
      "id": "claude-3.5-sonnet",
      "object": "model",
      "created": 1699564865,
      "owned_by": "github-copilot"
    }
    // ... all models returned by the Copilot models API
  ]
}
```

---

### GET /health

#### Response (200 OK)

```json
{ "status": "ok" }
```

No authentication required.

---

### Model Name Translation

Before forwarding any request to Copilot, Coco resolves the model name:

```
effective_model = modelMap[requested_model] ?? requested_model
```

The `modelMap` is the merge of `DEFAULT_MODEL_MAP` (bundled in
`src/agents/models.ts`) and `CocoConfig.modelMap` (user overrides from
`~/.coco/config.json`). User entries win.

---

### Copilot → OpenAI Translation Notes

| Copilot concept                | OpenAI wire format                               |
| ------------------------------ | ------------------------------------------------ |
| Completion text chunk          | `choices[0].delta.content`                       |
| Stop reason `"stop"`           | `finish_reason: "stop"`                          |
| Stop reason `"length"`         | `finish_reason: "length"`                        |
| Prompt/completion token counts | `usage.prompt_tokens`, `usage.completion_tokens` |
| Copilot model ID               | echoed as `model` in response                    |
| Request ID                     | prefixed as `"chatcmpl-"` + UUID                 |
