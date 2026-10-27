---
status: in-progress
created: 2026-10-27
priority: high
tags:
- codex
- streaming
- bugfix
created_at: 2026-10-27T15:54:45.215713800Z
updated_at: 2026-10-27T15:54:45.215713800Z
---

# Stable Responses Stream Item IDs

## Overview

Codex desktop can render the final reply twice when Copilot changes the output
item ID between streaming and completion. A live `gpt-5.3-codex` request reproduced
distinct IDs in `output_item.added`, every `item_id` event, `output_item.done`, and
`response.completed.output` for `output_index: 0`.

## Requirements

- [x] Keep one output item ID per output index throughout each Responses SSE
  stream, including terminal response output arrays.
- [x] Preserve text, phase, tool call IDs, arguments, usage, ordering, and
  termination events.
- [x] Preserve compliant streams and non-streaming responses; handle chunked
  UTF-8, LF/CRLF/CR framing, multiline data, and cancellation.
- [x] Add failing-then-passing contract regressions.
- [ ] Complete repository quality verification.

## Implementation

`gateway/src/responses-stream.ts` normalizes successful SSE bodies in the gateway,
retaining the first ID observed for each output index with state per request.
The native Responses proxy remains in place. No text or lifecycle events are
deduplicated; `call_id` is never rewritten.

Live verification after the fix showed the same canonical ID in all events and
the completed response snapshot. The desktop UI itself has not been retested.

## Validation

Contract coverage includes the captured identity drift, separate items with
identical text, tool calls, incomplete responses, byte-split UTF-8, compliant
passthrough, malformed events, headers, incremental delivery, and cancellation.

`deno task quality` was attempted but stops at pre-existing formatting failures
(142 files, predominantly CRLF line endings, plus existing site indentation).
Repository lint, explicit full type checking, and formatting of changed files
pass. The full test suite passes: 237 passed, 0 failed, 19 ignored, including
all seven new contract tests. Spec validation passes. The quality checklist
remains open for the existing repository formatting failures.

## References

- [Codex app-server](https://developers.openai.com/codex/app-server): started item
  IDs match delta item IDs; completed items are authoritative.
- [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events):
  output item lifecycle and item ID references.
