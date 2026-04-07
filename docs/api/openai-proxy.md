# OpenAI Proxy API

The OpenAI-compatible endpoints provide seamless integration with agents
expecting OpenAI's API format. Modmux translates between OpenAI and GitHub
Copilot formats automatically.

## Chat Completions

The primary OpenAI-compatible endpoint for chat-based interactions.

### Endpoint

```http
POST /v1/chat/completions
```

### Request Format

| Field            | Type          | Default      | Description                    |
| ---------------- | ------------- | ------------ | ------------------------------ |
| `model`          | string        | **required** | Model identifier               |
| `messages`       | array         | **required** | Chat messages                  |
| `max_tokens`     | number        | -            | Maximum tokens to generate     |
| `temperature`    | number        | -            | Sampling temperature (0.0-2.0) |
| `top_p`          | number        | -            | Top-p sampling parameter       |
| `stream`         | boolean       | false        | Enable streaming               |
| `tools`          | array         | -            | Available functions            |
| `tool_choice`    | string/object | "auto"       | Tool selection strategy        |
| `stream_options` | object        | -            | Streaming configuration        |

### Message Format

```json
{
  "role": "system|user|assistant|tool",
  "content": "Message text",
  "name": "optional_name",
  "tool_call_id": "id_for_tool_responses",
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "function_name",
        "arguments": "{\"param\": \"value\"}"
      }
    }
  ]
}
```

### Tool Definition

```json
{
  "type": "function",
  "function": {
    "name": "function_name",
    "description": "What this function does",
    "parameters": {
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
}
```

### Request Examples

#### Simple Chat Request

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful coding assistant."
    },
    {
      "role": "user",
      "content": "Write a Python function to reverse a string"
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

#### Streaming Request

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "Explain how promises work in JavaScript"
    }
  ],
  "max_tokens": 1500,
  "stream": true,
  "stream_options": {
    "include_usage": true
  }
}
```

#### Function Calling

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "What's 15 * 7?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculate",
        "description": "Perform arithmetic calculations",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {
              "type": "string",
              "description": "Math expression to evaluate"
            }
          },
          "required": ["expression"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

### Response Format

#### Standard Response

````json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here's a Python function to reverse a string:\\n\\n```python\\ndef reverse_string(s):\\n    return s[::-1]\\n```"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 45,
    "total_tokens": 70,
    "prompt_tokens_details": {
      "cached_tokens": 0
    }
  }
}
````

#### Response with Function Calls

```json
{
  "id": "chatcmpl-xyz789",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "calculate",
              "arguments": "{\"expression\": \"15 * 7\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 35,
    "completion_tokens": 25,
    "total_tokens": 60
  }
}
```

### Streaming Response

When `stream: true`, responses are sent as Server-Sent Events:

```http
Content-Type: text/event-stream

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Here's"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" a Python"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":25,"completion_tokens":45,"total_tokens":70}}

data: [DONE]
```

### Finish Reasons

| Value            | Description            |
| ---------------- | ---------------------- |
| `stop`           | Natural completion     |
| `length`         | Hit max_tokens limit   |
| `tool_calls`     | Function call required |
| `content_filter` | Content filtered       |

## Models

List available models and their capabilities.

### Endpoint

```http
GET /v1/models
```

### Response Format

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1677652288,
      "owned_by": "github-copilot"
    },
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 1677652288,
      "owned_by": "github-copilot"
    },
    {
      "id": "o1-preview",
      "object": "model",
      "created": 1677652288,
      "owned_by": "github-copilot"
    }
  ]
}
```

The response includes:

- **Live models** from GitHub Copilot
- **Model aliases** from the default mapping
- **Resolved model names**

All models are marked as owned by "github-copilot".

## Model Support

### Available Models

The actual models depend on your GitHub Copilot subscription, but commonly
include:

| Model ID      | Description              | Use Case                           |
| ------------- | ------------------------ | ---------------------------------- |
| `gpt-4o`      | Latest GPT-4 Omni        | General purpose, complex reasoning |
| `gpt-4o-mini` | Faster, smaller GPT-4    | Quick responses, simple tasks      |
| `o1-preview`  | Advanced reasoning model | Complex problem solving            |

### Model Aliases

For compatibility with Anthropic-expecting agents, these aliases are supported:

| Alias                        | Maps To       |
| ---------------------------- | ------------- |
| `claude-3-5-sonnet-20241022` | `gpt-4o`      |
| `claude-3-5-haiku-20241022`  | `gpt-4o-mini` |
| `claude-3-opus-20240229`     | `o1-preview`  |

## Error Responses

### Validation Error

```json
{
  "error": {
    "message": "messages is required and must be non-empty",
    "type": "invalid_request_error",
    "param": "messages",
    "code": "invalid_value"
  }
}
```

### Service Error

```json
{
  "error": {
    "message": "Service unavailable",
    "type": "api_error",
    "param": null,
    "code": "service_unavailable"
  }
}
```

## cURL Examples

### Chat Completion

```bash
curl -X POST http://localhost:11434/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Write a hello world program in Go"
      }
    ],
    "max_tokens": 1000
  }'
```

### Streaming Chat

```bash
curl -X POST http://localhost:11434/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Explain how HTTP works"
      }
    ],
    "max_tokens": 1500,
    "stream": true
  }' \\
  --no-buffer
```

### List Models

```bash
curl http://localhost:11434/v1/models
```

### Function Calling with Tool Response

```bash
# First request with function call
curl -X POST http://localhost:11434/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "What time is it in Tokyo?"
      },
      {
        "role": "assistant",
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_time",
              "arguments": "{\"timezone\": \"Asia/Tokyo\"}"
            }
          }
        ]
      },
      {
        "role": "tool",
        "tool_call_id": "call_abc123",
        "content": "2024-01-15 14:30:00 JST"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_time",
          "description": "Get current time in specified timezone",
          "parameters": {
            "type": "object",
            "properties": {
              "timezone": {
                "type": "string",
                "description": "Timezone identifier"
              }
            },
            "required": ["timezone"]
          }
        }
      }
    ]
  }'
```

## Integration Examples

### Python with OpenAI Library

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="not-needed"  # Modmux handles auth
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Write a Python function to calculate factorial"}
    ],
    max_tokens=1000
)

print(response.choices[0].message.content)
```

### Node.js with OpenAI SDK

```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "not-needed", // Modmux handles auth
});

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "user", content: "Explain async/await in JavaScript" },
  ],
  max_tokens: 1500,
});

console.log(completion.choices[0].message.content);
```

## Next Steps

- [Anthropic Proxy API](./anthropic-proxy.md) - Anthropic-compatible endpoints
- [Usage Metrics API](./usage-metrics.md) - Monitor API usage
- [Token Counting API](./token-counting.md) - Count tokens efficiently
