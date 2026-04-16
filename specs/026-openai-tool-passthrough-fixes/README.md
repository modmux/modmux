---
title: "OpenAI Tool Passthrough Fixes"
status: pending
created: "2026-04-16"
---

# OpenAI Tool Passthrough Fixes

## Specification

### Background

Modmux supports OpenAI-compatible endpoints for clients such as Codex while
routing to Anthropic-compatible provider calls internally. The current
translation path drops tool-related data in multiple places, especially on
`/v1/responses` and `/v1/chat/completions`.

This causes failures where clients receive `finish_reason: "tool_calls"` (or
similar terminal signals) but do not receive actionable tool call payloads.

### Problem Statement

The OpenAI compatibility layer currently has tool-drop gaps in request intake,
request translation, response translation, and streaming event mapping.

Confirmed drop classes:

- Top-level `tools` and `tool_choice` from responses requests are not fully
  preserved end-to-end.
- `role: "tool"` messages are skipped in OpenAI to Anthropic translation.
- Non-streaming Anthropic `tool_use` blocks are not emitted as OpenAI
  `tool_calls`.
- Streaming `input_json_delta` and tool block events are dropped in
  OpenAI-compatible streaming output.
- `/v1/responses` stream mapping currently favors text-only output and can lose
  tool-only turns.

### Goals

- Preserve tool definitions and tool choice from OpenAI-compatible requests.
- Preserve tool result turns (`role: "tool"`) across translation boundaries.
- Emit tool calls in both non-streaming and streaming OpenAI-compatible
  responses.
- Keep text-only behavior backward compatible.
- Keep native Anthropic `/v1/messages` behavior unchanged.

### Non-Goals

- Removing OpenAI to Anthropic translation.
- Redesigning endpoint contracts beyond tool passthrough.
- Changing provider model selection behavior.

### User Scenarios & Testing

#### User Story 1 - Codex Receives Tool Calls (Priority: P1)

As a Codex user on `/v1/responses`, I can receive and execute tool calls
(`apply_patch`, etc.) because tool payloads are preserved end-to-end.

Acceptance scenarios:

1. Given a request with function tools on `/v1/responses` (non-streaming), when
   the model emits tool use, then the OpenAI-compatible response includes
   concrete tool call payloads.
2. Given a streaming `/v1/responses` request, when the model emits tool
   arguments incrementally, then stream events include tool argument deltas and
   tool call structure.
3. Given a tool-only turn, when the response completes, then clients receive an
   actionable tool signal rather than empty text-only output.

#### User Story 2 - Chat Completions Preserves Tool Behavior (Priority: P1)

As an OpenAI-compatible chat client on `/v1/chat/completions`, I can use tools
without losing tool calls or tool results during translation.

Acceptance scenarios:

1. Given a request with `tools` and `tool_choice`, when translated to provider
   format, then both fields are preserved.
2. Given an assistant `tool_use` response (non-streaming), when translated back,
   then `tool_calls` are present.
3. Given streaming tool deltas, when translated back, then tool call deltas are
   emitted and parsable.

#### User Story 3 - Native Anthropic Path Remains Stable (Priority: P2)

As a native Anthropic client on `/v1/messages`, I do not experience behavior
changes from these fixes.

Acceptance scenarios:

1. Given existing `/v1/messages` tool flows, when this change is deployed, then
   behavior remains unchanged.
2. Given text-only `/v1/messages` requests, when processed, then output remains
   equivalent to pre-change behavior.

### Technical Specification

#### Scope

Implement additive fixes in gateway translation layers and responses stream
mapping, with targeted tests.

Target areas:

- OpenAI responses request typing and passthrough.
- OpenAI to Anthropic request translation for tools and tool results.
- Anthropic to OpenAI non-streaming translation for `tool_use`.
- Anthropic to OpenAI streaming translation for tool block lifecycle and
  `input_json_delta`.
- `/v1/responses` stream event mapping to preserve tool semantics.

#### Implementation Plan

Phase 1 - Request Intake

- Extend OpenAI responses request type to accept `tools` and `tool_choice`.
- Forward these fields from `/v1/responses` handler into shared translation.

Phase 2 - Request Translation

- Map OpenAI tools into Anthropic tool schema.
- Normalize OpenAI `tool_choice` values to Anthropic equivalents.
- Convert `role: "tool"` messages to Anthropic `tool_result` content blocks.

Phase 3 - Non-Streaming Response Translation

- Convert Anthropic `tool_use` content blocks into OpenAI `tool_calls` on
  assistant messages.
- Preserve existing finish reason mapping and token usage fields.

Phase 4 - Streaming Translation and Responses SSE

- Track tool block start events and indexes.
- Convert `input_json_delta` chunks into OpenAI-compatible tool argument deltas.
- Ensure `/v1/responses` SSE output includes actionable tool events, including
  tool-only turns.

Phase 5 - Tests and Compatibility

- Add regression tests for each confirmed drop class.
- Verify text-only requests remain unchanged for responses and chat completions.
- Verify `/v1/messages` remains unaffected.

### Affected Files

Primary:

- `gateway/src/types.ts`
- `gateway/src/openai-translate.ts`
- `gateway/src/responses-handler.ts`
- `gateway/src/chat-handler.ts`

Reference behavior:

- `providers/src/client.ts`

Tests:

- `tests/**` (new and updated translation and handler tests)

### Risks & Mitigation

| Risk                                       | Likelihood | Impact | Mitigation                                                                          |
| ------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------- |
| Streaming shape differences break clients  | Medium     | High   | Keep event structure backward compatible and add fixture tests for Codex-like flows |
| Tool choice normalization mismatch         | Medium     | Medium | Define explicit mapping rules and test edge values                                  |
| Regression in text-only output             | Low        | High   | Add before/after assertions for text-only requests in both endpoints                |
| Unexpected impact on native `/v1/messages` | Low        | Medium | Treat `/v1/messages` as control path and run dedicated regression tests             |

### Rollout and Validation

- Land fixes behind normal PR review with focused translation tests.
- Validate with:
  - `/v1/responses` non-streaming tool call scenario
  - `/v1/responses` streaming tool delta scenario
  - `/v1/chat/completions` streaming and non-streaming tool scenarios
  - `/v1/messages` unchanged behavior checks

### Success Metrics

- Tool call payload appears whenever tool-use finish reason is emitted on
  OpenAI-compatible endpoints.
- Streaming tool argument chunks are emitted and reconstructable by clients.
- No regressions in text-only outputs or token usage fields.
- No functional changes on native `/v1/messages` route.

### Timeline

- Spec and review: same day.
- Implementation: 1 to 2 days.
- Test hardening and follow-up fixes: 1 day.
