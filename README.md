# Claudio

GitHub Copilot bridge for Claude Code.

## Installation

### npm (Node.js ≥18, no Deno required)

```bash
npm install -g claudio
```

The npm package automatically installs the native binary for your platform via
`optionalDependencies`.

### Homebrew / Direct Binary Download

Download pre-built binaries from the
[GitHub Releases](https://github.com/myty/claudio/releases) page.

```bash
# macOS arm64
curl -Lo claudio https://github.com/myty/claudio/releases/latest/download/claudio-macos-arm64
chmod +x claudio
sudo mv claudio /usr/local/bin/

# macOS x64
curl -Lo claudio https://github.com/myty/claudio/releases/latest/download/claudio-macos-x64
chmod +x claudio
sudo mv claudio /usr/local/bin/

# Linux x64
curl -Lo claudio https://github.com/myty/claudio/releases/latest/download/claudio-linux-x64
chmod +x claudio
sudo mv claudio /usr/local/bin/
```

> **macOS Gatekeeper**: After downloading, you may need to run
> `xattr -d com.apple.quarantine ./claudio` to remove the quarantine flag before
> executing the binary.

### JSR (Deno)

```bash
deno install -A -g jsr:@myty/claudio
```

Or run directly without installing:

```bash
deno run -A jsr:@myty/claudio --version
```

### mise

```bash
mise use -g claudio@0.1.0
```

Or add to your `.mise.toml`:

```toml
[tools]
claudio = "0.1.0"
```

## Usage

```
claudio [OPTIONS] [CLAUDE_ARGS...]

Options:
  --help       Show this help message
  --version    Show version
  --server     Start the proxy server (default)

Any options not listed above are forwarded verbatim to claude.
```

## Development

```bash
# Run in development mode
deno task dev

# Run quality checks (lint + fmt + typecheck + tests)
deno task quality

# Sync version across all distribution artifacts
deno task sync-version

# Compile native binary
deno task compile
```
