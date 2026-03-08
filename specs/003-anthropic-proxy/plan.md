# Implementation Plan: Anthropic-Compatible API Proxy

**Branch**: `003-anthropic-proxy` | **Date**: 2026-02-28 | **Spec**:
`/specs/003-anthropic-proxy/spec.md` **Input**: Feature specification from
`/specs/003-anthropic-proxy/spec.md`

## Summary

Build a local HTTP server that exposes Anthropic-compatible endpoints
(`/v1/messages`, `/v1/messages/count_tokens`) which proxy requests to the GitHub
Copilot SDK. This enables Claude Code to use GitHub Copilot models as if
connecting to the Anthropic API.

## Technical Context

**Language/Version**: Deno (latest stable) + TypeScript\
**Primary Dependencies**: @github/copilot-sdk, Deno std/http\
**Storage**: N/A (stateless proxy)\
**Testing**: Deno test, Contract tests\
**Target Platform**: Local machine (macOS/Linux/Windows)\
**Project Type**: CLI with embedded HTTP server\
**Performance Goals**: <100ms latency per request, streaming support\
**Constraints**: Must be compatible with Claude Code API expectations\
**Scale/Scope**: Single user local proxy

## Constitution Check

_Gate: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **VII (Quality Gates)**: ✅ Will use `deno lint`, `deno fmt`, `deno check`,
  `deno test`
- **VI (Contract Testing)**: ✅ Will create contract tests for API endpoints
- **I (Minimalism)**: ✅ Only proxy functionality, no additional features
- **III (Predictability)**: ✅ Stateless, explicit transformations

## Project Structure

### Documentation (this feature)

```text
specs/003-anthropic-proxy/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # API contract
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── main.ts          # CLI entry point (exists)
│   ├── auth.ts          # Auth module (exists)
├── server/
│   ├── mod.ts           # NEW: Server exports
│   ├── server.ts        # NEW: Server lifecycle
│   ├── router.ts        # NEW: HTTP routing
│   ├── transform.ts     # NEW: Request/response transformation
│   ├── copilot.ts      # NEW: Copilot SDK wrapper
│   └── types.ts         # NEW: API types

tests/
├── contract/
│   ├── cli_test.ts      # (exists)
│   ├── proxy_test.ts    # NEW: API contract tests
│   ├── server_test.ts   # NEW: Lifecycle tests
│   └── error_test.ts   # NEW: Error handling tests
```

**Structure Decision**: Single project with CLI + embedded HTTP server. Adding
`src/server/` for proxy components.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation              | Why Needed                               | Simpler Alternative Rejected Because   |
| ---------------------- | ---------------------------------------- | -------------------------------------- |
| HTTP server complexity | Required to receive Claude Code requests | Cannot proxy without network interface |
