---
status: complete
created: 2026-03-25
priority: critical
tags:
  - rename
  - branding
  - cli
  - docs
  - release
created_at: 2026-03-25T02:01:25.434370Z
updated_at: 2026-04-24T02:57:08.429827Z
completed_at: 2026-04-24T02:57:08.429827Z
transitions:
  - status: complete
    at: 2026-04-24T02:57:08.429827Z
---

# Project Rename: Lomux to Coco

## Overview

Rename the active project identity from `lomux` back to `coco` across runtime,
CLI surface, repository metadata, documentation, website, and distribution
artifacts. Keep historical rename and migration references intact where they
exist to document prior project states.

## Summary

This spec defines a clean-cut rename from `Lomux`/`lomux` to `Coco`/`coco`
without backward compatibility aliases. The canonical repository becomes
`github.com/myty/coco`, and the canonical package identity becomes `@myty/coco`.

## Motivation

The project name should return to `coco` for current branding and personal
ownership. Mixed naming across runtime, packaging, and docs creates confusion
for users and increases maintenance cost. A coordinated rename keeps the active
product surface consistent while preserving historical records for prior names.

## Requirements

- [ ] **R-001 Active Name Canonicalization**: Replace active first-party
      references to `Lomux`/`lomux` with `Coco`/`coco` across source, docs,
      scripts, workflows, packaging, and site content.
- [ ] **R-002 Historical Reference Preservation**: Keep intentional historical
      references unchanged in files that document prior rename history,
      including changelog, migration guides, and rename-history specs.
- [ ] **R-003 CLI Primary Command**: CLI entrypoint, help text, examples, and
      diagnostics must use `coco` as the only canonical command.
- [ ] **R-004 Runtime and Service Identity**: Update binary names, runtime
      identifiers, service names, launch agent labels, and generated IDs from
      `lomux` to `coco`.
- [ ] **R-005 Config and Environment Namespace**: Change config/state/log paths
      from `~/.lomux` to `~/.coco` and environment variables from `LOMUX_*` to
      `COCO_*` with no legacy fallback behavior.
- [ ] **R-006 Agent Config Output**: Update generated agent configuration so new
      files written by the tool use `coco` naming consistently.
- [ ] **R-007 Repository and URL Integrity**: Update active GitHub URLs, clone
      commands, release links, website links, and metadata to
      `github.com/myty/coco`.
- [ ] **R-008 Distribution Identity**: Update package and distribution metadata
      to use `@myty/coco` and `coco`, including npm package manifests, build
      scripts, workflow artifact names, and install commands.
- [ ] **R-009 Documentation Rename Completion**: Update README, website, and
      active docs so current usage, install examples, and conceptual text are
      fully `coco` branded.
- [ ] **R-010 Validation Sweep**: Perform a final inventory check to ensure any
      remaining `lomux` references are intentional and historical only.

## Non-Goals

- Preserving runtime backward compatibility for `lomux` commands, paths,
  environment variables, services, or package names.
- Rewriting historical files that intentionally describe prior Coco, Ardo, or
  Lomux migration history.
- Changing product scope or runtime behavior unrelated to the rename.

## Technical Notes

### Primary Rename Targets

- Runtime and CLI: `src/cli/main.ts`, `src/tui/render.ts`,
  `src/auth/copilot.ts`, `src/copilot/token.ts`, `src/server/types.ts`,
  `src/server/transform.ts`
- Config/state/services: `src/config/store.ts`, `src/service/daemon.ts`,
  `src/lib/log.ts`, `src/lib/token.ts`, `src/service/managers/*`,
  `src/service/autostart.ts`
- Agent config writers: `src/agents/config.ts`
- Packaging/release: `deno.json`, `scripts/sync-version.ts`, `npm/`,
  `.github/workflows/release.yml`
- Docs/site: `README.md`, `site/index.html`, `docs/style-guide.md`,
  `docs/logo-brief.md`, `site/favicon.svg`

### Historical Exceptions

Treat these as keep-for-history unless a specific section describes current
behavior and clearly needs updating:

- `CHANGELOG.md`
- `MIGRATION.md`
- prior rename specs under `specs/014-*` through `specs/018-*`

### Clean-Cut Policy

- No `lomux` command alias
- No fallback reads from `~/.lomux`
- No `LOMUX_*` compatibility handling
- No legacy service labels retained

## Acceptance Criteria

- [ ] **AC-001** Active runtime, packaging, docs, and site surfaces use `coco`
      consistently.
- [ ] **AC-002** All active install and usage examples reference `coco`,
      `@myty/coco`, and `github.com/myty/coco`.
- [ ] **AC-003** Config, log, pid, service, and environment naming uses the new
      `coco` namespace with no `lomux` fallback logic remaining.
- [ ] **AC-004** Historical rename and migration documents still preserve their
      intentional past-state references.
- [ ] **AC-005** Repository-wide verification shows no unintended `lomux`
      references outside approved historical files.
- [ ] **AC-006** Project quality checks pass after the rename.

## Plan

- [ ] Build a must-change versus historical inventory for `lomux` references.
- [ ] Rename runtime, CLI, service, config, env, and generated identifier usage
      to `coco`.
- [ ] Rename packaging, build, workflow, and release metadata to `coco` and
      `@myty/coco`.
- [ ] Update README, website, active docs, and public links to
      `github.com/myty/coco`.
- [ ] Run a final search pass and quality checks, then confirm only historical
      `lomux` references remain.

## Test

- [ ] Search-based verification confirms remaining `lomux` references only occur
      in approved historical files.
- [ ] CLI and contract tests pass with `coco` command names and updated output.
- [ ] Config and service tests pass with `~/.coco`, `COCO_*`, and renamed
      service identifiers.
- [ ] Packaging metadata and release workflow references are updated to
      `@myty/coco` and `github.com/myty/coco`.
- [ ] `deno task quality` passes after the rename.
