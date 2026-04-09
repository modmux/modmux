# Modmux Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-28

## Active Technologies

### Core Technologies

- **Deno (latest stable)** - Runtime environment and toolkit
- **TypeScript** - Primary development language
- **Deno Standard Library** - HTTP server, utilities, testing

### Key Dependencies

- **GitHub Copilot API** - AI code completion service (models, chat)
- **OAuth 2.0 Device Flow** - Authentication with GitHub
- **@std/yaml / @std/toml** - Agent config file parsing and writing
- **@cliffy/ansi** - TUI renderer (colors, TTY handling)

### Platform Integration

- **Cross-platform binaries** - macOS (arm64/x64), Linux (x64/arm64), Windows
  (x64)
- **From source installation** - Clone repository and build with Deno
- **GitHub Actions** - CI/CD and automation

### Architecture Patterns

- **Deno Workspace** - Multi-package monorepo with internal package resolution
- **Proxy server pattern** - Request/response translation (Anthropic + OpenAI)
- **Background daemon** - Self-spawn with `Deno.Command` + PID file
- **Command pattern** - CLI interface design
- **OAuth device flow** - Secure authentication

## Project Structure (Deno Workspace)

```text
modmux/
├── deno.json              # Workspace root
├── cli/                   # Command-line interface
│   ├── deno.json
│   └── src/
│       ├── main.ts        # Main entry point + all sub-command handlers
│       ├── auth.ts        # Authentication handling
│       └── version.ts     # VERSION = "0.3.0"
├── gateway/               # HTTP proxy server
│   ├── deno.json
│   └── src/
│       ├── mod.ts         # Module exports
│       ├── router.ts      # Request routing — /v1/messages, /v1/chat/completions, /v1/models, /health
│       ├── server.ts      # HTTP server setup + graceful shutdown
│       ├── chat-handler.ts
│       ├── messages-handler.ts
│       ├── responses-handler.ts
│       ├── openai-translate.ts  # OpenAI↔Anthropic bidirectional translation
│       ├── copilot.ts     # GitHub OAuth device flow
│       ├── token.ts       # Token management
│       ├── types.ts       # Anthropic + OpenAI type definitions
│       ├── store.ts       # loadConfig/saveConfig, DEFAULT_CONFIG, ~/.modmux/config.json
│       ├── log.ts         # Structured JSON logger → ~/.modmux/modmux.log
│       ├── detector.ts    # detectOne/detectAll — PATH, VS Code extension, JetBrains scan
│       ├── status.ts      # getServiceState/formatStatus
│       ├── daemon.ts      # startDaemon/stopDaemon/getDaemonPid
│       ├── render.ts      # TUI renderer
│       └── managers/      # Platform-specific daemon managers
├── providers/             # GitHub Copilot API client
│   ├── deno.json
│   └── src/
│       ├── mod.ts         # Module exports
│       ├── client.ts      # API client + fetchWithRetry (429 exponential backoff)
│       ├── models.ts      # Model ID resolution + fetchModelList()
│       ├── token.ts       # Token management
│       └── types.ts       # Type definitions
├── branding/              # Brand assets
├── site/                  # Documentation website
└── tests/                 # Test files

tests/
├── contract/        # Contract tests for external interfaces
├── integration/     # Integration tests
└── unit/            # Unit tests
```

## Contribution Workflow

### Getting Started

1. **Fork and clone** the repository
2. **Create feature branch** from main:
   `git checkout -b feature/your-feature-name`
3. **Install Deno** if not already available (see README for instructions)
4. **Run quality checks** to ensure environment works: `deno task quality`

### Development Process

1. **Write failing tests first** (TDD approach) in appropriate test directory
2. **Implement feature** following the code style guidelines below
3. **Update documentation** if API or behavior changes
4. **Run quality gates** before committing: `deno task quality`
5. **Commit with clear message** following conventional commit format

### Quality Requirements

- ✅ **All tests pass** - `deno test --allow-all`
- ✅ **Linting passes** - `deno lint`
- ✅ **Formatting correct** - `deno fmt --check`
- ✅ **Type checking passes** -
  `deno check cli/src/**/*.ts gateway/src/**/*.ts providers/src/**/*.ts tests/**/*.ts`
- ✅ **Documentation updated** if needed

### Testing Strategy

- **Contract tests** - Test external interfaces and API contracts
- **Integration tests** - Test component interactions (file I/O, agent config
  round-trips)
- **Unit tests** - Test individual functions and modules (detector, translate,
  model-map)
- **Manual testing** - Verify TUI and daemon behavior

## Code Style Guidelines

### TypeScript Standards

- **Strict mode enabled** - All TypeScript strict checks required
- **Explicit types** - Prefer explicit type annotations over inference where
  clarity helps
- **Interface over type** - Use interfaces for object shapes, types for
  unions/primitives
- **Const assertions** - Use `as const` for immutable data structures
- **verbatim-module-syntax** - Use `import type { Foo }` when importing
  type-only symbols

### Naming Conventions

- **Files**: kebab-case (e.g., `openai-translate.ts`)
- **Directories**: kebab-case (e.g., `agents/`, `service/`)
- **Classes**: PascalCase (e.g., `CopilotClient`)
- **Functions/variables**: camelCase (e.g., `resolveModel`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_MODEL_MAP`)
- **Interfaces**: PascalCase (e.g., `DetectionResult`)

### Code Organization

- **Single responsibility** - Each module/function has one clear purpose
- **Dependency injection** - Prefer explicit dependencies over global state
- **Error handling** - Avoid throwing; prefer Result types or explicit error
  handling
- **Immutability** - Prefer immutable data structures and pure functions
- **Modular exports** - Use `mod.ts` files for clean module boundaries

### Deno-Specific Practices

- **Import maps** - Use import maps in `deno.json` for path management
- **Web standards** - Use web platform APIs when available
- **Standard library** - Prefer Deno std library (`@std/yaml`, `@std/toml`,
  `@std/path`)

### Specification Workflow

- **LeanSpec-first** - All feature specifications live under `specs/`, with each
  spec `README.md` serving as the canonical entrypoint. Some historical or
  expanded specs also retain supporting artifacts such as `PLAN.md`, `TASKS.md`,
  `CONTRACTS.md`, or `DATA_MODEL.md`; see `specs/README.md` for the repository's
  current spec model
- **Global conventions** - Use `CONVENTIONS.md` as the project-wide constitution
  and governance baseline

## Development Commands

### Core Development

```bash
deno task dev                   # Start development server with file watching
deno run -A cli/src/main.ts start   # Start daemon in dev mode
```

### Spec Workflow

```bash
lean-spec new                   # Create a new feature spec
lean-spec plan                  # Plan an existing spec
lean-spec validate              # Validate all specs
lean-spec backfill --assignee --all  # Backfill LeanSpec frontmatter metadata
lean-spec board                 # View spec board/status
```

### Quality Assurance

```bash
deno task quality               # Full quality gate (lint + fmt + check + test)
deno lint                       # Lint all TypeScript files
deno fmt --check                # Check formatting
deno check cli/src/**/*.ts gateway/src/**/*.ts providers/src/**/*.ts tests/**/*.ts  # Type check
```

### Testing

```bash
deno test --allow-all           # Run all tests
deno test tests/unit/           # Unit tests only
deno test tests/contract/       # Contract tests only
deno test tests/integration/    # Integration tests only
```

### Building

```bash
deno task compile               # Compile native binary → bin/modmux
deno task sync-version          # Sync version across all artifacts
```

## Recent Changes

- **2026-03-28**: Modmux rebrand complete
  - Full rebrand from coco to modmux
  - Deno workspace with 3 packages: cli, gateway, providers
  - Config directory: ~/.coco → ~/.modmux
  - Binary name: coco → modmux (from source installation)

- **2026-03-15**: LeanSpec migration completed
  - Migrated Speckit specs to a LeanSpec `README.md`-first format in `specs/`,
    while retaining supporting artifacts where they still add value
  - Added root `CONVENTIONS.md` as the canonical global conventions file
  - Adopted LeanSpec workflow commands (`new`, `plan`, `validate`, `backfill`,
    `board`)

- **2026-03-10**: Coco v0.2.0 — full migration from Lomux
  - Added background daemon service (start/stop/restart/status)
  - Added OpenAI-compatible proxy endpoint (/v1/chat/completions, /v1/models)
  - Added agent detection engine (PATH + VS Code + JetBrains)
  - Added per-agent config writers (7 agents, backup/restore)
  - Added minimal TUI (Space/Enter/q, ANSI renderer)
  - Added `coco models`, `coco doctor`, `coco configure`, `coco unconfigure`
  - Removed Lomux-specific launch/session modules

- **Previous**: Lomux v0.1.x — Claude Code + GitHub Copilot bridge
