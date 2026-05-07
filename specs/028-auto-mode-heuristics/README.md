---
status: planned
created: 2026-04-23
priority: high
tags:
  - auto-mode
  - routing
  - heuristics
  - model-selection
  - local-only
  - codex
  - cline
depends_on:
  - 027-ollama-fallback
created_at: 2026-04-23T00:00:00.000000Z
updated_at: 2026-04-23T00:00:00.000000Z
---

# Heuristic Auto Model Selection

## Overview

Modmux already resolves requested model names into endpoint-compatible Copilot
models and can retry within a compatible family. What it does not do today is
choose a model on the user's behalf based on the shape of the request.

This spec adds a first-class `auto` mode that performs local heuristic
classification and selects the best Copilot model tier for the request. It is
the first step toward "Copilot Auto for other agents," but remains fully local,
deterministic, and explicit.

Auto mode only applies when the incoming request explicitly selects `auto`. If a
user or agent selects a concrete model, Modmux must preserve that choice.

## Design

### Scope

- Introduce an `auto` request model path for supported agent-facing endpoints.
- Build a heuristic classifier that maps request signals to a model tier.
- Route to a concrete Copilot model based on the selected tier and live
  availability.
- Keep behavior local-only with no external classification service.

### Non-Goals

- Ollama-based classification.
- Self-tuning heuristic weights.
- Overriding explicit user model choices.
- Cross-provider routing beyond the Copilot catalog.

### User Story 1 - Auto Picks a Reasonable Model (Priority: P1)

As a Codex or Cline user, I can select `auto` and let Modmux choose an
appropriate Copilot model instead of manually choosing one for every task.

Acceptance scenarios:

1. Given a request whose model is `auto`, when Modmux classifies the request,
   then it routes to a concrete Copilot model before calling the upstream.
2. Given a request whose model is not `auto`, when Modmux handles the request,
   then existing behavior is unchanged.
3. Given the preferred concrete model for the selected tier is unavailable, when
   Modmux resolves candidates, then it uses the next compatible live model in
   the same tier/family before degrading further.

### User Story 2 - Auto Stays Predictable (Priority: P1)

As a Modmux user, I can understand why Auto chose a model.

Acceptance scenarios:

1. Given Auto mode routed a request, when I inspect logs or status diagnostics,
   then I can see the chosen tier, selected model, and the main heuristic
   signals.
2. Given Auto mode is disabled in config, when a client sends `auto`, then the
   request is rejected clearly or mapped by an explicit compatibility rule,
   rather than silently behaving differently across runs.

### Supported Agents and Endpoints

The initial product target is Codex and Cline first.

- Codex should be able to send `model = "auto"` through the OpenAI-compatible
  path.
- Cline support depends on whether the client can preserve the configured model
  value at request time rather than forcing a fixed hardcoded model. If not,
  this phase should keep Cline as a follow-up rather than inventing brittle
  hacks.
- Claude Code support is explicitly deferred because its current config path is
  session-oriented and not yet a clean fit for request-level model switching.

### Classification Contract

The heuristic engine should produce a stable internal shape so later phases can
swap in Ollama-based classification without changing the router contract.

```ts
export interface AutoClassification {
  complexity: "trivial" | "simple" | "moderate" | "complex";
  reasoningDepth: "none" | "low" | "medium" | "high";
  recommendedTier: "haiku" | "sonnet" | "opus";
  confidence: number;
  signals: string[];
}
```

### Heuristic Signals

Initial heuristic inputs should come only from request-local and session-local
data Modmux already sees or can derive cheaply:

- prompt length / token count (see Tier Mapping for concrete ranges)
- request endpoint (`/responses` may imply more agentic work than a simple chat)
- presence and count of tools
- count of input messages
- presence of keywords such as `refactor`, `design`, `migrate`, `plan`, `fix`,
  `typo`, `test`
- recent retry count for the same session/request path if available

Signals should be deterministic and explainable. Avoid repo scanning or large
background analysis in this phase.

### Tier Mapping

Heuristics should target a tier, not a hardcoded single model:

- `haiku`: low-latency, low-complexity tasks (≤100 tokens, ≤2 messages,
  typo/simple-fix keywords)
- `sonnet`: default balanced tier (100–1000 tokens, ≤5 messages, moderate
  keywords or tools count ≤2)
- `opus`: high-complexity or high-reasoning tasks (>1000 tokens, >5 messages,
  refactor/design/migrate keywords, tools count >2)

When the preferred concrete model for a selected tier is unavailable, degrade
up-tier (haiku→sonnet→opus) rather than down-tier. If all models unavailable,
return a clear error rather than guessing.

Concrete model selection should still use live Copilot model metadata and the
existing model resolver patterns where possible.

### Configuration

Extend config with an `autoRouting` section:

```ts
export interface AutoRoutingConfig {
  enabled: boolean;
  preference: "balanced" | "speed" | "quality";
  logDecisions: boolean;
}
```

Default behavior:

- `enabled: false`
- `preference: "balanced"`
- `logDecisions: true`

When `enabled` is `false`, requests specifying `auto` should fail with error:
`400 Bad Request: "auto" model selection is not enabled. Set MODMUX_AUTO_ROUTING_ENABLED=true to activate.`

This provides clear guidance for debugging and configuration.

## Plan

- [ ] Extend request handling to recognize `model: "auto"` on supported
      endpoints.
- [ ] Add config and validation for Auto routing.
- [ ] Implement a deterministic heuristic classifier module with a stable output
      contract.
- [ ] Map heuristic tiers to concrete Copilot candidate sets.
- [ ] Integrate Auto routing into the existing model resolution path without
      changing non-Auto behavior.
- [ ] Add observability for Auto decisions in logs and status diagnostics.
- [ ] Add tests for supported and unsupported agent paths, explicit-model
      preservation, and tier degradation behavior.
- [ ] Document how users enable Auto and which agents support it.

## Test

- [ ] Unit tests for heuristic classification and tier mapping.
- [ ] Contract tests for `model: "auto"` on supported OpenAI-compatible
      endpoints.
- [ ] Regression tests proving explicit model choices bypass Auto logic.
- [ ] Tests for disabled-Auto behavior and unsupported client paths.
- [ ] Manual verification with Codex using `auto`.
- [ ] `deno task quality`

## Notes

- This phase should reuse the existing `model-resolver.ts` and live `/models`
  metadata wherever possible instead of introducing a second routing system.
- Keep the product promise narrow: "Auto for clients that can send `auto` at
  request time." Do not imply full Claude Code support until that path is
  designed explicitly.
- The output contract is intentionally aligned with a future Ollama classifier
  phase.
- **Spec 27 Coordination**: If all preferred Copilot models are unavailable
  (rare), consider whether fallback to Ollama (spec 27) should apply. This is
  deferred to a follow-up phase to keep scope clean. For now, return error.
- **Spec 30 Coordination**: Cost awareness (spec 30) must track the Auto tier
  selected (`modelTier: "haiku"|"sonnet"|"opus"`). Ensure CostSnapshot includes
  this field for Auto-routed requests.
