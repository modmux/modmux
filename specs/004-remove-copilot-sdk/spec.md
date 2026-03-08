# Feature Specification: Remove Copilot SDK — Direct HTTP Integration

**Feature Branch**: `004-remove-copilot-sdk` **Created**: 2026-03-07 **Status**:
Draft **Input**: User description: "migrate away from the copilot sdk"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Direct Copilot HTTP Communication (Priority: P1)

Claudio communicates with the GitHub Copilot API over plain HTTPS using native
`fetch`, with no SDK or CLI binary involved. The proxy exchanges a GitHub OAuth
token for a short-lived Copilot API token and calls
`https://api.githubcopilot.com/chat/completions` directly, using the standard
OpenAI-compatible request format.

**Why this priority**: This is the core constitutional requirement (Principle
VII — Self-Containment). The entire SDK dependency must be removed. Everything
else in this feature follows from this.

**Independent Test**: Start the proxy, send a `POST /v1/messages` request, and
verify that no Copilot CLI binary is spawned and no `@github/copilot-sdk` import
is resolved.

**Acceptance Scenarios**:

1. **Given** a valid GitHub OAuth token is stored, **When** a `/v1/messages`
   request arrives, **Then** Claudio exchanges the token at the Copilot token
   endpoint, calls `https://api.githubcopilot.com/chat/completions`, and returns
   an Anthropic-formatted response.
2. **Given** a cached Copilot token that has not expired, **When** a request
   arrives, **Then** Claudio reuses the cached token without re-exchanging.
3. **Given** a Copilot token that is within 60 seconds of expiry, **When** a
   request arrives, **Then** Claudio proactively refreshes the token before
   forwarding the request.
4. **Given** streaming is requested (`"stream": true`), **When** the Copilot API
   streams OpenAI-style SSE chunks, **Then** Claudio re-encodes them as
   Anthropic SSE events in real time.

---

### User Story 2 - Token Exchange and Caching (Priority: P1)

Claudio owns a thin in-process token cache for the short-lived Copilot API
token. The GitHub OAuth token (already stored on disk) is exchanged once per
session; the resulting Copilot token is held in memory and refreshed
automatically.

**Why this priority**: Required to support US1 — without the token exchange, no
HTTP calls to the Copilot API can be authenticated.

**Independent Test**: Call the exchange function twice in quick succession;
verify only one outbound HTTP call is made to the token endpoint.

**Acceptance Scenarios**:

1. **Given** no cached Copilot token, **When** `getToken()` is called, **Then**
   one `GET` request is made to
   `https://api.github.com/copilot_internal/v2/token` and the result is cached
   in memory.
2. **Given** a cached Copilot token with more than 60 seconds until expiry,
   **When** `getToken()` is called, **Then** the cached token is returned with
   no HTTP call.
3. **Given** a Copilot token that has expired, **When** `getToken()` is called,
   **Then** a fresh exchange is performed and the new token is cached.

---

### User Story 3 - Token Validation Without SDK (Priority: P2)

`validateToken` in `src/cli/auth.ts` currently calls
`CopilotClient.listModels()` to probe whether the stored GitHub token is
accepted by Copilot. This must be replaced with a direct HTTP probe using the
Copilot token exchange endpoint.

**Why this priority**: Removes the last SDK import from `src/cli/auth.ts`.

**Independent Test**: Call `validateToken` with a known-good token; verify no
CopilotClient is constructed and the function returns `true`.

**Acceptance Scenarios**:

1. **Given** a valid GitHub OAuth token, **When** `validateToken` is called,
   **Then** it exchanges the token at the Copilot endpoint and returns `true` on
   HTTP 200.
2. **Given** an invalid or expired GitHub token, **When** `validateToken` is
   called, **Then** the exchange returns a non-200 response and `validateToken`
   returns `false`.

---

### User Story 4 - SDK and Patch Script Removal (Priority: P2)

All SDK imports, the `patch_copilot_sdk.ts` script, and the `patch:copilot-sdk`
task are removed from the project. `deno.json` no longer references
`@github/copilot-sdk`.

**Why this priority**: Constitution Principle VII — no runtime dependency on
SDK/CLI.

**Independent Test**: `grep -r "@github/copilot-sdk" src/ tests/ deno.json`
returns no matches.

**Acceptance Scenarios**:

1. **Given** the migration is complete, **When**
   `grep -r "@github/copilot-sdk" src/ deno.json` is run, **Then** zero matches
   are returned.
2. **Given** the migration is complete, **When** `deno task quality` is run
   without `node_modules/` present, **Then** it passes without errors.
3. **Given** the `scripts/patch_copilot_sdk.ts` file is deleted, **When**
   `deno task dev` is run, **Then** it starts normally without a patching step.

---

### Edge Cases

- What happens when the GitHub OAuth token is missing or expired when
  `getToken()` is called? → Throw `TokenExpiredError` or `TokenInvalidError`
  (reuse existing error types).
- What happens when the Copilot token endpoint returns 403 (no subscription)? →
  Throw `SubscriptionRequiredError`.
- What happens when the Copilot chat endpoint returns a non-200 status? → Return
  an Anthropic-formatted error response with appropriate HTTP status.
- What if the streaming connection drops mid-response? → Close the SSE stream
  and emit a `message_stop` event.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Claudio MUST exchange a GitHub OAuth token for a Copilot API token
  via `GET https://api.github.com/copilot_internal/v2/token`.
- **FR-002**: The Copilot token MUST be cached in memory and reused until 60
  seconds before its `expires_at` timestamp. When fewer than 60 seconds remain,
  a fresh exchange MUST be performed before the next request. (The `refresh_in`
  field is stored for future proactive-refresh use but is not the primary
  cache-invalidation signal.)
- **FR-003**: Chat requests MUST be sent to
  `https://api.githubcopilot.com/chat/completions` in OpenAI-compatible format
  using native `fetch`.
- **FR-004**: Streaming MUST use the OpenAI SSE format on the outbound side and
  the Anthropic SSE format on the inbound side (to Claude Code); `data: [DONE]`
  terminates the outbound stream.
- **FR-005**: Anthropic `messages[]` (with optional `system`) MUST be mapped to
  an OpenAI `messages[]` array (system prompt as a `{ role: "system" }` entry
  prepended).
- **FR-006**: OpenAI `choices[0].message.content` MUST be mapped back to
  Anthropic `content[0].text`; `finish_reason` MUST be mapped to `stop_reason`.
- **FR-007**: `validateToken` MUST use the Copilot token exchange endpoint as a
  liveness probe instead of `CopilotClient.listModels()`.
- **FR-008**: `@github/copilot-sdk` MUST be removed from `deno.json` imports.
- **FR-009**: `scripts/patch_copilot_sdk.ts` MUST be deleted.
- **FR-010**: The `patch:copilot-sdk` task MUST be removed from `deno.json`.
- **FR-011**: All outbound requests to the Copilot API MUST include the required
  headers: `Editor-Version`, `Editor-Plugin-Version`, `Copilot-Integration-Id`.

### Key Entities

- **CopilotToken**: Short-lived token returned by the exchange endpoint
  (`token: string`, `expires_at: string`, `refresh_in: number`).
- **OpenAIChatRequest**: OpenAI-format request sent to the Copilot API (`model`,
  `messages[]`, `max_tokens`, `stream`, `temperature`, `top_p`).
- **OpenAIChatResponse**: OpenAI-format response from the Copilot API (`id`,
  `choices[]`, `usage`).
- **OpenAIStreamChunk**: Single SSE chunk from the Copilot API (`id`,
  `choices[0].delta.content`, `choices[0].finish_reason`).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero references to `@github/copilot-sdk` in `src/`, `tests/`, or
  `deno.json`.
- **SC-002**: `scripts/patch_copilot_sdk.ts` does not exist.
- **SC-003**: `deno task quality` passes with no SDK present in `node_modules/`.
- **SC-004**: Proxy latency is unchanged or improved (no CLI process spawn
  overhead).
- **SC-005**: All existing contract tests (`cli_test.ts`, `error_test.ts`,
  `server_test.ts`) pass without modification. `proxy_test.ts` may require minor
  updates to remove any remaining SDK stubs (the `stopClient` import is
  intentionally preserved as a no-op).
- **SC-006**: Streaming and non-streaming paths both work end-to-end.
