# Implementation Plan: Remove Copilot SDK — Direct HTTP Integration

**Branch**: `004-remove-copilot-sdk` | **Date**: 2026-03-07 | **Spec**:
`/specs/004-remove-copilot-sdk/spec.md` **Input**: Feature specification from
`/specs/004-remove-copilot-sdk/spec.md`

## Summary

Replace all usage of `@github/copilot-sdk` (which spawns a CLI binary over
JSON-RPC) with direct HTTPS calls to the GitHub Copilot API using Deno's
built-in `fetch`. The migration introduces a new `src/copilot/` module that owns
token exchange, caching, and OpenAI-format chat completions. The
Anthropic-facing proxy API (`/v1/messages`) is unchanged; only the internal
implementation changes.

## Technical Context

**Language/Version**: Deno (latest stable) + TypeScript **Primary
Dependencies**: Deno std/http (existing), native `fetch` (built-in — no new
deps) **Storage**: In-memory only for Copilot token cache; disk token store
unchanged **Testing**: `deno test`, contract tests in `tests/contract/` **Target
Platform**: macOS, Linux, Windows (local machine) **Project Type**: CLI with
embedded HTTP proxy **Performance Goals**: Latency equal to or better than SDK
(no CLI spawn overhead) **Constraints**: Zero new external runtime dependencies;
must pass `deno task quality` **Scale/Scope**: Single-user local proxy; one
active Copilot token at a time

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **VII (Self-Containment)**: ✅ This feature directly satisfies Principle VII —
  removes SDK and CLI dependency; all Copilot communication via stable HTTP
  interface
- **VI (Transparency)**: ✅ All request/response transformations are documented
  in `research.md` and `data-model.md`; `contracts/copilot-http.md` defines the
  HTTP contract
- **I (Minimalism)**: ✅ New `src/copilot/` module is narrow — token exchange,
  cache, HTTP client only; no new configuration surfaces
- **III (Predictability)**: ✅ Stateless HTTP calls; deterministic token refresh
  logic
- **IV (Separation of Concerns)**: ✅ `src/copilot/` handles Copilot comms;
  `src/server/` handles Anthropic API surface — concerns remain separated
- **VIII (Contract Testing)**: ✅ Contract tests required for new
  `src/copilot/client.ts` and updated `src/server/copilot.ts`
- **IX (Quality Gates)**: ✅
  `deno lint && deno fmt --check && deno check && deno test` must pass; SDK
  removal must not require `patch:copilot-sdk` workaround

_Post-design re-check_: All gates pass. No new external dependencies.
Anthropic-facing contract is unchanged. SDK is fully removed.

## Project Structure

### Documentation (this feature)

```text
specs/004-remove-copilot-sdk/
├── plan.md                   # This file
├── spec.md                   # Feature specification
├── research.md               # Phase 0: API endpoints, mappings, decisions
├── data-model.md             # Phase 1: new entities + mapping rules
├── quickstart.md             # Phase 1: dev guide
├── contracts/
│   └── copilot-http.md       # Copilot HTTP API contract
└── tasks.md                  # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── copilot/                  # NEW module — direct Copilot HTTP client
│   ├── types.ts              # NEW: OpenAI request/response/stream types
│   ├── token.ts              # NEW: token exchange + in-memory cache
│   ├── client.ts             # NEW: fetch-based chat completions wrapper
│   └── mod.ts                # NEW: module exports
├── server/
│   └── copilot.ts            # REWRITE: use src/copilot/client.ts, remove SDK
├── cli/
│   └── auth.ts               # UPDATE: remove CopilotClient import; use HTTP probe
└── auth/
    └── copilot.ts            # KEEP: DeviceFlowState type (used by token store)

scripts/
└── patch_copilot_sdk.ts      # DELETE

tests/
└── contract/
    ├── copilot_client_test.ts  # NEW: contract tests for src/copilot/client.ts
    └── proxy_test.ts           # UPDATE: ensure existing tests pass without SDK

deno.json                     # UPDATE: remove SDK import + patch task
```

**Structure Decision**: Single project. New `src/copilot/` module cleanly
separates Copilot HTTP concerns from the server and CLI layers. Existing
structure is preserved.

## Complexity Tracking

> No constitution violations. No complexity justification required.
