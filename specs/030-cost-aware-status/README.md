---
status: planned
created: 2026-04-23
priority: medium
tags:
  - cost
  - status
  - usage
  - observability
  - cli
  - local-only
depends_on:
  - 019-usage-metrics-and-codex-integration
  - 023-github-copilot-usage-endpoint
created_at: 2026-04-23T00:00:00.000000Z
updated_at: 2026-04-23T00:00:00.000000Z
---

# Cost-Aware Status and Usage Display

## Overview

Modmux already tracks token usage, request counts, latency, and GitHub Copilot
quota state. What it does not currently provide is a user-facing cost-oriented
view that helps developers understand what their recent requests are consuming.

This spec adds cost-aware status reporting built on existing usage and quota
infrastructure. The product goal is not exact billing parity with every GitHub
plan detail. It is actionable visibility inside a local tool that otherwise runs
behind the scenes.

## Design

### Scope

- Add a local cost model for recent requests and aggregate status display.
- Extend usage metrics to persist the dimensions needed for cost summaries.
- Show cost-oriented information in `modmux status` and, if appropriate,
  `GET /v1/usage`.
- Keep calculations transparent and labeled as estimates when plan-specific
  billing precision is unavailable.

### Non-Goals

- Full GitHub billing reconciliation.
- Team or organization chargeback.
- Cloud billing integrations.
- Historical analytics beyond the local runtime snapshot/persistence model.

### User Story 1 - See What Recent Requests Cost (Priority: P1)

As a Modmux user, I can run `modmux status` and see an estimate of what my
recent traffic is costing or consuming so I do not have to guess blindly.

Acceptance scenarios:

1. Given Modmux has proxied requests with usage data, when I run
   `modmux status`, then I see a recent cost estimate or equivalent premium
   usage estimate.
2. Given no cost data is yet available, when I run `modmux status`, then output
   stays clear and does not show misleading zeros as if they were real billing
   facts.
3. Given Modmux cannot confidently estimate dollars for the configured plan,
   when it shows consumption, then it labels the number as an estimate or shows
   the lower-level premium-usage metric instead.

### User Story 2 - Understand Which Models Consume the Most (Priority: P2)

As a Modmux user, I can see which models are driving my usage so I know whether
Auto routing or explicit model choices are too expensive.

Acceptance scenarios:

1. Given multiple models have been used, when I inspect status or usage output,
   then I can see per-model recent usage counts and relative cost contribution.
2. Given Auto routing selected a model, when I inspect cost-aware diagnostics,
   then the concrete model actually used is included in the accounting.

### Calculation Strategy

Modmux should support two layers of reporting:

1. **Primary**: usage-unit reporting grounded in data Modmux already knows well
   (tokens, request counts, premium request usage where available).
2. **Secondary**: dollar estimates derived from a versioned local pricing table
   or multiplier table when the mapping is sufficiently stable to be helpful.

If GitHub plan variability makes dollar output misleading, the implementation
should prefer premium usage estimates over fake precision.

**Token Counting Approach**: Use OpenAI's `tiktoken` library for consistent
token counting across all input/output. For multi-turn conversations, sum input
tokens + output tokens per request, then aggregate.

**Pricing Table Management**:

- Store pricing in `gateway/src/pricing/models.json` (versioned alongside
  Modmux).
- Version schema:
  `{version: "1.0.0", models: {[modelName]: {inputCostPer1kTokens, outputCostPer1kTokens}}, lastUpdated}}`.
- If pricing file >30 days old, degrade to premium-units reporting and warn in
  logs.
- Currency: USD only in initial phase. Future phases can add multi-currency
  support.

### Data Model Extensions

Existing usage metrics currently aggregate requests, endpoint counts, models,
agents, and GitHub quota snapshots. This phase may extend the snapshot with a
small additive shape such as:

```ts
interface CostSnapshot {
  recentRequests: {
    model: string;
    modelTier: string; // "haiku" | "sonnet" | "opus" for Auto-routed requests
    modelActual: string; // final model after fallback (if applicable)
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd?: number;
    premiumUnits?: number;
    at: string;
  }[];
  totals: {
    estimatedCostUsd?: number;
    premiumUnits?: number;
  };
}
```

Retention: Keep last 100 requests or 7 days of data, whichever is shorter. Older
entries are rotated out to keep memory bounded.

**Auto-Routed Request Tracking**: Record both the Auto tier and the actual model
selected. If fallback occurs, record both selected and fallback attempts
separately for transparency in cost attribution.

### Status Output

The status view should stay concise and operationally useful. Example direction:

```text
Usage:        847/1000 requests (84.7%)
Recent cost:  estimated $0.34 across last 25 requests
Top models:   gpt-4-1 (62%), claude-sonnet-4-5 (31%)
Fallbacks:    2 Ollama fallbacks in last 100 requests
```

If only premium-unit reporting is trustworthy:

```text
Usage:        847/1000 requests (84.7%)
Recent cost:  18.3 premium units across last 25 requests
Top models:   claude-sonnet-4-5 (65%), claude-haiku-4-5 (35%)
```

**When Auto is Active**: Include tier breakdowns:

```text
Auto routing: haiku (15%), sonnet (70%), opus (15%) across 20 recent requests
```

**Machine-Readable Format**: Support `modmux status --json` to return full
CostSnapshot for downstream tooling.

### Configuration

Add a small opt-in cost display config:

```ts
export interface CostDisplayConfig {
  enabled: boolean;
  recentRequestLimit: number;
  preferCurrency: boolean;
}
```

Default behavior:

- `enabled: true`
- `recentRequestLimit: 25`
- `preferCurrency: false`

`preferCurrency: false` keeps the default conservative until pricing confidence
is good enough.

## Plan

- [ ] Extend usage metrics with a bounded recent-request cost ledger.
- [ ] Define a versioned local pricing/multiplier table or premium-unit mapping.
- [ ] Add cost estimation helpers that degrade gracefully when precision is low.
- [ ] Update `modmux status` formatting to include recent cost summaries.
- [ ] Optionally extend `/v1/usage` with additive cost fields.
- [ ] Add tests for no-data, estimate-available, and premium-units-only cases.
- [ ] Document what the numbers mean and what they do not mean.

## Test

- [ ] Unit tests for bounded ledger behavior and estimation helpers.
- [ ] Status formatting tests for estimate, premium-unit-only, and unavailable
      cases.
- [ ] Contract tests if `/v1/usage` gains additive cost fields.
- [ ] Manual verification that status remains readable with and without cost
      config enabled.
- [ ] `deno task quality`

## Notes

- This phase should not block the Auto-routing roadmap. It is valuable on its
  own and should consume the routing decisions later phases already produce.
- Avoid marketing language that implies exact GitHub billing parity unless the
  implementation can prove it.
- A conservative, clearly labeled estimate is more trustworthy than a highly
  specific but fragile dollar amount.
- **Spec 28 Coordination**: Auto routing (spec 28) must populate `modelTier`
  field in CostSnapshot so cost breakdowns can show "haiku (15%), sonnet (70%),
  opus (15%)" tier distribution. Without this field, Cost awareness cannot
  attribute Auto-routed requests to their tier.
- **Spec 27 Coordination**: Fallback requests (spec 27) should also be tracked
  in cost ledger, with `model: "ollama"` and `modelActual: {configured-model}`.
  This allows status output to show fallback impact on cost.
- **Foundation Dependencies**: Depends on specs 019 (complete) and 023
  (complete). Specs 025-026 (now complete) provide additional context on release
  workflow and tool passthrough, which may affect observability reporting.
