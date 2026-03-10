# Coco Constitution

<!--
Sync Impact Report:
- Version change: 1.3.0 → 2.0.0 (MAJOR: project renamed Claudio→Coco; Principles I/IV/V
  materially redefined; daemon prohibitions removed; new Principle X added; scope expanded
  to universal multi-agent gateway; Success Criteria revised for multi-agent support)
- Project renamed: Claudio → Coco
- Modified principles:
  - Principle I: "Minimalism" → "Focus" (scope expanded from single-tool bridge to universal gateway)
  - Principle IV: "Separation of Concerns" (rewritten: daemon/TUI/config-manager separation replaces
    Claude-Code-handoff framing; "must not continue running" prohibition removed)
  - Principle V: "Portability" (amended: "No background daemons" removed; daemon self-spawn pattern added)
- Added: Principle X — Reversible Configuration Management
- Removed from Non-Responsibilities: "Running as a background daemon"
- Removed from Behavioral Guarantees: "Always hand off control cleanly to Claude Code",
  "Shut down the proxy when Claude Code exits", "Continue running after Claude Code begins execution"
- Removed from Technical Standards: "No background daemons or persistent processes"
- Scope > Responsibilities: expanded to include daemon lifecycle, OpenAI endpoint, agent detection,
  per-agent configuration, TUI
- Scope > Non-Responsibilities: updated; Claude Code-specific launching removed
- Success Criteria: revised for multi-agent, TUI, and daemon reliability
- Templates requiring updates:
  - ✅ .specify/memory/constitution.md (this file)
  - ✅ .specify/templates/plan-template.md — no principle-specific hardcoding; generic gates fine
  - ✅ .specify/templates/spec-template.md — no principle-specific hardcoding; no changes required
  - ✅ .specify/templates/tasks-template.md — no hardcoded principle refs; no changes required
  - ⚠ AGENTS.md — references Claudio; update to Coco after implementation (task T043)
  - ⚠ CLAUDE.md — references Claudio architecture; update to Coco after implementation (task T043)
  - ⚠ README.md — references Claudio; update to Coco during Polish phase (task T042)
- Follow-up TODOs: None — all placeholders resolved.
-->

Coco is a universal local AI gateway that exposes unified Anthropic-compatible
and OpenAI-compatible endpoints backed by GitHub Copilot models. Coco runs as a
persistent background service, automatically configures multiple coding agents to
use its proxy, and provides a minimal TUI control surface. Its presence is calm
and unobtrusive: it bridges the diverse agent ecosystem to GitHub Copilot's API
without imposing itself on the developer's workflow.

## Core Principles

### I. Focus

Coco does one thing well: acts as a universal local AI gateway, translating
requests from multiple coding agents into GitHub Copilot's HTTP interface.
Within this mission, minimalism still applies — each module MUST do only what
its responsibility requires. No unnecessary features, no speculative
configuration surfaces, no workflow layers beyond the gateway mission.

### II. Calm UX

Quiet, steady, reassuring output. Slow, subtle animations (approximately
350–400ms). Short, emotionally neutral lines. No humor, metaphors, or
personality spikes. CLI output uses soft blue/green ANSI-safe colors. The TUI
is calm, minimal, and control-surface only. Coco's presence MUST feel
understated regardless of how many agents it manages.

### III. Predictability

Deterministic behavior, consistent across platforms and runs. All
request/response transformations MUST be explicit, reviewable, and spec-driven.
The proxy is stateless and deterministic per request. Model alias resolution,
retry logic, and configuration writes MUST produce identical outputs given
identical inputs.

### IV. Separation of Concerns

The daemon proxies; coding agents perform. The TUI controls; the configuration
manager writes. Each of Coco's subsystems has one clearly bounded responsibility:

- The **proxy daemon** translates API formats and forwards to Copilot.
- The **configuration manager** reads, writes, and reverts agent config files.
- The **TUI** presents state and accepts user input — it MUST NOT perform
  side effects directly; it delegates to the configuration manager.
- The **CLI** dispatches sub-commands — it MUST NOT contain business logic.

Coco MUST NOT implement a chat or coding interface, replace or modify agent
behavior, manage project context, or persist state beyond authentication tokens
and Coco's own configuration.

### V. Portability

Single compiled binary with minimal dependencies. Distributed via JSR, npm (via
shim), and compiled binaries for macOS (arm64/x64), Linux (x64/arm64), and
Windows (x64). Implemented in Deno with TypeScript. The background daemon MUST
be self-contained, spawned as a second instance of the same binary via a
`--daemon` flag — no separate daemon binary, no OS service manager required.
The only runtime configuration store is `~/.coco/` (files only; no databases,
registries, or system services).

### VI. Transparency

All request/response transformations between agent API semantics (Anthropic or
OpenAI) and GitHub Copilot's HTTP interface MUST be explicit, documented, and
spec-driven. No hidden behavior, silent fallbacks, or undocumented mutations.
Every transformation MUST be reviewable in source and traceable to a contract
in `specs/*/contracts/`. Model alias resolution MUST be logged at `debug` level.

### VII. Self-Containment

Coco MUST NOT depend on the Copilot CLI or any Copilot SDK. All communication
with GitHub Copilot MUST occur through a stable, documented HTTP interface. Coco
owns its entire authentication flow. No third-party Copilot tooling may be
introduced as a runtime dependency.

### VIII. Contract Testing (NON-NEGOTIABLE)

Tests are a core part of every feature and user story. Every user story MUST
have corresponding tests that validate the story's acceptance criteria. Tests
MUST verify contracts (interfaces, APIs, CLI behavior) rather than
implementation details. Implementation changes that preserve contracts MUST NOT
break tests. Each feature MUST include contract tests in `tests/contract/` that
verify external interfaces.

### IX. Quality Gates (NON-NEGOTIABLE)

All code changes MUST pass quality gates before merging. The required gates are:
Deno lint (`deno lint`), type check (`deno check`), formatting
(`deno fmt --check`), and tests (`deno test --allow-all`). The quality gate
command is:
`deno lint && deno fmt --check && deno check src/**/*.ts tests/**/*.ts && deno test --allow-all`.

### X. Reversible Configuration Management (NON-NEGOTIABLE)

All agent configuration operations MUST be reversible without data loss:

- Before writing any agent config file, Coco MUST create a backup at
  `<original-path>.coco-backup`.
- `coco unconfigure <agent>` MUST restore the backup exactly, or remove the
  created file if no backup existed.
- After writing a config file, Coco MUST perform a validation test call to
  confirm the configuration is functional before reporting success.
- Configuration state MUST be persisted in `~/.coco/config.json` after every
  successful configure or unconfigure operation.
- A failed validation test call MUST be surfaced to the user with a non-zero
  exit code; it MUST NOT silently proceed.

## Scope

### Responsibilities

Coco is responsible for:

- Authenticating with GitHub Copilot using a stable, documented OAuth device
  flow mechanism
- Running a persistent local HTTP proxy bound exclusively to `127.0.0.1`,
  exposing Anthropic-compatible (`/v1/messages`) and OpenAI-compatible
  (`/v1/chat/completions`, `/v1/models`, `/health`) endpoints
- Translating Anthropic and OpenAI request/response semantics to and from
  GitHub Copilot's HTTP interface, including streaming and non-streaming flows
- Managing its own background daemon lifecycle (start, stop, restart, status)
  via PID file and process signals
- Writing structured logs to `~/.coco/coco.log` at a configurable log level
- Detecting installed and configured coding agents by scanning PATH, VS Code
  extension directories, JetBrains plugin directories, and known config file
  locations
- Writing and reverting per-agent configuration files (Claude Code, Cline, Kilo,
  OpenCode, Goose, Aider, GPT-Engineer) in a reversible, validated manner
- Presenting a minimal TUI for batch agent configuration (Space toggle, Enter
  apply, q exit without applying)
- Providing calm, minimal CLI output across all sub-commands
- Mapping model aliases to Copilot model IDs via a bundled default map that is
  user-overridable in `~/.coco/config.json`

### Non-Responsibilities

Coco is not responsible for:

- Implementing a chat or coding interface
- Replacing, modifying, or interfering with any coding agent's behavior
- Managing project context, tools, or workflows
- Persisting state beyond authentication tokens and `~/.coco/config.json`
- Supporting agents not listed in the built-in agent registry without an
  explicit registry extension
- Providing network access beyond `127.0.0.1` (the proxy MUST NOT bind to
  `0.0.0.0` or any external interface)

## Technical Standards & Security

### Behavioral Guarantees

Coco must:

- Bind exclusively to `127.0.0.1` — never to `0.0.0.0` or any external address
- Respond to SIGTERM and SIGHUP with graceful shutdown, removing the PID file
- Write structured JSON log lines to `~/.coco/coco.log` (never to stdout/stderr
  in daemon mode)
- Back up agent config files before any write and restore them on unconfigure
- Perform a validation test call after each agent configuration write
- Retry Copilot API `429` responses with exponential backoff (100ms, 200ms,
  400ms; max 3 attempts) before propagating the error to the caller
- Never output stack traces or internal error details to end users

Coco must not:

- Emit excessive output
- Introduce unnecessary latency (proxy overhead target: < 150ms excluding
  Copilot API latency)
- Override user environment variables without explicit intent
- Depend on the Copilot CLI or any Copilot SDK
- Write to any path outside `~/.coco/` and per-agent canonical config locations

### Technical Standards

- Implemented in Deno (latest stable) with TypeScript (strict mode)
- Distributed via JSR, npm (via shim), and compiled binaries
- Binary name: `coco`; configuration directory: `~/.coco/`
- Proxy is stateless and deterministic per request
- All request/response transformations are deterministic and spec-documented
  in `specs/*/contracts/`
- Communication with GitHub Copilot occurs exclusively through a stable HTTP
  interface
- No Copilot CLI or SDK dependencies
- Runtime standard library deps: `@std/fmt/colors`, `@std/toml`, `@std/yaml`
  (Deno std only; no third-party runtime packages)
- Codebase remains small, readable, and modular
- The daemon is spawned as a detached child of the same binary (`--daemon` flag)
  with `stdin/stdout/stderr: "null"` and `detached: true`

### Security Expectations

- Authentication tokens stored securely using Deno's permission model
- No external telemetry or analytics
- No network calls beyond GitHub Copilot's API and the local proxy
- No logging of authentication tokens, request bodies, or sensitive headers
- Agent config file backups MUST be stored adjacent to the original file
  (not in a world-readable central location)
- Proxy MUST NOT forward requests to any host other than GitHub Copilot's
  documented API endpoint

## Success Criteria

Coco is successful when:

- Multiple coding agents (Claude Code, Cline, Aider, and others) run
  seamlessly through Coco with zero manual environment variable setup
- `coco start` and `coco stop` each complete in under 1 second
- The TUI renders in under 200ms on first open
- OpenAI-compatible proxy round-trip overhead is under 150ms (excluding
  Copilot API latency)
- `coco configure <agent>` and `coco unconfigure <agent>` are deterministically
  reversible — the config file is byte-identical to its pre-Coco state after
  unconfigure
- All pre-existing Anthropic proxy and authentication tests continue to pass
  after migration (no regression)
- `coco doctor` correctly classifies agents on macOS, Linux, and Windows
- Calm, minimal output is preserved across all CLI commands — no stack traces,
  no verbose internal logging exposed to users
- No Copilot CLI or SDK is required at any point

## Governance

### Decision-Making Process

**Feature Evaluation**: All feature requests are evaluated against the core
principles:
1. **Focus Check**: Does this add essential gateway functionality, or
   unnecessary complexity outside the universal AI gateway mission?
2. **UX Impact**: Will this maintain calm, predictable, minimal user experience?
3. **Scope Alignment**: Is this within stated responsibilities, or outside scope?
4. **Technical Standards**: Does this meet quality gates and architectural
   standards?
5. **Reversibility**: If this touches agent configuration, is it fully
   reversible with backup/restore?

**Acceptance Criteria**: Features must satisfy ALL of these requirements:
- Aligns with at least one core principle without violating others
- Falls within defined scope responsibilities
- Includes comprehensive tests and documentation
- Passes all quality gates
- Maintains constitutional compliance

**Rejection Criteria**: Features are rejected if they:
- Violate any core principle
- Fall outside defined scope boundaries
- Add unnecessary complexity or configuration surfaces
- Compromise security, predictability, or portability
- Introduce irreversible agent configuration changes

### Amendment Process

All changes to this constitution MUST be spec-driven and traceable to a user
story or requirement. Breaking changes (MAJOR version bumps) require explicit
justification in the Sync Impact Report. UX changes MUST preserve Coco's calm,
minimal emotional tone. Proxy behavior MUST remain API-compatible with both
Anthropic and OpenAI wire formats unless the spec explicitly evolves them.

### Review Standards

All PRs and reviews must verify compliance with this constitution. Complexity
must be justified against the core principles. The constitution supersedes all
other practices; amendments require documentation, a Sync Impact Report, and a
migration plan for any breaking changes.

**Version**: 2.0.0 | **Ratified**: 2026-02-28 | **Last Amended**: 2026-03-10
