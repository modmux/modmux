# API Contract: Anthropic-Compatible Proxy

## Overview

This document defines the HTTP API contracts for the Claudio proxy server. The
API is designed to be compatible with the Anthropic Messages API, allowing
Claude Code to connect as if to the Anthropic API.

## Base URL

```
http://localhost:8080
```

Configure via `CLAUDIO_PORT` environment variable.

---

## Endpoints

### POST /v1/messages

Create a new message (non-streaming or streaming).

#### Request

**Headers**:

- `Content-Type: application/json`
- `anthropic-version: 2023-06-01` (optional, for compatibility)

**Body**:

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    { "role": "user", "content": "Hello, how are you?" }
  ],
  "max_tokens": 1024,
  "stream": false
}
```

#### Response (Non-Streaming)

**Status**: 200 OK

```json
{
  "id": "msg_claudio_abc123",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "I'm doing well, thank you!" }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 12,
    "output_tokens": 8
  }
}
```

#### Response (Streaming)

**Status**: 200 OK

**Headers**:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Body** (SSE format):

```
event: message_start
data: {"type":"message_start","id":"msg_claudio_abc123","role":"assistant","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":12}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'm doing"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" well!"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","usage":{"output_tokens":8},"delta":{"stop_reason":"end_turn"}}

event: message_stop
data: {"type":"message_stop"}
```

#### Error Response

**Status**: 400, 503, or 504

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Model not found",
    "param": "model"
  }
}
```

---

### POST /v1/messages/count_tokens

Count tokens in a message request.

#### Request

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

#### Response

```json
{
  "id": "msg_claudio_count_abc123",
  "type": "message",
  "role": "assistant",
  "content": [],
  "model": "claude-3-5-sonnet-20241022",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 0
  }
}
```

---

## Error Types

| HTTP Status | Error Type            | Description             |
| ----------- | --------------------- | ----------------------- |
| 400         | invalid_request_error | Malformed request       |
| 400         | invalid_parameter     | Invalid parameter value |
| 503         | service_error         | Copilot SDK unavailable |
| 504         | timeout_error         | Request timed out       |

---

## Contract Tests

### Test 1: Non-streaming message

```
POST /v1/messages
{ "model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10 }

Expected: 200, valid Message JSON
```

### Test 2: Streaming message

```
POST /v1/messages
{ "model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10, "stream": true }

Expected: 200, SSE stream with message_start, content_block_delta, message_stop events
```

### Test 3: Token counting

```
POST /v1/messages/count_tokens
{ "model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "Hi"}] }

Expected: 200, usage object with input_tokens
```

### Test 4: Invalid model

```
POST /v1/messages
{ "model": "", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10 }

Expected: 400, error response
```

### Test 5: Missing required field

```
POST /v1/messages
{ "messages": [{"role": "user", "content": "Hi"}] }

Expected: 400, error response about missing model
```

### Test 6: Copilot unavailable

```
POST /v1/messages (when Copilot CLI not running)

Expected: 503, service_error
```
