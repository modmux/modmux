# Contract: Per-Agent Configuration Schemas

**Feature**: `008-coco-migration` | **Phase**: 1

For each supported agent, Coco writes a config file pointing the agent's API
endpoint at Coco's local proxy (`http://127.0.0.1:{port}`). Coco backs up the
original file before writing and restores it on `unconfigure`.

---

## Claude Code

**Config path**: `~/.claude/settings.json`  
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

## Cline

**Config path**: `~/.cline/endpoints.json`  
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

## Kilo Code

**Config path**: `.kilocode/config.json` (project root)  
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

## OpenCode

**Config path**: `~/.coco/env/opencode.env` (env file fragment)  
**Key**: `OPENAI_API_BASE`

```bash
# Written by coco configure opencode
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

## Goose

**Config path**: `~/.goose/config.toml`  
**Key**: `[openai].base_url`

```toml
# Written by coco configure goose
[openai]
base_url = "http://127.0.0.1:11434"
api_key = "coco"
```

**Merge strategy**: If `~/.goose/config.toml` exists, Coco parses the TOML,
updates the `[openai]` table, and rewrites the file. Other TOML sections are
preserved. Backup written to `~/.goose/config.toml.coco-backup`.

---

## Aider

**Config path**: `~/.aider.conf.yml`  
**Key**: `openai-api-base`

```yaml
# Written by coco configure aider
openai-api-base: http://127.0.0.1:11434
openai-api-key: coco
```

**Merge strategy**: If `~/.aider.conf.yml` exists, Coco reads and updates only
`openai-api-base` and `openai-api-key` keys. Other YAML keys are preserved.
Backup written to `~/.aider.conf.yml.coco-backup`.

---

## GPT-Engineer

**Config path**: `~/.coco/env/gpt-engineer.env`  
**Key**: `OPENAI_API_BASE`

```bash
# Written by coco configure gpt-engineer
OPENAI_API_BASE=http://127.0.0.1:11434
OPENAI_API_KEY=coco
```

Same activation note pattern as OpenCode.

---

## Backup & Restore Rules

| Scenario | Coco action on `configure` | Coco action on `unconfigure` |
|---|---|---|
| Config file does not exist | Create file; `backupPath = null` | Delete the file |
| Config file exists | Copy to `<path>.coco-backup`; write | Restore backup; delete backup |
| Config file exists but is already Coco's | Skip backup; overwrite | Remove Coco keys; if file empty, delete |

---

## Validation Test Call

After writing any config file, Coco performs a validation test:

```
POST http://127.0.0.1:{port}/v1/chat/completions
Content-Type: application/json
Authorization: Bearer coco

{ "model": "gpt-4o", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1 }
```

Expected: HTTP 200. If the call fails, Coco records `validatedAt = null` and
marks the agent as `misconfigured` in the TUI.
