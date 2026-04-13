# Modmux

Local gateway that routes requests between coding agents and GitHub Copilot.
OpenAI and Anthropic compatible endpoints, reversible configuration, zero
external dependencies.

Website: https://modmux.dev/

## What it does

- Exposes one local endpoint for supported coding agents
- Supports Anthropic-compatible and OpenAI-compatible APIs
- Supports Claude Code, Cline, and Codex
- Keeps configuration reversible with `modmux unconfigure`
- Exposes status, health, usage, and model discovery endpoints

## Install

<details>
<summary>📖 Recommended: from source</summary>

```bash
git clone https://github.com/modmux/modmux.git && cd modmux
deno task install
```

If the install location is not already in your `PATH`, add it first.

</details>

<details>
<summary>📖 Direct binary</summary>

Download a platform build from
[GitHub Releases](https://github.com/modmux/modmux/releases).

</details>

## Quick start

```bash
# Start the local proxy and complete GitHub auth on first run
modmux start

# Point an agent at Modmux
modmux configure claude-code

# Check service state, auth, and configured agents
modmux status
modmux doctor
```

Modmux binds to localhost and starts at port `11435`. If that port is already in
use, it scans upward for an available port. Use `modmux status` to confirm the
active endpoint.

## Core commands

| Command                      | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `modmux`                     | Open the TUI on a TTY, or print status on a non-TTY |
| `modmux start`               | Start the background proxy service                  |
| `modmux stop`                | Stop the background proxy service                   |
| `modmux status`              | Show service and auth state                         |
| `modmux doctor`              | Scan supported agents and show recent errors        |
| `modmux configure <agent>`   | Configure a supported agent                         |
| `modmux unconfigure <agent>` | Restore a supported agent's previous config         |
| `modmux models`              | List available Copilot-backed models                |
| `modmux --help`              | Show the full command list                          |

## Local endpoints

```text
POST /v1/messages
POST /v1/messages/count_tokens
POST /v1/chat/completions
POST /v1/responses
GET  /v1/models
GET  /v1/usage
GET  /health
```

## Docs

- [Getting started](./docs/getting-started.md) — shortest path from install to
  first request
- [Troubleshooting](./docs/troubleshooting.md) — common fixes and diagnostic
  commands
- [API reference](./docs/api/README.md) — endpoint reference
- [Documentation style](./docs/documentation-style.md) — writing rules for this
  docs set
- [Contributing](./CONTRIBUTING.md) — contributor workflow and codebase
  conventions

## Development

Run the full quality gate before you commit:

```bash
deno task quality
```

Common development commands:

```bash
deno task dev
deno task compile
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project structure, commands, and
code style.

## License

MIT License.
