# Data Model: Anthropic-Compatible API Proxy

## Entities

### ProxyRequest

Represents an Anthropic-formatted message request.

| Field       | Type      | Required | Description                                   |
| ----------- | --------- | -------- | --------------------------------------------- |
| model       | string    | Yes      | Model ID (e.g., "claude-3-5-sonnet-20241022") |
| messages    | Message[] | Yes      | Conversation history                          |
| max_tokens  | number    | Yes      | Max tokens to generate                        |
| system      | string    | No       | System prompt                                 |
| stream      | boolean   | No       | Enable streaming (default: false)             |
| temperature | number    | No       | Sampling temperature                          |
| top_p       | number    | No       | Nucleus sampling                              |

### Message

Single message in conversation.

| Field   | Type                  | Required | Description     |
| ------- | --------------------- | -------- | --------------- |
| role    | "user" \| "assistant" | Yes      | Message author  |
| content | string                | Yes      | Message content |

### ProxyResponse

Anthropic-formatted message response.

| Field         | Type                               | Description            |
| ------------- | ---------------------------------- | ---------------------- |
| id            | string                             | Unique message ID      |
| type          | "message"                          | Response type          |
| role          | "assistant"                        | Always assistant       |
| content       | ContentBlock[]                     | Response content       |
| model         | string                             | Model used             |
| stop_reason   | "end_turn" \| "max_tokens" \| null | Why generation stopped |
| stop_sequence | string \| null                     | Stop sequence if any   |
| usage         | Usage                              | Token usage            |

### ContentBlock

Single content block in response.

| Field | Type   | Description  |
| ----- | ------ | ------------ |
| type  | "text" | Content type |
| text  | string | Text content |

### Usage

Token usage information.

| Field         | Type   | Description        |
| ------------- | ------ | ------------------ |
| input_tokens  | number | Tokens in request  |
| output_tokens | number | Tokens in response |

### StreamEvent

SSE event for streaming responses.

| Event Type          | Description           |
| ------------------- | --------------------- |
| message_start       | Message metadata      |
| content_block_start | Content block started |
| content_block_delta | Text delta            |
| content_block_stop  | Content block ended   |
| message_delta       | Usage delta           |
| message_stop        | Message complete      |

### ErrorResponse

Anthropic error format.

| Field | Type        | Description   |
| ----- | ----------- | ------------- |
| type  | "error"     | Error type    |
| error | ErrorDetail | Error details |

### ErrorDetail

Error details.

| Field   | Type           | Description       |
| ------- | -------------- | ----------------- |
| type    | string         | Error type        |
| message | string         | Error message     |
| param   | string \| null | Invalid parameter |

---

## State Transitions

```
Idle → Starting (on first request) → Running → Stopping (on shutdown)
```

---

## Validation Rules

- `model` must be non-empty string
- `messages` must be non-empty array
- `max_tokens` must be positive integer
- `stream` must be boolean
- Port must be valid (1-65535)
