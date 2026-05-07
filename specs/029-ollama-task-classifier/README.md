---
status: planned
created: 2026-04-23
priority: high
tags:
  - auto-mode
  - ollama
  - classification
  - heuristics
  - learning
  - local-only
depends_on:
  - 028-auto-mode-heuristics
created_at: 2026-04-23T00:00:00.000000Z
updated_at: 2026-04-23T00:00:00.000000Z
---

# Ollama-Powered Task Classification

## Overview

Heuristic Auto routing provides a deterministic baseline, but it will always be
limited by hand-written rules. Modmux can become meaningfully smarter if it can
ask a small local model to classify the request before choosing a Copilot model.

This spec adds an optional Ollama-backed classifier for Auto mode. If a local
classification model is configured and available, Modmux uses it to classify the
task. If not, Modmux falls back to the heuristic classifier from the previous
phase.

All classification stays local. No prompt or telemetry leaves the user's machine
except the normal Copilot request that Modmux already proxies.

## Design

### Scope

- Let the user choose an Ollama model for task classification.
- Use Ollama classification only when Auto mode is active.
- Fall back cleanly to heuristics when the classifier is unavailable.
- Persist local-only comparison data so heuristics can be improved later.

### Non-Goals

- Automatically choosing the user's Ollama classifier model.
- Sending classification data to a cloud service.
- End-user-visible online training or model fine-tuning.
- Cross-provider request routing.

### User Story 1 - Smarter Auto When Local AI Is Available (Priority: P1)

As a Modmux user who runs Ollama locally, I can let a small local model classify
my task so Auto routing picks better Copilot models than heuristics alone.

Acceptance scenarios:

1. Given Auto mode is enabled and a classifier model is configured, when Ollama
   is reachable, then Modmux requests a classification before selecting the
   Copilot model.
2. Given the classifier request fails or times out, when Modmux continues, then
   it falls back to heuristics and still serves the user request.
3. Given Auto mode is not active, when a normal request is processed, then no
   classifier call is made.

### User Story 2 - Local-Only Learning Data (Priority: P1)

As a privacy-conscious Modmux user, I can benefit from improved heuristics over
time without any data leaving my machine.

Acceptance scenarios:

1. Given both heuristic and Ollama classifications are available, when Modmux
   records the decision, then the data is stored locally only.
2. Given local decision history exists, when future heuristic tuning is added,
   then it can consume the existing local artifacts without requiring a schema
   migration to a cloud-backed store.

### Classifier Contract

The Ollama classifier must return the same shape as the heuristic classifier so
the router remains implementation-agnostic:

```ts
export interface AutoClassification {
  complexity: "trivial" | "simple" | "moderate" | "complex";
  reasoningDepth: "none" | "low" | "medium" | "high";
  recommendedTier: "haiku" | "sonnet" | "opus";
  confidence: number;
  signals: string[];
}
```

The parser must validate the returned structure strictly. If the model returns
invalid JSON or missing fields, Modmux should log the issue and fall back to
heuristics.

### Classification Prompt Inputs

The classifier should only receive context that is valuable to task complexity
classification and already visible to Modmux or cheaply derived from the
request:

- endpoint type
- prompt excerpt or normalized prompt text (first 500 chars only, redact API
  keys/tokens)
- number of messages
- approximate token count
- presence and count of tools
- optional recent retry count

The prompt should avoid including secrets, auth headers, or unnecessary raw
history. Keep the classification context minimal and bounded.

**Example Prompt Structure**:

```
Classify this coding task for model tier selection.
Endpoint: /v1/responses
Prompt: "Refactor my auth module to use JWT instead of sessions"
Tokens: ~850
Messages: 3
Tools: 2
Retries: 0

Respond with JSON: {"complexity": "moderate"|"simple"|etc, "reasoningDepth": "low"|"medium"|etc, "recommendedTier": "haiku"|"sonnet"|"opus", "confidence": 0.85, "signals": [...]}
```

### Configuration

Extend `autoRouting` with classifier-specific options:

```ts
export interface AutoRoutingConfig {
  enabled: boolean;
  preference: "balanced" | "speed" | "quality";
  logDecisions: boolean;
  classifierModel: string | null;
  classifierTimeoutMs: number;
  localDecisionLogPath: string | null;
}
```

Default behavior:

- `classifierModel: null`
- `classifierTimeoutMs: 1500`
- `localDecisionLogPath: ~/.modmux/auto-decisions.jsonl`

If `classifierModel` is `null`, Auto uses heuristics only.

**Recommended Classifier Models**:

- Phi-3 (4B, good speed/accuracy tradeoff)
- Mistral 7B (GGUF format for Ollama)
- Any >7B parameter model with good instruction-following.

**Timeout Behavior**: If classifier takes >1500ms, fail-fast (do not wait) and
return heuristic classification. Do not retry classifier to avoid cascading
latency.

### Local Decision Logging

When both heuristic and Ollama classifications are available, Modmux should
append to a local JSONL file (one JSON object per line):

```jsonl
{"timestamp": "2026-04-23T00:00:00.000Z", "endpoint": "/v1/responses", "heuristic": {"recommendedTier": "sonnet", "confidence": 0.62}, "classifier": {"recommendedTier": "opus", "confidence": 0.85}, "selectedModel": "claude-opus-4-6"}
```

**Location**: `~/.modmux/auto-decisions.jsonl` (or configurable via
`localDecisionLogPath`).

**File Permissions**: Set to `0600` (read/write owner only) to protect request
patterns.

**Retention**: Keep the most recent 1000 entries. Rotate daily if log exceeds
10MB.

This phase only records data. It does not automatically rewrite heuristic
weights yet. The product value is immediate smarter routing plus future tuning
headroom.

## Plan

- [ ] Extend Auto routing config for classifier model, timeout, and local
      decision log path.
- [ ] Add Ollama model discovery support for user-facing validation and status.
- [ ] Implement an Ollama classifier client with strict JSON parsing and
      timeouts.
- [ ] Reuse the heuristic output contract and add fallback behavior on any
      classifier failure.
- [ ] Add local-only decision logging for heuristic vs. classifier comparison.
- [ ] Surface classifier readiness in `modmux status`.
- [ ] Add tests for valid classification, invalid JSON, timeout fallback, and
      local log persistence.
- [ ] Document configuration and privacy behavior.

## Test

- [ ] Unit tests for classifier response validation and fallback behavior.
- [ ] Integration tests for decision logging and status readiness.
- [ ] Manual verification with an installed user-selected Ollama model.
- [ ] Manual verification with classifier unavailable: heuristics still work.
- [ ] `deno task quality`

## Notes

- Keep the classifier module separate from Ollama fallback routing. They are two
  different responsibilities even though they both talk to Ollama.
- This phase prepares the ground for future heuristic tuning, but deliberately
  stops short of automatic weight mutation so the initial rollout remains easy
  to reason about and test.
- The local decision log is part of the product promise: smarter over time, but
  still private.
- **Spec 27 Coordination**: Both specs use `gateway/src/ollama/` module. The
  shared client should handle dual use cases: fallback requests (which may be
  any endpoint type) AND classification requests (which follow a fixed prompt
  shape). Design interfaces so both can coexist without interference.
- **Logging Consistency**: Use same structured log fields as spec 27 where
  applicable (request_id, duration_ms). Add classifier-specific fields:
  `classifier_model`, `classifier_confidence`, `classification_latency_ms`.
