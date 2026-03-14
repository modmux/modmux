# Data Model: Remove Copilot SDK — Direct HTTP Integration

## New Entities

### CopilotToken

Short-lived bearer token returned by the GitHub Copilot token exchange endpoint.
Held in memory only; never persisted to disk.

| Field     | Type   | Description                                                              |
| --------- | ------ | ------------------------------------------------------------------------ |
| token     | string | Bearer token value (`tid=...`)                                           |
| expiresAt | number | Expiry as milliseconds since epoch (parsed from `expires_at` ISO string) |
| refreshIn | number | Seconds until refresh recommended (from `refresh_in`)                    |

**Validation rules**:

- `token` must be non-empty string
- `expiresAt` must be a future timestamp
- `refreshIn` must be a positive integer

---

### OpenAIMessage

A single message in the OpenAI messages array sent to the Copilot chat endpoint.

| Field   | Type                                    | Description    |
| ------- | --------------------------------------- | -------------- |
| role    | `"system"` \| `"user"` \| `"assistant"` | Message author |
| content | string                                  | Message text   |

---

### OpenAIChatRequest

Request body sent to `POST https://api.githubcopilot.com/chat/completions`.

| Field       | Type            | Required | Description                                                |
| ----------- | --------------- | -------- | ---------------------------------------------------------- |
| model       | string          | Yes      | Copilot model ID (e.g. `"gpt-4.1"`, `"claude-sonnet-4-5"`) |
| messages    | OpenAIMessage[] | Yes      | Conversation including optional system message             |
| max_tokens  | number          | Yes      | Max tokens to generate                                     |
| stream      | boolean         | No       | Enable SSE streaming (default: false)                      |
| temperature | number          | No       | Sampling temperature                                       |
| top_p       | number          | No       | Nucleus sampling                                           |

---

### OpenAIChatResponse

Non-streaming response from
`POST https://api.githubcopilot.com/chat/completions`.

| Field   | Type                | Description                        |
| ------- | ------------------- | ---------------------------------- |
| id      | string              | Completion ID (`chatcmpl-...`)     |
| object  | `"chat.completion"` | Object type                        |
| choices | OpenAIChoice[]      | Always 1 element for Claudio's use |
| usage   | OpenAIUsage         | Token usage counts                 |

### OpenAIChoice

| Field         | Type                             | Description                 |
| ------------- | -------------------------------- | --------------------------- |
| index         | number                           | Always 0                    |
| message       | OpenAIMessage                    | Completed assistant message |
| finish_reason | `"stop"` \| `"length"` \| `null` | Why generation stopped      |

### OpenAIUsage

| Field             | Type   | Description        |
| ----------------- | ------ | ------------------ |
| prompt_tokens     | number | Input token count  |
| completion_tokens | number | Output token count |
| total_tokens      | number | Sum                |

---

### OpenAIStreamChunk

A single SSE chunk from the streaming Copilot API response.

| Field   | Type                      | Description                                         |
| ------- | ------------------------- | --------------------------------------------------- |
| id      | string                    | Completion ID (same for all chunks in one response) |
| object  | `"chat.completion.chunk"` | Object type                                         |
| choices | OpenAIStreamChoice[]      | Always 1 element                                    |

### OpenAIStreamChoice

| Field         | Type                           | Description             |
| ------------- | ------------------------------ | ----------------------- |
| index         | number                         | Always 0                |
| delta         | OpenAIStreamDelta              | Incremental content     |
| finish_reason | `"stop"` \| `"length"` \| null | Set only on final chunk |

### OpenAIStreamDelta

| Field   | Type                       | Description                                  |
| ------- | -------------------------- | -------------------------------------------- |
| role    | `"assistant"` \| undefined | Present only on first chunk                  |
| content | string \| undefined        | Text delta; absent when finish_reason is set |

---

## Unchanged Entities (preserved from 002-anthropic-proxy)

`ProxyRequest`, `ProxyResponse`, `ContentBlock`, `Usage`, `ErrorResponse`,
`ErrorDetail`, `StreamEvent`, `CountTokensResponse` — all unchanged. The
Anthropic-facing contract is identical; only the internal implementation of
`src/server/copilot.ts` changes.

---

## Mapping Rules (canonical reference)

### Anthropic → OpenAI (outbound to Copilot)

```
ProxyRequest.system      →  OpenAIMessage { role: "system", content: system }  (prepend if present)
ProxyRequest.messages[]  →  OpenAIMessage[] (role + content pass-through)
ProxyRequest.model       →  OpenAIChatRequest.model
ProxyRequest.max_tokens  →  OpenAIChatRequest.max_tokens
ProxyRequest.stream      →  OpenAIChatRequest.stream
ProxyRequest.temperature →  OpenAIChatRequest.temperature  (pass-through if present)
ProxyRequest.top_p       →  OpenAIChatRequest.top_p        (pass-through if present)
```

### OpenAI → Anthropic (inbound from Copilot)

```
choices[0].message.content  →  content[{ type: "text", text }]
finish_reason "stop"         →  stop_reason "end_turn"
finish_reason "length"       →  stop_reason "max_tokens"
finish_reason null           →  stop_reason null
usage.prompt_tokens          →  usage.input_tokens
usage.completion_tokens      →  usage.output_tokens
```

### OpenAI Stream → Anthropic Stream (event sequence)

```
First chunk received         →  emit message_start, content_block_start
Each delta.content chunk     →  emit content_block_delta (text_delta)
Chunk with finish_reason set →  emit content_block_stop, message_delta, message_stop
data: [DONE] line            →  flush remaining events if not yet emitted
```

---

## State

The only mutable module-level state introduced is the `CopilotToken` cache in
`src/copilot/token.ts`. It is process-scoped and never written to disk.

```
null  →  (first request)  →  CopilotToken (cached)
CopilotToken (cached)  →  (refresh_in - 60s elapsed)  →  CopilotToken (refreshed)
CopilotToken (cached)  →  (process exit)  →  null
```
