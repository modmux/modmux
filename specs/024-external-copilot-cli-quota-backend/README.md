---
status: in-progress
created: 2026-04-13
priority: high
tags:
  - api
  - github-copilot
  - usage
  - status
  - cli
  - configuration
  - daemon
  - lifecycle
depends_on:
  - 023-github-copilot-usage-endpoint
created_at: 2026-04-13T12:56:40.629147Z
updated_at: 2026-04-13T14:16:51.894766Z
transitions:
  - status: in-progress
    at: 2026-04-13T12:59:42.089480Z
---

# First-Class External Copilot CLI Quota Backend

## Overview

`modmux status` can now connect to a configured external Copilot CLI quota
backend, but users still have to start that headless Copilot CLI server manually
before starting Modmux. That manual step makes the feature fragile and easy to
misconfigure.

This next phase extends spec 024 from "connect to an external quota backend" to
"manage the Copilot CLI quota backend automatically as part of Modmux startup
and shutdown."

## Design

Extend the existing `githubUsage` configuration so Modmux can manage a Copilot
CLI sidecar rather than only consuming a manually managed `cliUrl`.

When sidecar management is enabled, Modmux should:

1. Discover an available localhost port for the headless Copilot CLI server.
2. Spawn `copilot --headless --port <port>` as a detached sidecar process.
3. Persist the sidecar PID and effective port under `~/.modmux`.
4. Use the discovered effective port for GitHub quota lookups.
5. Stop the sidecar when Modmux stops or shuts down.

Implementation should reuse the detached spawn and PID-file patterns already
present in `gateway/src/daemon.ts` rather than introducing a separate lifecycle
model. The sidecar should remain localhost-only and should work for both direct
daemon startup and OS service-managed startup.

User-facing states should remain explicit:

- sidecar disabled or not configured -> `Usage: Not available (error)`
- sidecar configured but failed to start or connect ->
  `Usage: Not available (error)`
- sidecar running but auth missing or invalid ->
  `Usage: Not available (unauthenticated)`
- sidecar running and healthy -> real quota usage is shown

## Plan

- [x] Add configuration fields for GitHub quota backend mode and external CLI
      connection details.
- [x] Update GitHub quota lookup to use the configured external Copilot CLI
      server instead of assuming the Deno process can host the SDK path
      directly.
- [x] Keep token reuse aligned with existing Modmux auth so quota lookup and
      status share the same source of truth.
- [x] Preserve clear user-facing states across `authenticated`,
      `unauthenticated`, and backend/runtime `error` cases.
- [x] Add or update tests for configured backend, unavailable backend, and
      invalid-token scenarios in `/v1/usage` and `formatStatus()` output.
- [x] Document how users configure and run the external quota backend as a
      supported feature.
- [x] Extend `githubUsage` config with sidecar lifecycle settings, including
      auto-start enablement and preferred Copilot CLI port.
- [x] Create a Copilot CLI sidecar manager for free-port discovery, detached
      spawn, PID/port metadata, and shutdown.
- [x] Start the sidecar during Modmux startup and stop it during Modmux
      shutdown.
- [x] Update GitHub usage lookup to use the effective sidecar port discovered at
      startup instead of assuming a fixed manually managed `cliUrl`.
- [x] Add tests for sidecar config validation, port discovery, metadata
      lifecycle, and startup/shutdown integration.
- [x] Update docs for the new automatic behavior and any remaining manual
      fallback path.

## Test

- [x] `deno test --allow-all tests/unit/status_test.ts`
- [x] `deno test --allow-all tests/contract/usage_endpoint_test.ts`
- [x] `deno test --allow-all tests/unit/config-store_test.ts`
- [ ] Add sidecar-focused tests for manager lifecycle and effective-port
      resolution.
- [ ] Manual verification that `modmux start` auto-starts the Copilot CLI
      sidecar when configured.
- [ ] Manual verification that `modmux stop` or daemon shutdown stops the
      sidecar Modmux started.
- [ ] Manual verification that `modmux status` shows real usage without
      requiring a separate manual Copilot CLI startup step.
- [ ] `deno task quality`

## Notes

This spec began as the first-class external quota backend work following spec
`023-github-copilot-usage-endpoint`. That first phase is implemented: Modmux can
now connect to a configured external Copilot CLI backend and the status/usage
state mapping is correct.

The next product gap is lifecycle management. Today users still need to start
the headless Copilot CLI server themselves. This updated spec closes that gap by
making the Copilot CLI server a managed sidecar of Modmux.

Validation from the first phase passed for `deno lint`, `deno check`, and
`deno test --allow-all`, while repo-wide `deno fmt --check` remained blocked by
unrelated pre-existing formatting churn elsewhere in the worktree.

Sidecar phase update: Modmux now supports `githubUsage.autoStart` and
`githubUsage.preferredPort`, starts a managed headless Copilot CLI sidecar
during startup, persists sidecar PID/port metadata, resolves the effective
sidecar port for quota lookups, and stops the sidecar during shutdown.
Validation passed for `deno lint`, `deno check`, and `deno test --allow-all`;
`deno task quality` remains blocked by unrelated pre-existing `deno fmt --check`
failures elsewhere in the worktree.
