---
status: complete
created: 2026-03-16
priority: medium
tags:
- proxy
- streaming
- usage
- tokens
- anthropic
- openai
- claude-code
- cline
- codex
created_at: 2026-03-16T11:32:42.956761Z
updated_at: 2026-03-16T11:43:24.235442Z
completed_at: 2026-03-16T11:43:24.235442Z
transitions:
- status: complete
  at: 2026-03-16T11:43:24.235442Z
---

# Usage Data Translation Layer

## Overview

Token usage (input/output counts) is currently reported as `0` across all
streaming API paths. GitHub Copilot only sends usage data in a final SSE chunk
_after_ the last content chunk, so our proxy never captures it. Non-streaming
paths correctly translate usage; streaming paths do not. This spec adds accurate
streaming usage propagation and extended usage fields so that Claude Code,
Cline, and Codex CLI can display real token counts.

## Problem

- `message_start.usage.input_tokens` is hardcoded to `0` in all streaming paths
- `message_delta.usage.output_tokens` is hardcoded to `0` in all streaming paths
- Extended fields expected by Anthropic clients (`cache_read_input_tokens`,
  `cache_creation_input_tokens`) are absent from `Usage`
- Extended fields expected by OpenAI clients
  (`prompt_tokens_details.cached_tokens`,
  `completion_tokens_details.reasoning_tokens`) are absent from `OpenAIUsage`
- The Responses API (`/v1/responses`) streaming path lacks
  `input_tokens_details` and `output_tokens_details` in the `response.completed`
  event

## Requirements

- [x] **R-001** Streaming `message_start.usage.input_tokens` MUST be non-zero —
      populated via a pre-stream token estimate using the existing
      `countTokens()` estimator
- [x] **R-002** Streaming `message_delta.usage.output_tokens` MUST reflect the
      actual completion token count returned by Copilot in its final usage SSE
      chunk
- [x] **R-003** `chatStream` in `src/copilot/client.ts` MUST always send
      `stream_options: { include_usage: true }` to the Copilot API to enable the
      final usage chunk
- [x] **R-004** `chatStream` MUST defer `emitDone` until after the Copilot usage
      chunk is received (i.e., not call `emitDone` immediately upon
      `finish_reason`, but wait for the post-content usage chunk or `[DONE]`)
- [x] **R-005** `countTokens()` in `src/server/copilot.ts` MUST accept a full
      `ProxyRequest` (including `system` field) so system-prompt tokens are
      included in the pre-estimate
- [x] **R-006** `ProxyResponse.usage` / `Usage` type MUST include optional
      `cache_read_input_tokens?: number` and
      `cache_creation_input_tokens?: number` (always `0` since Copilot exposes
      no cache data)
- [x] **R-007** `OpenAIUsage` MUST include
      `prompt_tokens_details?: { cached_tokens: number }` and
      `completion_tokens_details?: { reasoning_tokens: number }` (always `0`)
- [x] **R-008** `anthropicToOpenAI()` in `src/server/openai-translate.ts` MUST
      include `prompt_tokens_details` and `completion_tokens_details` in the
      non-streaming response
- [x] **R-009** `anthropicStreamEventToOpenAI()` MUST emit a final SSE usage
      chunk
      (`{ choices: [], usage: { prompt_tokens, completion_tokens, total_tokens } }`)
      when the `message_delta` event carries a non-null `usage`
- [x] **R-010** `toResponsesBody()` in `src/server/responses-handler.ts` MUST
      include `input_tokens_details: { cached_tokens: 0 }` and
      `output_tokens_details: { reasoning_tokens: 0 }`

## Non-Goals

- Cost calculation or billing display
- Per-session usage aggregation or persistence
- Accurate tiktoken-compatible token counting (char/4 estimator is acceptable
  for display)
- Usage metrics for the Responses API streaming path (it buffers internally;
  non-streaming `chat()` already provides accurate counts)

## Technical Notes

### How Copilot Reports Usage in Streaming

Copilot conforms to the OpenAI streaming spec. When
`stream_options.include_usage` is set, it emits a final JSON chunk **after** the
`finish_reason` chunk and before `data: [DONE]`:

```
data: {"id":"...","choices":[{"delta":{},"finish_reason":"stop","index":0}]}

data: {"id":"...","choices":[],"usage":{"prompt_tokens":42,"completion_tokens":18,"total_tokens":60}}

data: [DONE]
```

The current code calls `emitDone` as soon as it sees `finish_reason`, so the
usage chunk is never read.

### How Anthropic Clients Expect Usage

**Non-streaming** (`POST /v1/messages`):

```json
{
  "usage": {
    "input_tokens": 42,
    "output_tokens": 18,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0
  }
}
```

**Streaming** - Claude Code reads two events:

- `message_start` -> `message.usage.input_tokens` (estimate on stream open)
- `message_delta` -> `usage.output_tokens` (actual on stream close)

### How OpenAI Clients Expect Usage

**Non-streaming** (`POST /v1/chat/completions`):

```json
{
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 18,
    "total_tokens": 60,
    "prompt_tokens_details": { "cached_tokens": 0 },
    "completion_tokens_details": { "reasoning_tokens": 0 }
  }
}
```

**Streaming** - Cline and Codex CLI expect a final usage chunk (empty
`choices[]`, populated `usage`) before `data: [DONE]`. This is standard OpenAI
`stream_options.include_usage` behavior.

### How Codex CLI (`/v1/responses`) Expects Usage

The `response.completed` event payload includes:

```json
{
  "usage": {
    "input_tokens": 42,
    "output_tokens": 18,
    "total_tokens": 60,
    "input_tokens_details": { "cached_tokens": 0 },
    "output_tokens_details": { "reasoning_tokens": 0 }
  }
}
```

### Affected Files

| File                                  | Change                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `src/server/types.ts`                 | Extend `Usage`, `OpenAIUsage`, `OpenAIStreamChunk`, `OpenAIChatRequest` |
| `src/copilot/types.ts`                | Mirror: `stream_options` on request, `usage?` on stream chunk           |
| `src/server/copilot.ts`               | Accept `ProxyRequest` in `countTokens()`; update `messagesToText`       |
| `src/copilot/client.ts`               | Always send `stream_options`; pre-count; defer `emitDone`               |
| `src/server/openai-translate.ts`      | Emit final usage SSE chunk; add extended fields                         |
| `src/server/responses-handler.ts`     | Add `input/output_tokens_details` to `toResponsesBody`                  |
| `tests/unit/streaming-usage_test.ts`  | New: end-to-end streaming usage assertions                              |
| `tests/unit/openai-translate_test.ts` | Extend: extended-fields + streaming usage chunk                         |
| `tests/contract/openai-proxy_test.ts` | Extend: streaming usage chunk and extended fields                       |

## Implementation Plan

### Phase 1 - Type Additions (parallel)

**1a. `src/server/types.ts`**

- Add `stream_options?: { include_usage?: boolean }` to `OpenAIChatRequest`
- Add `usage?: OpenAIUsage` to `OpenAIStreamChunk`
- Extend `OpenAIUsage` with `prompt_tokens_details?` and
  `completion_tokens_details?`
- Extend `Usage` with `cache_read_input_tokens?` and
  `cache_creation_input_tokens?`

**1b. `src/copilot/types.ts`** (parallel with 1a)

- Add `stream_options?: { include_usage?: boolean }` to `OpenAIChatRequest`
- Add `usage?: OpenAIUsage` to `OpenAIStreamChunk`

### Phase 2 - Token Pre-estimation

**`src/server/copilot.ts`**

- Update `countTokens()` signature: accept `ProxyRequest` (adds `system`
  support)
- Update `messagesToText()` to prepend system text if present
- Update call-site in `src/server/messages-handler.ts` to pass the full request

### Phase 3 - Streaming Fix in `src/copilot/client.ts` (depends on 1 + 2)

Three coordinated changes inside `chatStream`:

1. **Request**: Add `stream_options: { include_usage: true }` to the body
2. **Pre-count**: Call `countTokens(request)` before the fetch; pass estimated
   `input_tokens` to `emitHeader` so `message_start` is non-zero
3. **Defer `emitDone`**: When `finish_reason` arrives, store as
   `pendingStopReason` instead of calling `emitDone` immediately. Parse
   remaining chunks. When a usage chunk arrives (`choices` empty, `usage`
   present) capture `prompt_tokens` and `completion_tokens`. Call `emitDone`
   with actual `output_tokens` when `[DONE]` is seen or stream ends.

### Phase 4 - OpenAI Streaming Usage in `src/server/openai-translate.ts` (depends on 3)

- Add `usage?` to `StreamState` interface
- In `anthropicStreamEventToOpenAI`, on `message_delta` with `event.usage` set:
  - Store usage on `state.usage`
  - After emitting the stop chunk, emit a final usage SSE chunk:
    `{ choices: [], usage: { prompt_tokens, completion_tokens, total_tokens } }`

### Phase 5 - Extended Fields (parallel, depends on 1)

- **`src/copilot/client.ts`**: Add
  `cache_read_input_tokens: 0, cache_creation_input_tokens: 0` to
  `ProxyResponse.usage` in both `chat()` and `chatStream()` paths
- **`src/server/openai-translate.ts`**: Add `prompt_tokens_details` and
  `completion_tokens_details` to `anthropicToOpenAI()` usage output
- **`src/server/responses-handler.ts`**: Add `input_tokens_details` and
  `output_tokens_details` to `toResponsesBody()`

### Phase 6 - Tests (depends on 2-5)

- **`tests/unit/streaming-usage_test.ts`** (new): Mock Copilot SSE with final
  usage chunk; assert `message_start.input_tokens` is non-zero; assert
  `message_delta.output_tokens` matches the usage chunk value
- **`tests/unit/openai-translate_test.ts`** (extend): Assert
  `anthropicStreamEventToOpenAI` emits a final usage chunk; assert
  `anthropicToOpenAI` includes extended fields
- **`tests/contract/openai-proxy_test.ts`** (extend): Streaming ends with usage
  chunk; non-streaming includes `completion_tokens_details`

## Acceptance Criteria

1. `/v1/messages` (streaming): `message_start.message.usage.input_tokens` is
   non-zero for any non-trivial request
2. `/v1/messages` (streaming): `message_delta.usage.output_tokens` equals the
   actual tokens reported by Copilot in its final SSE usage chunk
3. `/v1/messages` (non-streaming): response `usage` includes
   `cache_read_input_tokens` and `cache_creation_input_tokens` (both `0`)
4. `/v1/chat/completions` (streaming): last `data:` line before `[DONE]` is a
   JSON chunk with empty `choices[]` and populated `usage` object
5. `/v1/chat/completions` (non-streaming): `usage` includes
   `prompt_tokens_details` and `completion_tokens_details`
6. `/v1/responses` (non-streaming + streaming): `response.completed.usage`
   includes `input_tokens_details` and `output_tokens_details`
7. `deno task quality` passes (lint + fmt + check + all tests)
8. Claude Code shows non-zero token counts in its status bar / session summary
   after a proxied request

## Design Decisions

- `stream_options.include_usage: true` is always sent internally by `chatStream`
  regardless of what the client requests — safe because clients that don't want
  usage will ignore the extra chunk
- `message_start.input_tokens` uses the local char/4 estimator (~+/-10% for
  typical text), which is accurate enough for display. Copilot's actual
  `prompt_tokens` arrives later in `message_delta` and overwrites the estimate
  in clients that read both events
- All extended stub fields are `0` — Copilot exposes no cache or reasoning token
  data
- Responses API streaming already buffers internally (non-streaming `chat()`
  call), so its `response.completed` usage is accurate without streaming changes
  — only extended fields need adding
- A tiktoken-compatible estimator upgrade is explicitly deferred to a follow-on
  spec