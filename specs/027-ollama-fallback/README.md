---
status: planned
created: 2026-04-23
priority: high
tags:
  - ollama
  - fallback
  - reliability
  - local-models
  - proxy
  - routing
depends_on: []
created_at: 2026-04-23T00:00:00.000000Z
updated_at: 2026-04-23T00:00:00.000000Z
---

# Ollama Fallback Routing

## Overview

Modmux currently routes supported coding agents to GitHub Copilot and retries
within Copilot's model catalog when a specific model is unavailable. When
Copilot returns overload or temporary availability failures, the request still
fails even if the user has a local model runtime available.

This spec adds a first-class local fallback path through Ollama so Modmux can
degrade gracefully during Copilot-side outages, transient 503 responses, or
similar short-lived service failures.

The goal is reliability first. This phase does not add intelligent model
selection. It only defines when Modmux may fall back to a configured local
Ollama model after Copilot has already failed.

## Design

### Scope

- Detect whether an Ollama server is reachable on a configured localhost URL.
- Add configuration for enabling fallback and choosing a fallback Ollama model.
- Use Ollama only after qualifying Copilot failures, not as a primary route.
- Preserve existing Copilot-first behavior when fallback is disabled or Ollama
  is unavailable.
- Surface fallback readiness in `modmux status` and logs.

### Non-Goals

- Task-aware model selection.
- Automatic selection among multiple Ollama models.
- Learning, scoring, or prompt classification.
- Replacing Copilot as the default request path.

### User Story 1 - Survive Copilot Overload (Priority: P1)

As a Modmux user with Ollama running locally, I can keep using my coding agent
when Copilot temporarily fails, because Modmux routes the request to a local
fallback model instead of returning an error immediately.

Acceptance scenarios:

1. Given fallback is enabled and Ollama is healthy, when Copilot returns a
   qualifying 503 or overload response, then Modmux retries the request against
   the configured Ollama model.
2. Given fallback succeeds, when the client receives the response, then it sees
   a protocol-compatible success response rather than the original upstream
   failure.
3. Given fallback is disabled, when Copilot returns the same failure, then
   current behavior is preserved and no Ollama request is attempted.

### User Story 2 - Explicit Local Readiness (Priority: P1)

As a Modmux user, I can tell whether local fallback is ready before I need it.

Acceptance scenarios:

1. Given fallback is enabled and Ollama is reachable, when I run
   `modmux status`, then status includes that local fallback is available.
2. Given fallback is enabled but Ollama is not reachable, when I run
   `modmux status`, then status reports fallback as unavailable without causing
   proxy startup to fail.
3. Given fallback is disabled, when I run `modmux status`, then status does not
   imply that local fallback is active.

### Failure Qualification

Fallback should be limited to failures that indicate temporary Copilot
unavailability rather than invalid requests.

Qualifying failures for the initial version:

- HTTP `503`
- provider errors explicitly labeled overloaded / unavailable
- connection-level failures where the Copilot request did not complete

Non-qualifying failures:

- HTTP `4xx`
- auth failures
- request validation failures
- tool translation or protocol mapping bugs inside Modmux

### Configuration

Extend `gateway/src/store.ts` with a dedicated fallback configuration block:

```ts
export interface OllamaFallbackConfig {
  enabled: boolean;
  baseUrl: string;
  model: string | null;
  healthCheckIntervalMs: number;
  ollamaRequestTimeoutMs: number;
}
```

Default behavior:

- `enabled: false`
- `baseUrl: "http://127.0.0.1:11434"`
- `model: null`
- `healthCheckIntervalMs: 30000`
- `ollamaRequestTimeoutMs: 5000`

If `enabled` is `true` and `model` is `null`, startup should not fail, but
fallback should remain inactive and status should explain why.

**Health Check Strategy**: Health check should run periodically in the
background (every `healthCheckIntervalMs`) using a lightweight endpoint such as
`GET /api/tags`. Result should be cached so repeated status calls do not hammer
Ollama. If health check fails, fallback remains unavailable until next check
succeeds.

### Runtime Shape

Add a small Ollama integration layer under `gateway/src/ollama/` responsible
for:

- health probe (`GET /api/tags` or equivalent lightweight endpoint) with caching
- listing installed models for validation/logging via `GET /api/tags`
- issuing chat/generate requests to the configured Ollama model with timeout
- translating Ollama responses back into the protocol shape expected by the
  current endpoint path

Implementation should prefer a minimal adapter rather than weaving Ollama
details directly into existing Copilot client code.

**Response Translation**: Ollama's response format varies by endpoint. Document
mapping for each supported endpoint (`/v1/messages`, `/v1/chat/completions`,
`/v1/responses`). If translation fails, log the error and return the original
Copilot failure rather than creating a new error.

**Request Timeout**: Ollama requests must not exceed `ollamaRequestTimeoutMs`.
On timeout, treat as fallback unavailable and return original Copilot error
without retry. This prevents cascading latency.

### Routing Rules

- Keep existing Copilot request flow as the primary path.
- Only attempt Ollama after the Copilot path returns a qualifying failure.
- Reuse the already resolved request shape when possible so fallback does not
  re-run unrelated translation logic.
- Emit structured logs when fallback is attempted, skipped, succeeds, or fails.

**Logging Structure**: Use a unified `fallback_stage` field to track
progression: `attempted` → `unavailable` (Ollama not running) / `selected` →
`succeeded` or `failed`. Log format should include: `request_id`,
`copilot_error_code`, `fallback_stage`, `fallback_model`, `outcome`,
`duration_ms`.

### Agent Compatibility

This phase should work for the existing endpoints consumed by supported agents:

- `POST /v1/messages`
- `POST /v1/chat/completions`
- `POST /v1/responses`

If an endpoint cannot be supported cleanly in the initial iteration, the spec
should prefer explicit endpoint-level opt-out rather than partial silent
behavior.

## Plan

- [ ] Add fallback config types, defaults, validation, and env overrides.
- [ ] Add an Ollama health-check and availability module.
- [ ] Add a small Ollama request adapter for supported endpoint paths.
- [ ] Define which Copilot failures qualify for fallback and centralize that
      decision.
- [ ] Integrate fallback into the request path after Copilot failures only.
- [ ] Extend `modmux status` to show fallback enabled/disabled/available state.
- [ ] Add focused unit and contract tests for success, unavailable Ollama,
      qualifying failures, and non-qualifying failures.
- [ ] Document fallback configuration and operational behavior.

## Test

- [ ] `deno test tests/unit/` coverage for config validation and failure
      qualification.
- [ ] Contract tests for `/v1/messages`, `/v1/chat/completions`, and
      `/v1/responses` fallback behavior where supported.
- [ ] Integration test for status output when Ollama is available vs.
      unavailable.
- [ ] Manual verification with Ollama stopped: Modmux startup still succeeds and
      status reports fallback unavailable.
- [ ] Manual verification with Ollama running: qualifying Copilot failure falls
      back successfully to the configured model.
- [ ] `deno task quality`

## Notes

- Keep all fallback data local-only. No external telemetry or cloud dependency
  beyond GitHub Copilot itself.
- Do not weaken the existing design principle that Modmux is predictable and
  explicit. Fallback should be observable in status/logs rather than invisible
  magic.
- This phase intentionally does not introduce an `auto` request model. It is a
  reliability feature that later phases can build on.
- **Spec 29 Coordination**: The Ollama integration layer created here
  (`gateway/src/ollama/`) will be shared with spec 29 (classification). Design
  the module with dual responsibility in mind: fallback routing AND task
  classification. Avoid duplicating Ollama client logic.
- **Spec 28 Coordination**: Auto routing (spec 28) may eventually use fallback
  as part of tier degradation. Ensure fallback logic is endpoint-agnostic and
  reusable by the Auto router.
