---
status: planned
created: 2026-04-23
priority: high
tags:
- auto-mode
- model-selection
- acp-boundary
- claude-code
- codex
- openai
- anthropic
depends_on:
- 027-ollama-fallback
created_at: 2026-04-23T00:00:00Z
updated_at: 2026-06-03T01:21:09.853194Z
---
# Agent-Aware Auto Model Arbitration (Claude + Codex)

## Overview

Modmux should support Copilot-style `model: "auto"` for Claude Code and Codex while preserving endpoint-native tool-calling contracts. The core design is a shared internal model-arbitration layer (ACP-inspired) that selects a concrete live Copilot model, followed by existing OpenAI/Anthropic proxy handlers for request/response translation.

This keeps Auto selection centralized and deterministic without rewriting tool orchestration.

## Requirements

- [ ] Add a shared model-catalog layer that reads live Copilot models/capabilities and exposes a synthetic `auto` option.
- [ ] Implement deterministic Auto arbitration (`auto` -> tier -> concrete model) using request-local signals only.
- [ ] Preserve explicit model behavior: non-`auto` requests must follow current resolution behavior.
- [ ] Keep tool-calling contracts endpoint-native:
  - OpenAI `/v1/responses` and `/v1/chat/completions` keep existing OpenAI tool/event shapes.
  - Anthropic `/v1/messages` keeps Anthropic tool_use/tool_result shapes.
- [ ] Add agent-aware surface negotiation using caller hints plus endpoint context, with endpoint semantics as source of truth.
- [ ] Add `autoRouting` config controls with rollout guardrails (global enable + per-endpoint toggles/kill switch).
- [ ] Define and enforce catalog staleness behavior (TTL + stale-on-error fallback).
- [ ] Define exact failure behavior when Auto cannot resolve a model (stable 4xx/5xx mapping and messages).
- [ ] Add diagnostics/logging that include requested model, selected model, strategy, and decision reason codes.
- [ ] Update configure defaults so Codex prefers `model = "auto"`; only add Claude default-model config when client field is confirmed stable/supported.

## Non-Goals

- Full ACP protocol integration or replacing existing endpoint handlers.
- Cross-surface tool translation through ACP.
- External classifier services or self-tuning heuristics.
- Broad client-specific routing based primarily on user-agent strings.

## Technical Notes

### Architecture boundary

Use an ACP-like internal boundary for model arbitration only:

`selectModel(context) -> { modelId, strategy, reasons[] }`

Then execute through existing endpoint-specific handlers:

- OpenAI paths: `openai-handler-utils.ts`, `responses-handler.ts`, `chat-handler.ts`
- Anthropic path: `messages-handler.ts`

### Agent-aware surface matrix (phase 1)

- Claude Code: Anthropic `/v1/messages` primary, OpenAI endpoints optional passthrough if requested.
- Codex: OpenAI `/v1/responses` and `/v1/models` primary.
- Unknown callers: endpoint-driven behavior only; do not reject based on unknown user-agent.

### Safety defaults

- Auto disabled by default unless explicitly enabled.
- Deterministic fallback order by endpoint capability + family/tier.
- If no compatible model is available, return explicit error (no silent remap to unrelated families).

## Acceptance Criteria

- [ ] `GET /v1/models` includes live Copilot models and a synthetic `auto` entry.
- [ ] `model: "auto"` works on `/v1/responses`, `/v1/chat/completions`, and `/v1/messages` per endpoint support rules.
- [ ] Explicit model requests are unchanged versus baseline behavior.
- [ ] Under `model: "auto"`, tool payloads/stream events remain endpoint-native (OpenAI vs Anthropic unchanged).
- [ ] Auto decision logs include deterministic reason codes and selected candidates.
- [ ] Kill switch disables Auto behavior without code rollback.
- [ ] Stale catalog behavior is stable during transient `/models` failures.

## Plan

- [ ] Build shared model catalog and synthetic `auto` exposure.
- [ ] Implement Auto arbitration module and strategy/reason outputs.
- [ ] Wire arbitration into OpenAI and Anthropic request paths.
- [ ] Add config schema and rollout/staleness/failure policies.
- [ ] Update Codex/Claude configuration writers for Auto defaults (with Claude gating).
- [ ] Add tests and docs.

## Test

- [ ] Unit tests: arbitration heuristics, fallback ordering, failure/staleness policies.
- [ ] Unit tests: ACP-boundary behavior (model selection only, no tool-shape mutation).
- [ ] Contract tests: `model: "auto"` on `/v1/responses`, `/v1/chat/completions`, `/v1/messages`.
- [ ] Contract tests: `GET /v1/models` includes synthetic `auto` plus live models.
- [ ] Integration tests: `configureAgent(codex)` defaults to `model = "auto"`.
- [ ] Integration tests: Claude config writer preserves existing settings and only applies supported Auto default fields.
- [ ] `deno task quality`

## Dependencies

- Depends on: `027-ollama-fallback` (existing)
- Coordinates with: `030-cost-aware-status` for tier-aware reporting fields.
