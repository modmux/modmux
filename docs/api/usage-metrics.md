# Usage Metrics API

Reference for the usage and responses endpoints exposed by Modmux.

## Usage Endpoint

Get real-time usage statistics across all endpoints and agents.

### Endpoint

```http
GET /v1/usage
```

### Response Format

```json
{
  "endpoints": {
    "/v1/messages": {
      "requests": 150,
      "totalDuration": 45000.5,
      "averageDuration": 300.0,
      "statusCodes": {
        "200": 148,
        "400": 1,
        "503": 1
      }
    },
    "/v1/chat/completions": {
      "requests": 89,
      "totalDuration": 22000.3,
      "averageDuration": 247.2,
      "statusCodes": {
        "200": 88,
        "400": 1
      }
    },
    "/v1/models": {
      "requests": 12,
      "totalDuration": 120.8,
      "averageDuration": 10.1,
      "statusCodes": {
        "200": 12
      }
    }
  },
  "agents": {
    "claude-code": {
      "requests": 120,
      "totalDuration": 35000.2,
      "averageDuration": 291.7,
      "statusCodes": {
        "200": 119,
        "503": 1
      }
    },
    "cline": {
      "requests": 85,
      "totalDuration": 24000.1,
      "averageDuration": 282.4,
      "statusCodes": {
        "200": 84,
        "400": 1
      }
    },
    "unknown": {
      "requests": 46,
      "totalDuration": 8120.5,
      "averageDuration": 176.5,
      "statusCodes": {
        "200": 45,
        "400": 1
      }
    }
  },
  "models": {
    "gpt-4o": {
      "requests": 180,
      "totalDuration": 52000.8,
      "averageDuration": 288.9,
      "statusCodes": {
        "200": 178,
        "400": 1,
        "503": 1
      }
    },
    "gpt-4o-mini": {
      "requests": 71,
      "totalDuration": 15120.0,
      "averageDuration": 213.0,
      "statusCodes": {
        "200": 70,
        "400": 1
      }
    }
  },
  "overall": {
    "requests": 251,
    "totalDuration": 67120.8,
    "averageDuration": 267.4,
    "statusCodes": {
      "200": 248,
      "400": 2,
      "503": 1
    }
  }
}
```

### Metrics Fields

| Field             | Type   | Description                       |
| ----------------- | ------ | --------------------------------- |
| `requests`        | number | Total number of requests          |
| `totalDuration`   | number | Total duration in milliseconds    |
| `averageDuration` | number | Average duration per request (ms) |
| `statusCodes`     | object | Count of responses by HTTP status |

### Tracking Dimensions

- **endpoints** - Usage per API endpoint
- **agents** - Usage per detected agent (from User-Agent)
- **models** - Usage per requested model
- **overall** - Aggregate statistics

## Responses Endpoint

OpenAI Responses API compatibility for Codex and similar agents. Provides a
different response format than standard chat completions.

### Endpoint

```http
POST /v1/responses
```

### Request Format

| Field               | Type            | Default      | Description                 |
| ------------------- | --------------- | ------------ | --------------------------- |
| `model`             | string          | **required** | Model identifier            |
| `input`             | string or array | **required** | Input text or message array |
| `max_output_tokens` | number          | 4096         | Maximum tokens to generate  |
| `temperature`       | number          | -            | Sampling temperature        |
| `top_p`             | number          | -            | Top-p sampling parameter    |
| `stream`            | boolean         | false        | Enable streaming            |

### Input Formats

#### Simple Text Input

```json
{
  "model": "gpt-4o",
  "input": "Write a function to sort an array",
  "max_output_tokens": 1000
}
```

#### Structured Message Input

```json
{
  "model": "gpt-4o",
  "input": [
    {
      "role": "system",
      "content": "You are a helpful coding assistant"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Explain how quicksort works"
        }
      ]
    }
  ],
  "max_output_tokens": 1500
}
```

### Response Format

#### Standard Response

````json
{
  "id": "resp_msg_abc123def456",
  "object": "response",
  "created_at": 1677652288,
  "status": "completed",
  "model": "gpt-4o",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Here's how to sort an array in JavaScript:\\n\\n```javascript\\nfunction sortArray(arr) {\\n    return arr.sort((a, b) => a - b);\\n}\\n```"
        }
      ]
    }
  ],
  "output_text": "Here's how to sort an array in JavaScript:\\n\\n```javascript\\nfunction sortArray(arr) {\\n    return arr.sort((a, b) => a - b);\\n}\\n```",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 45,
    "total_tokens": 57,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
````

### Streaming Response

When `stream: true`, responses use Server-Sent Events with different event
names:

```http
Content-Type: text/event-stream

event: response.created
data: {"type":"response.created","response":{"id":"resp_msg_abc123","object":"response","model":"gpt-4o","status":"in_progress"}}

event: response.output_item.added
data: {"type":"response.output_item.added","response_id":"resp_msg_abc123","output_index":0,"item":{"id":"msg_resp_msg_abc123","type":"message","role":"assistant","status":"in_progress","content":[]}}

event: response.content_part.added
data: {"type":"response.content_part.added","response_id":"resp_msg_abc123","output_index":0,"item_id":"msg_resp_msg_abc123","content_index":0,"part":{"type":"output_text","text":""}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","response_id":"resp_msg_abc123","output_index":0,"item_id":"msg_resp_msg_abc123","content_index":0,"delta":"Here's"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","response_id":"resp_msg_abc123","output_index":0,"item_id":"msg_resp_msg_abc123","content_index":0,"delta":" how to"}

event: response.output_text.done
data: {"type":"response.output_text.done","response_id":"resp_msg_abc123","output_index":0,"item_id":"msg_resp_msg_abc123","content_index":0,"text":"Here's how to sort an array..."}

event: response.content_part.done
data: {"type":"response.content_part.done","response_id":"resp_msg_abc123","output_index":0,"item_id":"msg_resp_msg_abc123","content_index":0,"part":{"type":"output_text","text":"Here's how to sort an array..."}}

event: response.output_item.done
data: {"type":"response.output_item.done","response_id":"resp_msg_abc123","output_index":0,"item":{"id":"msg_resp_msg_abc123","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Here's how to sort an array..."}]}}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_msg_abc123","object":"response","created_at":1677652288,"status":"completed","model":"gpt-4o","output":[...],"output_text":"Here's how to sort an array...","usage":{...}}}

data: [DONE]
```

### Stream Events

| Event                         | Description             |
| ----------------------------- | ----------------------- |
| `response.created`            | Response started        |
| `response.output_item.added`  | Output item initialized |
| `response.content_part.added` | Content part started    |
| `response.output_text.delta`  | Incremental text        |
| `response.output_text.done`   | Text content complete   |
| `response.content_part.done`  | Content part finished   |
| `response.output_item.done`   | Output item complete    |
| `response.completed`          | Response finished       |

## Usage Tracking

All requests to tracked endpoints automatically record metrics:

### Tracked Endpoints

- `POST /v1/messages`
- `POST /v1/messages/count_tokens`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `GET /v1/usage`
- `GET /health`

### Metric Dimensions

1. **Endpoint** - The API path called
2. **Agent** - Detected from User-Agent header
3. **Model** - Requested model name
4. **Status** - HTTP response status code
5. **Duration** - Request processing time in milliseconds

### Agent Detection

| User-Agent Contains        | Detected As   |
| -------------------------- | ------------- |
| `claude-code`, `anthropic` | `claude-code` |
| `cline`                    | `cline`       |
| `codex`                    | `codex`       |
| (other/unknown)            | `unknown`     |

## Error Responses

### Usage Endpoint Errors

The `/v1/usage` endpoint typically doesn't error but returns empty metrics if no
requests have been made:

```json
{
  "endpoints": {},
  "agents": {},
  "models": {},
  "overall": {
    "requests": 0,
    "totalDuration": 0,
    "averageDuration": 0,
    "statusCodes": {}
  }
}
```

### Responses Endpoint Errors

```json
{
  "error": {
    "message": "input is required and must contain text content",
    "type": "invalid_request_error",
    "param": "input",
    "code": "invalid_value"
  }
}
```

## cURL Examples

### Get Usage Metrics

```bash
curl http://localhost:11435/v1/usage
```

### Create Response

```bash
curl -X POST http://localhost:11435/v1/responses \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "input": "Write a Python function to calculate prime numbers",
    "max_output_tokens": 1000
  }'
```

### Streaming Response

```bash
curl -X POST http://localhost:11435/v1/responses \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "input": "Explain how machine learning works",
    "max_output_tokens": 2000,
    "stream": true
  }' \\
  --no-buffer
```

### Structured Input

```bash
curl -X POST http://localhost:11435/v1/responses \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "input": [
      {
        "role": "system",
        "content": "You are an expert programmer"
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "Debug this Python code"
          }
        ]
      }
    ],
    "max_output_tokens": 1500
  }'
```

## Configuration

Usage metrics can be configured via the Modmux configuration file:

```json
{
  "usageMetrics": {
    "enabled": true,
    "retentionHours": 24
  }
}
```

### Configuration Options

| Field            | Type    | Default | Description                   |
| ---------------- | ------- | ------- | ----------------------------- |
| `enabled`        | boolean | true    | Enable usage tracking         |
| `retentionHours` | number  | 24      | How long to keep metrics data |

## Next Steps

- [Token Counting API](./token-counting.md) - Estimate token usage before
  requests
- [Anthropic Proxy API](./anthropic-proxy.md) - Anthropic-compatible endpoints
- [OpenAI Proxy API](./openai-proxy.md) - OpenAI-compatible endpoints
