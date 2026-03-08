# Contract: Copilot HTTP Client

## Overview

This document defines the internal HTTP interface between
`src/copilot/client.ts` and the GitHub Copilot API. This is an **internal**
contract (not exposed to Claude Code), but it is spec-driven per Constitution
Principle VI (Transparency).

---

## Token Exchange

### `GET https://api.github.com/copilot_internal/v2/token`

**Purpose**: Exchange a GitHub OAuth token for a short-lived Copilot API bearer
token.

**Request headers**:

```http
Authorization: token <github_oauth_token>
Accept: application/json
```

**Success response** (HTTP 200):

```json
{
  "token": "tid=abc123xyz;exp=1741392000;sku=...;st=dotcom;ssc=1;chat=1;cit=1;malfil=1;...",
  "expires_at": "2026-03-07T23:30:00Z",
  "refresh_in": 1500
}
```

**Error responses**:

| HTTP Status | Meaning                         | Claudio action                               |
| ----------- | ------------------------------- | -------------------------------------------- |
| 401         | GitHub token invalid or missing | throw `TokenInvalidError`                    |
| 403         | No Copilot subscription         | throw `SubscriptionRequiredError`            |
| 429         | Rate limited                    | throw `RateLimitError`                       |
| 404         | Endpoint unavailable/not found  | retry v1; if still 404, throw `NetworkError` |
| 5xx         | GitHub API unavailable          | throw `NetworkError`                         |

Fallback behavior:

- Claudio tries `GET /copilot_internal/v2/token` first.
- If v2 returns `404`, Claudio retries once with `GET /copilot_internal/token`.
- If both return `404`, Claudio throws `NetworkError` with guidance to verify
  Copilot access/subscription and proxy/network routing.

---

## Chat Completions

### `POST https://api.githubcopilot.com/chat/completions`

**Purpose**: Send a conversation turn to the Copilot model.

**Required headers**:

```http
Authorization: Bearer <copilot_token>
Content-Type: application/json
Editor-Version: vscode/1.96.0
Editor-Plugin-Version: copilot-chat/0.24.0
Copilot-Integration-Id: vscode-chat
openai-intent: conversation-completions
```

**Request body** (non-streaming):

```json
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "max_tokens": 1024,
  "stream": false
}
```

**Request body** (streaming):

```json
{
  "model": "gpt-4.1",
  "messages": [ ... ],
  "max_tokens": 1024,
  "stream": true
}
```

**Success response — non-streaming** (HTTP 200):

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello! How can I help?" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 18,
    "completion_tokens": 7,
    "total_tokens": 25
  }
}
```

**Success response — streaming** (HTTP 200, `Content-Type: text/event-stream`):

```text
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Error responses**:

| HTTP Status | Meaning                       | Anthropic error type                           |
| ----------- | ----------------------------- | ---------------------------------------------- |
| 400         | Malformed request             | `invalid_request_error`                        |
| 401         | Copilot token invalid/expired | `authentication_error` (trigger token refresh) |
| 403         | Access denied                 | `permission_error`                             |
| 429         | Rate limited                  | `rate_limit_error`                             |
| 503         | Service unavailable           | `overloaded_error`                             |

---

## Externally Unchanged Contracts

The following contracts from `003-anthropic-proxy` are **not modified** by this
feature. They remain the stable interface that Claude Code depends on:

- `POST /v1/messages` — see `003-anthropic-proxy/contracts/api.md`
- `POST /v1/messages/count_tokens` — see `003-anthropic-proxy/contracts/api.md`
- SSE event sequence and format — unchanged
