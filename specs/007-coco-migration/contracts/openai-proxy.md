# Contract: OpenAI-Compatible Proxy Endpoints

**Feature**: `007-coco-migration` | **Phase**: 1

Coco exposes two OpenAI-compatible endpoints alongside the existing Anthropic
endpoints. All endpoints are served on `http://127.0.0.1:{port}` (default 11434).

---

## POST /v1/chat/completions

### Request

```
POST /v1/chat/completions HTTP/1.1
Content-Type: application/json
Authorization: Bearer <any-non-empty-string>
```

```jsonc
{
  "model": "gpt-4o",               // required; looked up in modelMap before forwarding
  "messages": [                    // required
    { "role": "system",    "content": "You are a helpful assistant." },
    { "role": "user",      "content": "Hello" },
    { "role": "assistant", "content": "Hi!" },  // optional history
    { "role": "user",      "content": "How are you?" }
  ],
  "stream": false,                 // optional, default false
  "temperature": 1.0,             // optional, 0.0–2.0
  "max_tokens": 4096              // optional
}
```

### Non-Streaming Response (200 OK)

```jsonc
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion",
  "created": 1699564865,
  "model": "gpt-4o",               // echo back the Copilot model ID used
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  },
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "I'm doing well!" },
    "finish_reason": "stop"        // "stop" | "length" | "content_filter"
  }]
}
```

### Streaming Response (200 OK, `stream: true`)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"I'm"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" doing well!"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1699564865,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### Error Responses

| HTTP | Condition | Body |
|---|---|---|
| 400 | Invalid/missing required field | `{"error":{"message":"...","type":"invalid_request_error","code":"invalid_value"}}` |
| 401 | Missing or empty Authorization header | `{"error":{"message":"Unauthorized","type":"authentication_error","code":"invalid_api_key"}}` |
| 429 | Copilot rate limit exhausted (after 3 retries) | `{"error":{"message":"Rate limit exceeded","type":"requests","code":"rate_limit_exceeded"}}` |
| 503 | Copilot API unavailable | `{"error":{"message":"Service unavailable","type":"api_error","code":"service_unavailable"}}` |
| 504 | Copilot API timeout | `{"error":{"message":"Request timed out","type":"api_error","code":"request_timeout"}}` |

---

## GET /v1/models

Returns the list of available Copilot model IDs in OpenAI format.

### Response (200 OK)

```jsonc
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1699564865,
      "owned_by": "github-copilot"
    },
    {
      "id": "claude-3.5-sonnet",
      "object": "model",
      "created": 1699564865,
      "owned_by": "github-copilot"
    }
    // ... all models returned by the Copilot models API
  ]
}
```

---

## GET /health

### Response (200 OK)

```json
{ "status": "ok" }
```

No authentication required.

---

## Model Name Translation

Before forwarding any request to Copilot, Coco resolves the model name:

```
effective_model = modelMap[requested_model] ?? requested_model
```

The `modelMap` is the merge of `DEFAULT_MODEL_MAP` (bundled in `src/agents/models.ts`)
and `CocoConfig.modelMap` (user overrides from `~/.coco/config.json`). User entries win.

---

## Copilot → OpenAI Translation Notes

| Copilot concept | OpenAI wire format |
|---|---|
| Completion text chunk | `choices[0].delta.content` |
| Stop reason `"stop"` | `finish_reason: "stop"` |
| Stop reason `"length"` | `finish_reason: "length"` |
| Prompt/completion token counts | `usage.prompt_tokens`, `usage.completion_tokens` |
| Copilot model ID | echoed as `model` in response |
| Request ID | prefixed as `"chatcmpl-"` + UUID |
