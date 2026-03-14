# Tasks: Anthropic-Compatible API Proxy

**Feature**: 002-anthropic-proxy\
**Date**: 2026-02-28\
**Spec**: `/specs/002-anthropic-proxy/spec.md`

## Overview

Build a local HTTP server that exposes Anthropic-compatible endpoints
(`/v1/messages`, `/v1/messages/count_tokens`) which proxy requests to the GitHub
Copilot SDK.

## Implementation Strategy

**MVP Scope**: User Story 1 - Core proxy functionality (non-streaming messages)\
**Delivery**: Incremental - each user story phase is independently testable

## Dependencies

```
User Story 1 (P1) ──┬──> User Story 2 (P1)
                    │        │
User Story 3 (P2) ─┘        │
         │                   │
         └───────────────────┘
   (Error handling can be added at any point)
```

All user stories depend on Setup and Foundational phases completing first.

## Phase 1: Setup

Project initialization and dependency setup.

- [x] T001 Create src/server/ directory structure per implementation plan
- [x] T002 [P] Install @github/copilot-sdk npm package in deno.json imports
- [x] T003 Configure Deno permissions for network access in deno.json

## Phase 2: Foundational

Core types and infrastructure required before implementing user stories.

- [x] T004 [P] Create API types in src/server/types.ts
- [x] T005 [P] Create request validation functions in src/server/types.ts
- [x] T006 Create Copilot SDK client wrapper in src/server/copilot.ts
- [x] T007 [FR-005] Create request transformation logic in
      src/server/transform.ts
- [x] T007a [P] Create server lifecycle module in src/server/server.ts

## Phase 3: User Story 1 - Claude Code Connection (P1)

Core proxy functionality: /v1/messages endpoint, non-streaming and streaming

**Goal**: Claude Code can send messages and receive responses

**Independent Test**: Start server, POST to /v1/messages, verify
Anthropic-formatted response

- [x] T008 [US1] Implement HTTP router in src/server/router.ts
- [x] T009 [US1] Implement /v1/messages endpoint handler in src/server/router.ts
- [x] T010 [US1] Implement non-streaming response transformation in
      src/server/transform.ts
- [x] T011 [US1] Implement SSE streaming response in src/server/router.ts
- [x] T012 [US1] Implement /v1/messages/count_tokens endpoint in
      src/server/router.ts
- [x] T013 [US1] Integrate proxy server with CLI in src/cli/main.ts
- [x] T014 [P] [US1] Run quality gates: deno lint && deno fmt --check && deno
      check

## Phase 4: User Story 2 - Server Lifecycle (P1)

Lazy start, graceful shutdown, resource cleanup

**Goal**: Server starts on first request, stops cleanly on signal

**Independent Test**: Start CLI, verify server not running, send request, verify
server starts, send signal, verify clean shutdown

- [x] T015 [US2] Implement lazy server start in src/server/server.ts
- [x] T016 [US2] Add signal handlers for graceful shutdown in
      src/server/server.ts
- [x] T017 [US2] Add port configuration via CLAUDIO_PORT env var in
      src/server/server.ts
- [x] T018 [P] [US2] Run quality gates: deno lint && deno fmt --check && deno
      check

## Phase 5: User Story 3 - Error Handling (P2)

Anthropic-compatible error responses

**Goal**: All error cases return proper Anthropic error format

**Independent Test**: Send invalid requests, verify 400/503/504 with correct
error format

- [x] T019 [US3] Implement request validation with error responses in
      src/server/router.ts
- [x] T020 [US3] Implement Copilot SDK unavailable handler (503) in
      src/server/router.ts
- [x] T021 [US3] Implement request timeout handler (504) in src/server/router.ts
- [x] T022 [P] [US3] Run quality gates: deno lint && deno fmt --check && deno
      check

## Phase 6: Contract Tests (Per Constitution VI)

Verify API contracts for each user story per Constitution VI

- [x] T023 [P] [US1] Create contract tests for /v1/messages endpoint in
      tests/contract/proxy_test.ts
- [x] T024 [P] [US1] Test non-streaming and streaming responses
- [x] T025 [P] [US2] Test server lifecycle (lazy start, shutdown) in
      tests/contract/server_test.ts
- [x] T026 [P] [US3] Test error response formats in tests/contract/error_test.ts
- [x] T027 Run all contract tests: deno test tests/contract/

## Phase 7: Polish

Cross-cutting concerns and final integration

- [x] T028 Update CLI --help to document server mode
- [ ] T029 Run full quality gates: deno lint && deno fmt --check && deno check
      && deno test

---

## Summary

| Metric             | Value |
| ------------------ | ----- |
| Total Tasks        | 29    |
| Setup Phase        | 3     |
| Foundational Phase | 5     |
| User Story 1       | 7     |
| User Story 2       | 4     |
| User Story 3       | 4     |
| Contract Tests     | 5     |
| Polish Phase       | 2     |

## Parallel Opportunities

| Tasks             | Reason                        |
| ----------------- | ----------------------------- |
| T002, T003        | Independent dependency config |
| T004, T005        | Independent type definitions  |
| T006, T007, T007a | Independent modules           |
| T008, T009        | Router builds on types        |
| T011, T012        | Independent endpoints         |
| T013, T014        | Integration after endpoints   |
| T023-T026         | Tests can run in parallel     |

## Independent Test Criteria

- **US1**: POST /v1/messages returns Anthropic-formatted response
- **US2**: Server starts on first request, stops on SIGTERM
- **US3**: Invalid requests return 400/503/504 with Anthropic error format
