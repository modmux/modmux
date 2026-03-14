# Research: Remove Copilot SDK — Direct HTTP Integration

## Decision: GitHub Copilot Token Exchange Endpoint

**Chosen**: `GET https://api.github.com/copilot_internal/v2/token`

**Rationale**: This is the stable, documented-by-usage endpoint that the Copilot
extension and third-party tools use to exchange a GitHub OAuth token for a
short-lived Copilot API bearer token. The v2 path returns a `refresh_in` field
which allows proactive refresh.

**Request headers**:

```
Authorization: token <github_oauth_token>
Accept: application/json
```

**Response shape**:

```json
{
  "token": "tid=abc123;...",
  "expires_at": "2026-03-07T23:00:00Z",
  "refresh_in": 1500
}
```

- `expires_at`: ISO 8601 UTC timestamp
- `refresh_in`: seconds until refresh is recommended (typically 1500 = 25 min)
- Token should be refreshed when `refresh_in` seconds remain before
  `expires_at`, minus a 60-second safety margin

**Alternatives considered**:

- `GET https://api.github.com/copilot_internal/token` (v1) — no `refresh_in`
  field, deprecated
- Using the GitHub App OAuth token flow — unnecessary complexity;
  `gh auth token` already provides a valid OAuth token

---

## Decision: Chat Completions Endpoint

**Chosen**: `POST https://api.githubcopilot.com/chat/completions`

**Rationale**: Standard OpenAI-compatible endpoint used by all Copilot
integrations. Accepts and returns OpenAI `chat/completions` format. Supports
streaming via SSE.

**Required request headers**:

```
Authorization: Bearer <copilot_token>
Content-Type: application/json
Editor-Version: vscode/1.96.0
Editor-Plugin-Version: copilot-chat/0.24.0
Copilot-Integration-Id: vscode-chat
openai-intent: conversation-completions
```

**Request body** (OpenAI format):

```json
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 1024,
  "stream": false,
  "temperature": 1.0
}
```

**Non-streaming response**:

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Hello there!" },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 3,
    "total_tokens": 15
  }
}
```

**Streaming**: Standard OpenAI SSE format:

```
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"},"index":0}]}

data: {"id":"chatcmpl-...","choices":[{"delta":{"content":" there"},"index":0}]}

data: {"id":"chatcmpl-...","choices":[{"delta":{},"finish_reason":"stop","index":0}]}

data: [DONE]
```

**Alternatives considered**:

- `https://api.individual.githubcopilot.com/github/chat/completions` — newer
  individual plan path, not universally supported; `api.githubcopilot.com`
  covers both plans

---

## Decision: Model Listing for Token Validation

**Chosen**: Use the token exchange endpoint as a liveness probe for
`validateToken`

**Rationale**: Attempting to exchange the stored GitHub OAuth token for a
Copilot token is an implicit validation: if it succeeds (HTTP 200), the token is
valid and the user has a Copilot subscription. This replaces
`CopilotClient.listModels()` with a single `GET` call using only `fetch`.

**Alternatives considered**:

- `GET https://api.githubcopilot.com/models` — requires the Copilot token (two
  requests); no benefit over using the exchange endpoint as a probe
- Keeping `listModels()` from the SDK — violates Principle VII

---

## Decision: Anthropic → OpenAI Message Mapping

**Chosen**: Prepend `system` as a `{ role: "system" }` message; pass
`messages[]` as-is

**Rationale**: The Copilot API accepts OpenAI's `messages[]` format directly.
Claudio's `ProxyRequest` maps cleanly:

```
ProxyRequest.system  →  { role: "system", content: system }  (prepended)
ProxyRequest.messages[]  →  messages[]  (role/content preserved)
```

**Old approach (removed)**: Messages were flattened into a prompt string
(`"System: ...\n\nUser: ...\n\nAssistant: ..."`). This was lossy and
non-standard.

---

## Decision: OpenAI → Anthropic Response Mapping

**Non-streaming**:

```
choices[0].message.content  →  content[0].text
finish_reason "stop"         →  stop_reason "end_turn"
finish_reason "length"       →  stop_reason "max_tokens"
usage.prompt_tokens          →  usage.input_tokens
usage.completion_tokens      →  usage.output_tokens
```

**Streaming** (per OpenAI SSE chunk → Anthropic SSE events):

```
First chunk (has no content delta)  →  message_start + content_block_start
Each chunk with delta.content       →  content_block_delta (text_delta)
Last chunk (finish_reason set)      →  content_block_stop + message_delta + message_stop
data: [DONE]                        →  (consumed; triggers message_stop flush if not yet sent)
```

---

## Decision: In-Memory Copilot Token Cache

**Chosen**: Module-level singleton with an expiry check on every access

**Rationale**: The Copilot token is short-lived (25 min typical) and scoped to a
single Claudio process invocation. In-memory cache avoids disk writes and keeps
`src/copilot/token.ts` stateless from the file system's perspective. The GitHub
OAuth token (long-lived) continues to be stored on disk via the existing
`TokenStore`.

**Cache invalidation strategy**:

- Refresh when `Date.now() >= expiresAt - 60_000` (60-second safety margin)
- The `refresh_in` field from the API response is the primary signal

---

## Key HTTP Error Mappings

| Copilot API HTTP status | Scenario                     | Anthropic error type                             |
| ----------------------- | ---------------------------- | ------------------------------------------------ |
| 401                     | Invalid/expired GitHub token | `authentication_error` → `TokenInvalidError`     |
| 403                     | No Copilot subscription      | `permission_error` → `SubscriptionRequiredError` |
| 429                     | Rate limited                 | `rate_limit_error` → `RateLimitError`            |
| 503                     | Copilot unavailable          | `overloaded_error`                               |

---

## Files Affected

| File                           | Action      | Reason                                                 |
| ------------------------------ | ----------- | ------------------------------------------------------ |
| `src/copilot/types.ts`         | **Create**  | OpenAI request/response/stream types                   |
| `src/copilot/token.ts`         | **Create**  | Token exchange + in-memory cache                       |
| `src/copilot/client.ts`        | **Create**  | Direct HTTP wrapper for chat completions               |
| `src/copilot/mod.ts`           | **Create**  | Module exports                                         |
| `src/server/copilot.ts`        | **Rewrite** | Replace SDK session with HTTP client calls             |
| `src/cli/auth.ts`              | **Update**  | Replace `CopilotClient.listModels()` with HTTP probe   |
| `src/auth/copilot.ts`          | **Update**  | Remove `DeviceFlowState` if unused after migration     |
| `deno.json`                    | **Update**  | Remove SDK import map entry + `patch:copilot-sdk` task |
| `scripts/patch_copilot_sdk.ts` | **Delete**  | No longer needed                                       |
