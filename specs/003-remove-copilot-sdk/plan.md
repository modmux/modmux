## Plan

### Summary

Replace all usage of `@github/copilot-sdk` (which spawns a CLI binary over
JSON-RPC) with direct HTTPS calls to the GitHub Copilot API using Deno's
built-in `fetch`. The migration introduces a new `src/copilot/` module that owns
token exchange, caching, and OpenAI-format chat completions. The
Anthropic-facing proxy API (`/v1/messages`) is unchanged; only the internal
implementation changes.

### Project Structure

#### Documentation (this feature)

```text
specs/003-remove-copilot-sdk/
├── plan.md                   # This file
├── README.md                   # Feature specification
├── research.md               # Phase 0: API endpoints, mappings, decisions
├── DATA_MODEL.md             # Phase 1: new entities + mapping rules
├── quickstart.md             # Phase 1: dev guide
├── CONTRACTS.md
│   └── copilot-http.md       # Copilot HTTP API contract
└── tasks.md                  # Phase 2 output (/lean-spec tasks)
```

#### Source Code (repository root)

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

### Complexity Tracking

> No constitution violations. No complexity justification required.
