# Ardo

**Use your GitHub Copilot subscription with the agents that don't support it yet.**

Cline, Codex, and Claude Code are great. But none of them let you use GitHub
Copilot as a model provider. Ardo fixes that — it runs a local proxy that speaks
Anthropic and OpenAI protocols, backed entirely by your existing Copilot
subscription. One login. No extra API keys.

Website: https://ardo-org.github.io/ardo/

Migration guide: [MIGRATION.md](MIGRATION.md)
Release notes: [CHANGELOG.md](CHANGELOG.md)

## Features

- 🔗 **Anthropic + OpenAI compatible** — `/v1/messages` and
  `/v1/chat/completions` endpoints
- 🚀 **Background service** — `ardo start` / `ardo stop` / `ardo restart`
- 🤖 **Multi-agent support** — Claude Code, Cline, and Codex
- 🖥️ **Minimal TUI** — bare `ardo` opens a radio-toggle interface for batch
  configuration
- 🔍 **Agent detection** — scans PATH and VS Code extension dirs to find
  installed agents
- ♻️ **Reversible config** — every `ardo configure` is undone by
  `ardo unconfigure`
- ⚡ **Stream support** — real-time streaming responses
- 📦 **Multiple install methods** — npm, Deno/JSR, or direct binary

## How It Works

```
Coding agent → ardo proxy (127.0.0.1:11434) → GitHub Copilot API
                │
                ├── POST /v1/messages           (Anthropic)
                ├── POST /v1/chat/completions   (OpenAI)
                ├── GET  /v1/models
                └── GET  /health
```

1. **`ardo start`** — authenticates with GitHub and starts the background proxy
2. **`ardo configure <agent>`** — writes the agent's config file to point at
   `http://127.0.0.1:11434`
3. The agent's API calls are translated and forwarded to GitHub Copilot

## Installation

<details>
<summary>📖 From Source (Development / Try It Out)</summary>


Clone the repository and install globally with a single command:

```bash
git clone https://github.com/ardo-org/ardo.git && cd ardo
```

**With Deno:**

```bash
deno task install
```

**With mise:**

```bash
mise run install
```

After installation, `ardo` is available in any terminal:

```bash
ardo --version
# Ardo v0.2.0
```

</details>

> **Note**: Ensure `~/.deno/bin` is in your `PATH`. The Deno installer adds this
> automatically.

<details>
<summary>📖 npm (No Deno Required)</summary>


**Node.js ≥18 required**

```bash
npm install -g ardo
```

The npm package automatically downloads the native binary for your platform:

| OS      | Architecture | Status |
| ------- | ------------ | ------ |
| macOS   | arm64        | ✅     |
| macOS   | x64          | ✅     |
| Linux   | x64          | ✅     |
| Linux   | arm64        | ✅     |
| Windows | x64          | ✅     |

</details>

<details>
<summary>📖 JSR (Deno Runtime)</summary>


```bash
deno install -A -g jsr:@ardo-org/ardo
```

</details>

<details>
<summary>📖 Direct Binary Download</summary>


Download platform-specific binaries from
[GitHub Releases](https://github.com/ardo-org/ardo/releases).

</details>

## Usage

<details>
<summary>📖 TUI (recommended for first-time setup)</summary>


```bash
ardo          # opens the interactive TUI
```

```
Ardo — Local AI Gateway
──────────────────────────────────────────────
Status: Running on http://localhost:11434
Copilot: Authenticated ✓

Agents
──────────────────────────────────────────────
[x] Claude Code      detected
[ ] Cline            installed
[ ] Codex            installed

──────────────────────────────────────────────
Space: toggle   Enter: apply   q: quit
```

Keys: **Space** toggles selection, **Enter** applies, **↑/↓** moves cursor,
**q** quits without changes.

</details>

<details>
<summary>📖 CLI Commands</summary>


| Command                        | Description                                                 |
| ------------------------------ | ----------------------------------------------------------- |
| `ardo`                         | Open the interactive TUI (on TTY) or print status (non-TTY) |
| `ardo start`                   | Start the background proxy service                          |
| `ardo stop`                    | Stop the background proxy service                           |
| `ardo restart`                 | Restart the background proxy service                        |
| `ardo status`                  | Print service and auth status                               |
| `ardo configure <agent>`       | Write config for a specific agent                           |
| `ardo unconfigure <agent>`     | Revert config for a specific agent                          |
| `ardo doctor`                  | Scan and report all agents' states                          |
| `ardo models`                  | List available Copilot model IDs                            |
| `ardo model-policy [compatible\|strict]` | Show or set model mapping policy               |
| `ardo install-service`         | Register daemon with OS login service manager               |
| `ardo uninstall-service`       | Remove daemon from OS login service manager                 |
| `ardo --help`                  | Show help                                                   |
| `ardo --version`               | Show version                                                |

</details>

<details>
<summary>🚀 Quick Start</summary>


```bash
# 1. Install ardo
deno task install

# 2. Start the proxy (authenticates with GitHub Copilot on first run)
ardo start

# 3. Configure an agent
ardo configure claude-code

# 4. Check what's running
ardo doctor

# 5. (Optional) Register as a login service
ardo install-service

# To remove the login service later:
# ardo uninstall-service
```

</details>

<details>
<summary>📖 Supported Agents</summary>


| Agent        | Binary         | Extension                |
| ------------ | -------------- | ------------------------ |
| Claude Code  | `claude`       | `anthropic.claude-code`  |
| Cline        | `cline`        | `saoudrizwan.claude-dev` |
| Codex        | `codex`        | —                        |

</details>

## Architecture

```
src/
├── cli/              # Command-line interface (main.ts)
├── server/           # HTTP proxy (router, OpenAI/Anthropic translation)
├── service/          # Daemon lifecycle + status
├── agents/           # Registry, detector, config writers, model map
├── tui/              # Renderer and raw-mode input
├── auth/             # GitHub OAuth device flow
├── copilot/          # GitHub Copilot API client
├── config/           # ~/.ardo/config.json store
└── lib/              # Shared utilities (log, process, errors, token)
```

## Prerequisites

- **GitHub Copilot subscription** — Individual, Business, or Enterprise

## Development

```bash
# Clone and run quality checks
git clone https://github.com/ardo-org/ardo.git && cd ardo
deno task quality

# Run in development mode
deno task dev

# Compile native binary
deno task compile
```

## Troubleshooting

<details>
<summary>Common Issues</summary>

<details>
<summary>📖 "Authentication failed"</summary>


- Verify you have an active GitHub Copilot subscription
- Try again — device flow tokens sometimes need a moment

</details>

<details>
<summary>📖 "Port already in use"</summary>


- Ardo automatically scans for an available port starting from 11434
- Check `ardo status` to see the actual port in use

</details>

<details>
<summary>🔧 "Agent is misconfigured"</summary>


- Run `ardo unconfigure <agent>` then `ardo configure <agent>` again
- Run `ardo doctor` for a full status report

</details>

<details>
<summary>📖 macOS "Cannot open" error (binary download)</summary>


- Run `xattr -d com.apple.quarantine ardo` to remove quarantine

</details>

</details>

## License

MIT License.

## Acknowledgments

- **GitHub** for the Copilot API
- **Anthropic** for Claude Code
- **Deno** for the excellent runtime and tooling
