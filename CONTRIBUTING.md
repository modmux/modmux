# Contributing to Modmux

README.md covers installation and user-facing usage. This guide covers working
on the codebase.

## Project Structure

```text
modmux/
├── deno.json              # Workspace root
├── cli/                   # Command-line interface
│   └── src/
│       ├── main.ts        # Entry point + all sub-command handlers
│       ├── auth.ts        # Authentication handling
│       └── version.ts     # VERSION constant
├── gateway/               # HTTP proxy server
│   └── src/
│       ├── router.ts      # Request routing — /v1/messages, /v1/chat/completions, /v1/models, /health
│       ├── server.ts      # HTTP server + graceful shutdown
│       ├── openai-translate.ts  # OpenAI↔Anthropic bidirectional translation
│       ├── copilot.ts     # GitHub OAuth device flow
│       ├── store.ts       # loadConfig/saveConfig — ~/.modmux/config.json
│       ├── log.ts         # Structured JSON logger → ~/.modmux/modmux.log
│       ├── detector.ts    # detectOne/detectAll — PATH, VS Code extension, JetBrains scan
│       ├── daemon.ts      # startDaemon/stopDaemon/getDaemonPid
│       ├── render.ts      # TUI renderer
│       └── managers/      # Platform-specific daemon managers
├── providers/             # GitHub Copilot API client
│   └── src/
│       ├── client.ts      # API client + fetchWithRetry (429 exponential backoff)
│       ├── models.ts      # Model ID resolution + fetchModelList()
│       └── token.ts       # Token management
├── specs/                 # Feature specifications (LeanSpec, README-first)
├── tests/
│   ├── contract/          # External interface and API contract tests
│   ├── integration/       # Component interaction tests (file I/O, config round-trips)
│   └── unit/              # Module tests (detector, translate, model-map)
└── site/                  # Documentation website
```

## Design Principles

- **Focus** — does one thing: routes requests between coding agents and GitHub
  Copilot. Each module does only what its responsibility requires.
- **Predictability** — deterministic transforms per request. Model alias
  resolution, retry logic, and config writes produce identical outputs for
  identical inputs. No hidden behavior.
- **Separation of concerns** — the daemon proxies; the config manager writes;
  the TUI controls. The CLI dispatches and contains no business logic.
- **Reversibility** — all agent config writes create a `.modmux-backup` file
  first. `modmux unconfigure` restores the original exactly.
- **Security** — bind to `127.0.0.1` only. No external telemetry. No logging of
  tokens, request bodies, or sensitive headers. No Copilot CLI or SDK
  dependency.
- **Contract testing** — tests verify external interfaces and API contracts, not
  implementation details. Every feature includes contract tests in
  `tests/contract/`.

## Getting Started

1. Fork and clone the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Install Deno if not already available (see [README](README.md) for
   instructions)
4. Verify your environment: `deno task quality`

## Development Process

1. Write failing tests first (TDD) in the appropriate `tests/` subdirectory
2. Implement the feature following the code style guidelines below
3. Update documentation if API or behavior changes
4. Run quality gates before committing: `deno task quality`
5. Commit using [conventional commit](https://www.conventionalcommits.org/)
   format

## Commands

```bash
# Development
deno task dev                        # Start with file watching
deno run -A cli/src/main.ts start    # Run daemon directly

# Quality gate (run before committing)
deno task quality                    # lint + fmt + check + test

deno lint                            # Lint
deno fmt --check                     # Check formatting
deno check cli/src/**/*.ts gateway/src/**/*.ts providers/src/**/*.ts tests/**/*.ts

# Testing
deno test --allow-all                # All tests
deno test tests/unit/                # Unit tests
deno test tests/contract/            # Contract tests
deno test tests/integration/         # Integration tests

# Building
deno task compile                    # Compile binary → bin/modmux
deno task sync-version               # Sync version across artifacts

# Specs
lean-spec board                      # View spec status
lean-spec validate                   # Validate all specs
```

## Code Style

### TypeScript

- Strict mode required
- Explicit type annotations where clarity helps
- Interfaces for object shapes; types for unions/primitives
- `as const` for immutable data
- `import type { Foo }` for type-only imports (verbatim-module-syntax)

### Naming

- Files and directories: `kebab-case`
- Classes: `PascalCase`
- Functions and variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Interfaces: `PascalCase`

### Organization

- Single responsibility per module
- Prefer explicit dependencies over global state
- Avoid throwing; prefer Result types or explicit error handling
- Immutable data structures and pure functions where practical
- `mod.ts` for clean module boundaries

### Specifications

All feature work starts with a spec under `specs/`. Each spec's `README.md` is
the canonical entrypoint. Run `lean-spec board` to see current project state
before starting.

### Documentation

Keep user-facing docs short and direct. See
[`docs/documentation-style.md`](./docs/documentation-style.md) for documentation
roles and writing rules.
