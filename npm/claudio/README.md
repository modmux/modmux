# claudio

GitHub Copilot bridge for Claude Code.

## Installation

```bash
npm install -g claudio
```

## Supported Platforms

| Platform | Architecture | npm Package             |
| -------- | ------------ | ----------------------- |
| macOS    | arm64        | `@claudio/darwin-arm64` |
| macOS    | x64          | `@claudio/darwin-x64`   |
| Linux    | x64          | `@claudio/linux-x64`    |
| Linux    | arm64        | `@claudio/linux-arm64`  |
| Windows  | x64          | `@claudio/win32-x64`    |

## How it works

When you run `claudio`, the shim:

1. Detects your platform and resolves the matching `@claudio/<os>-<arch>`
   optional dependency
2. Runs the native binary directly — no Deno runtime required
3. If no platform binary is available, falls back to
   `deno run jsr:@myty/claudio` (requires [Deno](https://deno.land) installed)
4. If neither is available, prints an error with a link to manual download

## Manual Download

Download pre-built binaries from the
[GitHub Releases](https://github.com/myty/claudio/releases) page.
