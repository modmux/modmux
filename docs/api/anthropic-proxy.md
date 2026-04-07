# Anthropic Proxy API

The `/v1/messages` endpoint provides an Anthropic-compatible interface for chat
completions, allowing Claude-based agents to communicate with GitHub Copilot
seamlessly.

## Endpoint

```http
POST /v1/messages
```

## Request Format

The endpoint accepts requests in Anthropic's Messages API format:

### Required Fields

| Field        | Type   | Description                                            |
| ------------ | ------ | ------------------------------------------------------ |
| `model`      | string | Model identifier (see [Model Support](#model-support)) |
| `messages`   | array  | Array of message objects                               |
| `max_tokens` | number | Maximum tokens to generate (must be positive)          |

### Optional Fields

| Field         | Type    | Default | Description                    |
| ------------- | ------- | ------- | ------------------------------ |
| `system`      | string  | -       | System prompt text             |
| `stream`      | boolean | false   | Enable streaming response      |
| `temperature` | number  | -       | Sampling temperature (0.0-1.0) |
| `top_p`       | number  | -       | Top-p sampling parameter       |
| `tools`       | array   | -       | Available tools/functions      |
| `tool_choice` | object  | -       | Tool selection strategy        |

### Message Format

Each message in the `messages` array has:

| Field     | Type            | Description                          |
| --------- | --------------- | ------------------------------------ |
| `role`    | string          | Either "user" or "assistant"         |
| `content` | string or array | Message content (text or structured) |

#### Content Blocks

Content can be a simple string or an array of content blocks:

**Text Block:**

```json
{
  "type": "text",
  "text": "Your message here"
}
```

**Tool Use Block:**

```json
{
  "type": "tool_use",
  "id": "tool_call_id",
  "name": "function_name",
  "input": { "param": "value" }
}
```

**Tool Result Block:**

```json
{
  "type": "tool_result",
  "tool_use_id": "tool_call_id",
  "content": "Result text or content blocks",
  "is_error": false
}
```

### Tool Definition

Tools are defined with the following structure:

```json
{
  "name": "function_name",
  "description": "What this tool does",
  "input_schema": {
    "type": "object",
    "properties": {
      "param_name": {
        "type": "string",
        "description": "Parameter description"
      }
    },
    "required": ["param_name"]
  }
}
```

### Tool Choice

Control tool usage with `tool_choice`:

```json
{ "type": "auto" }        // Let model decide
{ "type": "any" }         // Force tool use
{ "type": "tool", "name": "function_name" }  // Use specific tool
```

## Request Examples

### Simple Text Request

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "Write a Python function to calculate fibonacci numbers"
    }
  ],
  "max_tokens": 1000
}
```

### Request with System Prompt

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "Help me debug this code"
    }
  ],
  "max_tokens": 1500,
  "system": "You are an expert Python developer helping to debug code.",
  "temperature": 0.3
}
```

### Streaming Request

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "Explain how async/await works in JavaScript"
    }
  ],
  "max_tokens": 2000,
  "stream": true
}
```

### Request with Tools

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "What's the weather like in San Francisco?"
    }
  ],
  "max_tokens": 1000,
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name"
          }
        },
        "required": ["location"]
      }
    }
  ],
  "tool_choice": { "type": "auto" }
}
```

## Response Format

### Standard Response

````json
{
  "id": "msg_coco_abc123def456",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Here's a Python function to calculate Fibonacci numbers:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n```"
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 25,
    "output_tokens": 150,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0
  }
}
````

### Response with Tool Use

```json
{
  "id": "msg_coco_xyz789abc123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll check the weather in San Francisco for you."
    },
    {
      "type": "tool_use",
      "id": "tool_abc123",
      "name": "get_weather",
      "input": {
        "location": "San Francisco"
      }
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "tool_use",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 45,
    "output_tokens": 75
  }
}
```

### Usage Object

| Field                         | Type   | Description             |
| ----------------------------- | ------ | ----------------------- |
| `input_tokens`                | number | Tokens in the request   |
| `output_tokens`               | number | Tokens in the response  |
| `cache_read_input_tokens`     | number | Tokens read from cache  |
| `cache_creation_input_tokens` | number | Tokens written to cache |

### Stop Reasons

| Value        | Description                 |
| ------------ | --------------------------- |
| `end_turn`   | Natural end of response     |
| `max_tokens` | Hit max_tokens limit        |
| `tool_use`   | Response includes tool call |
| `null`       | Response incomplete         |

## Streaming Response

When `stream: true` is set, the response is sent as Server-Sent Events:

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: message_start
data: {"type": "message_start", "message": {"id": "msg_coco_abc123", "type": "message", "role": "assistant", "model": "claude-3-5-sonnet-20241022", "usage": {"input_tokens": 25, "output_tokens": 0}}}

event: content_block_start
data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text"}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Here's"}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " a Python"}}

event: content_block_stop
data: {"type": "content_block_stop", "index": 0}

event: message_delta
data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 150}}

event: message_stop
data: {"type": "message_stop"}
```

### Stream Event Types

| Event                 | Description                     |
| --------------------- | ------------------------------- |
| `message_start`       | Start of response with metadata |
| `content_block_start` | Start of content block          |
| `content_block_delta` | Incremental content             |
| `content_block_stop`  | End of content block            |
| `message_delta`       | Usage and stop reason updates   |
| `message_stop`        | End of response                 |
| `error`               | Error occurred                  |

## Model Support

The endpoint supports GitHub Copilot models through automatic model resolution:

| Requested Model              | Resolved To   |
| ---------------------------- | ------------- |
| `claude-3-5-sonnet-20241022` | `gpt-4o`      |
| `claude-3-5-haiku-20241022`  | `gpt-4o-mini` |
| `claude-3-opus-20240229`     | `o1-preview`  |

You can also use GitHub Copilot model names directly (e.g., `gpt-4o`,
`gpt-4o-mini`).

## Error Responses

### Validation Errors

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "model is required",
    "param": "model"
  }
}
```

### Service Errors

```json
{
  "type": "error",
  "error": {
    "type": "service_error",
    "message": "Copilot unavailable",
    "param": null
  }
}
```

## cURL Examples

### Simple Request

```bash
curl -X POST http://localhost:11434/v1/messages \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {
        "role": "user",
        "content": "Write a hello world function in Python"
      }
    ],
    "max_tokens": 1000
  }'
```

### Streaming Request

```bash
curl -X POST http://localhost:11434/v1/messages \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {
        "role": "user",
        "content": "Explain how to use async/await"
      }
    ],
    "max_tokens": 1500,
    "stream": true
  }' \\
  --no-buffer
```

## Next Steps

- [OpenAI Proxy API](./openai-proxy.md) - OpenAI-compatible endpoints
- [Token Counting API](./token-counting.md) - Count tokens before sending
  requests
- [Usage Metrics API](./usage-metrics.md) - Monitor API usage
