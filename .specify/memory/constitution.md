# Claudio Constitution

<!--
Sync Impact Report:
- Version change: 1.2.0 → 1.3.0 (MINOR: two new principles added; scope and technical standards updated)
- Added: Principle VI - Transparency
- Added: Principle VII - Self-Containment
- Renumbered: former Principle VI (Contract Testing) → Principle VIII
- Renumbered: former Principle VII (Quality Gates) → Principle IX
- Modified sections:
  - Purpose: clarified "local Anthropic-compatible proxy" and HTTP interface
  - Scope > Responsibilities: proxy description updated; streaming/non-streaming clarified; SDK reference removed
  - Scope > Non-Responsibilities: added "Running as a background daemon"
  - Technical Standards > Behavioral Guarantees: added "Must not depend on Copilot CLI or SDK"
  - Technical Standards > Security: simplified token storage language to Deno permission model
  - Success Criteria: added "No Copilot CLI or SDK is required"
- Templates requiring updates:
  - ✅ .specify/memory/constitution.md (this file)
  - ⚠ .specify/templates/tasks-template.md — update principle references (VI→VIII, VII→IX)
  - ⚠ .specify/templates/spec-template.md — no structural changes required; verify principle refs
  - ⚠ .specify/templates/plan-template.md — no structural changes required; verify principle refs
- Follow-up TODOs: None — all placeholders resolved.
-->

Claudio provides a minimal, reliable bridge that enables Claude Code to run
using GitHub Copilot models through a local Anthropic-compatible proxy. Claudio
handles authentication, proxying, environment preparation, and process
orchestration. Its presence is intentionally brief and understated: it prepares
the environment, ensures stability, and then steps aside so Claude Code can take
over.

## Core Principles

### I. Minimalism

Only the essential steps required to prepare and launch Claude Code. No
additional features, configuration surfaces, or workflow layers. Claudio does
one thing well: bridges Claude Code to Copilot models.

### II. Calm UX

Quiet, steady, reassuring output. Slow, subtle animations (approximately
350–400ms). Short, emotionally neutral lines. No humor, metaphors, or
personality spikes. The setup experience uses soft blue/green ANSI-safe colors.
Claudio disappears completely once Claude Code begins.

### III. Predictability

Deterministic behavior, consistent across platforms and runs. All
request/response transformations are explicit, reviewable, and spec-driven. The
proxy is stateless and ephemeral.

### IV. Separation of Concerns

Claudio prepares; Claude Code performs. Claudio MUST NOT interfere once Claude
Code is running. Claudio is not responsible for implementing a chat interface,
replacing Claude Code, managing project context, or persisting long-term state
beyond authentication tokens.

### V. Portability

Single-binary or JSR package with minimal dependencies. Distributed via JSR, npm
(via shim), and compiled binaries. No background daemons or persistent
processes. Implemented in Deno with TypeScript.

### VI. Transparency

All request/response transformations between Anthropic's API semantics and
GitHub Copilot's HTTP interface MUST be explicit, documented, and spec-driven.
No hidden behavior, silent fallbacks, or undocumented mutations. Every
transformation MUST be reviewable in source and traceable to a spec.

### VII. Self-Containment

Claudio MUST NOT depend on the Copilot CLI or any Copilot SDK. All communication
with GitHub Copilot MUST occur through a stable, documented HTTP interface.
Claudio owns its authentication flow entirely. No third-party Copilot tooling
may be introduced as a runtime dependency.

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
(`deno fmt --check`), and tests (`deno test`). The quality gate command is:
`deno lint && deno fmt --check && deno check && deno test`.

## Scope

### Responsibilities

Claudio is responsible for:

- Authenticating with GitHub Copilot using a stable, documented
  OAuth/device-flow mechanism
- Running a local Anthropic-compatible HTTP proxy that accepts Claude Code's
  requests
- Translating Anthropic request/response semantics to and from GitHub Copilot's
  HTTP interface
- Supporting both streaming and non-streaming message flows
- Exposing `/v1/messages` and `/v1/messages/count_tokens` with
  Anthropic-compatible semantics
- Preparing all required environment variables for Claude Code
- Launching Claude Code as a subprocess with inherited I/O
- Shutting down cleanly when Claude Code exits
- Providing minimal, varied, reassuring setup messages and subtle animations

### Non-Responsibilities

Claudio is not responsible for:

- Implementing a chat or coding interface
- Replacing or modifying Claude Code
- Managing project context, tools, or workflows
- Persisting long-term state beyond authentication tokens
- Providing complex configuration or model selection UIs
- Performing any work after Claude Code has launched
- Running as a background daemon

## Technical Standards & Security

### Behavioral Guarantees

Claudio must:

- Exit immediately if authentication fails or is invalid
- Validate Copilot availability before launching the proxy
- Never modify user files or project state
- Never output verbose logs unless explicitly requested
- Always hand off control cleanly to Claude Code
- Shut down the proxy when Claude Code exits

Claudio must not:

- Emit excessive output
- Introduce unnecessary latency
- Override user environment variables without explicit intent
- Continue running after Claude Code begins execution
- Depend on the Copilot CLI or any Copilot SDK

### Technical Standards

- Implemented in Deno with TypeScript
- Distributed via JSR, npm (via shim), and compiled binaries
- Proxy is stateless and ephemeral
- All request/response transformations are deterministic and spec-documented
- Communication with GitHub Copilot occurs exclusively through a stable HTTP
  interface
- No Copilot CLI or SDK dependencies
- Codebase remains small, readable, and modular
- No background daemons or persistent processes

### Security Expectations

- Authentication tokens stored securely using Deno's permission model
- No external telemetry or analytics
- No network calls beyond GitHub Copilot and the local proxy
- No logging of sensitive data
- No mutation of user files or project structure

## Success Criteria

Claudio is successful when:

- Claude Code runs seamlessly using GitHub Copilot models through the local
  proxy
- Setup feels calm, minimal, and reliable
- Developers forget Claudio exists once Claude Code starts
- The proxy is stable, predictable, and transparent
- The tool remains small, portable, and easy to maintain
- No Copilot CLI or SDK is required

## Governance

All changes to this constitution MUST be spec-driven and traceable to a user
story or requirement. Breaking changes require explicit version bumps and
updated specifications. UX changes MUST preserve Claudio's emotional tone and
visual identity. Proxy behavior MUST remain Anthropic-compatible unless the spec
evolves.

All PRs and reviews must verify compliance with this constitution. Complexity
must be justified against the core principles. The constitution supersedes all
other practices; amendments require documentation, approval, and a migration
plan if applicable.

**Version**: 1.3.0 | **Ratified**: 2026-02-28 | **Last Amended**: 2026-03-07
