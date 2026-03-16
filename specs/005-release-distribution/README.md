---
title: "Release Distribution"
status: complete
created: "2026-03-08"
---

# Release Distribution

## Specification

### User Scenarios & Testing

#### User Story 1 — Install via GitHub Release Binary (Priority: P1)

A developer downloads the Claudio binary for their platform directly from the
GitHub Releases page and runs it without installing Deno or Node.js.

**Why this priority**: Self-contained binary distribution is the highest-value
delivery channel — zero runtime prerequisites for end users.

**Independent Test**: Download `claudio-macos-arm64` from a GitHub Release, run
`./claudio --version`, verify it prints the version and exits 0.

**Acceptance Scenarios**:

1. **Given** a GitHub Release tagged `v0.2.0` exists, **When** a user downloads
   `claudio-macos-arm64` and runs it, **Then** the binary executes without
   requiring Deno to be installed.
2. **Given** a GitHub Release exists, **When** a user downloads
   `claudio-windows-x64.exe`, **Then** the binary runs on Windows x64 without
   additional runtime dependencies.
3. **Given** a tag `v*` is pushed to the repository, **When** the GitHub Actions
   release workflow completes, **Then** five platform binaries are attached as
   release assets.

---

#### User Story 2 — Install via npm (Priority: P2)

A developer installs Claudio globally via npm (`npm install -g claudio`) and
runs it from the terminal just like any other npm-installed CLI tool.

**Why this priority**: npm is the most ubiquitous package manager for JavaScript
developers, who are already the target audience for Claude Code.

**Independent Test**: Run `npm install -g claudio` in a clean environment,
verify `claudio --version` runs without Deno installed, verify the correct
platform binary is resolved.

**Acceptance Scenarios**:

1. **Given** the `claudio` npm package is published, **When** a user runs
   `npm install -g claudio` on macOS arm64, **Then** the `@claudio/darwin-arm64`
   optional dependency is installed and its binary is invoked.
2. **Given** a platform binary is not available (e.g., unsupported
   architecture), **When** the shim runs, **Then** it falls back to `deno run`
   if Deno is available, or prints a clear error with a link to the GitHub
   Releases page.
3. **Given** the npm package is installed, **When** a user runs `claudio`,
   **Then** the version reported matches the version in `deno.json`.

---

#### User Story 3 — Install via JSR (Priority: P3)

A Deno developer installs Claudio directly from JSR as a Deno-native package and
runs it with `deno run` or `deno install`.

**Why this priority**: Deno developers prefer JSR for TypeScript-native packages
with no compilation step.

**Independent Test**: Run `deno install -A -n claudio jsr:@myty/claudio`, verify
`claudio --version` works.

**Acceptance Scenarios**:

1. **Given** the `@myty/claudio` package is published on JSR, **When** a user
   runs `deno install -A -n claudio jsr:@myty/claudio`, **Then** Claudio is
   available as a command.
2. **Given** a tag `v*` is pushed, **When** the JSR publish workflow completes,
   **Then** the new version is available on JSR with the correct `version`
   field.
3. **Given** the JSR package is installed, **When** a user runs `claudio`,
   **Then** behavior is identical to the compiled binary.

---

#### User Story 4 — Install via mise (Priority: P3)

A developer using mise (formerly rtx) as their runtime manager installs Claudio
with `mise use -g claudio@latest` without additional configuration.

**Why this priority**: mise is growing in popularity among polyglot developers;
supporting it increases discoverability.

**Independent Test**: Configure mise to use the `github` backend for
`myty/claudio`, run `mise install claudio`, verify `claudio --version` works.

**Acceptance Scenarios**:

1. **Given** a GitHub Release with correctly named assets exists, **When** a
   user runs `mise use -g claudio`, **Then** mise auto-detects the platform,
   downloads the matching binary, and makes it available on `PATH`.
2. **Given** a new release is published, **When** a user runs `mise up claudio`,
   **Then** the latest version is installed.

---

#### Edge Cases

- What happens when the GitHub Actions release workflow is triggered by a
  non-semver tag?
- How is the version string kept in sync across `deno.json`, npm packages, and
  the binary's `--version` output?
- What happens when `deno compile` produces a binary larger than GitHub's 2GB
  release asset limit?
- How does the npm shim behave on an unsupported platform (e.g., Alpine/musl)?

### Requirements

#### Functional Requirements

1. **Compile targets**: The release workflow MUST produce five binaries:
   `claudio-macos-arm64`, `claudio-macos-x64`, `claudio-linux-x64`,
   `claudio-linux-arm64`, `claudio-windows-x64.exe`.
2. **GitHub Release automation**: Pushing a `v*` tag MUST trigger a workflow
   that creates a GitHub Release and attaches all five binaries.
3. **Single version source**: `deno.json` MUST be the single source of truth for
   the version. All distribution channels MUST read from it.
4. **npm shim**: The `claudio` npm package MUST resolve to the correct platform
   binary via `optionalDependencies`. It MUST NOT require Deno at runtime on
   supported platforms.
5. **JSR package**: The `@myty/claudio` JSR package MUST publish on every tagged
   release using OIDC (no stored secrets).
6. **mise support**: The release asset naming convention MUST be compatible with
   mise's `github` backend auto-detection.
7. **Permissions**: Compiled binaries MUST embed: `--allow-net`, `--allow-env`,
   `--allow-run`, `--allow-read`, `--allow-write`.

#### Non-Functional Requirements

- Binaries MUST be self-contained (no Deno runtime required on target machine).
- The release workflow SHOULD complete within 15 minutes.
- The npm package MUST NOT embed the binary directly; it uses
  `optionalDependencies` to keep install size per-platform.
- Version consistency: the `--version` flag output MUST match the tagged version
  across all distribution channels.

### Out of Scope

- Homebrew tap (can be added later)
- Chocolatey / winget packages
- Docker images
- Auto-update mechanism within Claudio itself
- Code signing certificates (macOS notarization, Windows Authenticode)

## Sub-Specs

This spec is organized using sub-spec files:

- **[RESEARCH](./RESEARCH.md)** - Additional documentation
- **[DATA_MODEL](./DATA_MODEL.md)** - Additional documentation
- **[PLAN](./PLAN.md)** - Additional documentation
- **[QUICKSTART](./QUICKSTART.md)** - Additional documentation
- **[TASKS](./TASKS.md)** - Additional documentation
- **[CONTRACTS](./CONTRACTS.md)** - Additional documentation
