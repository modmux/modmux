# API Reference

Modmux provides a comprehensive HTTP API that acts as a proxy between AI code
completion agents and GitHub Copilot. The API offers both Anthropic-compatible
and OpenAI-compatible endpoints, allowing seamless integration with various AI
agents.

## Base URL

When running locally (default):

```
http://localhost:11434
```

The default port can be configured and Modmux will automatically scan for
available ports if the default is in use.

## Authentication

All API requests require a valid GitHub Copilot token. Modmux handles token
management automatically through GitHub OAuth device flow authentication.

To authenticate:

```bash
modmux auth
# Follow the device flow prompts
```

Once authenticated, tokens are automatically included in all proxied requests to
GitHub Copilot.

## Content Types

All API endpoints expect and return JSON with the content type
`application/json`.

## Error Handling

All endpoints follow consistent error response formats:

### Anthropic-compatible Endpoints

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Error description",
    "param": "field_name"
  }
}
```

### OpenAI-compatible Endpoints

```json
{
  "error": {
    "message": "Error description",
    "type": "invalid_request_error",
    "param": "field_name",
    "code": "invalid_value"
  }
}
```

## Error Types

| Error Type              | Description               |
| ----------------------- | ------------------------- |
| `invalid_request_error` | Request validation failed |
| `service_error`         | Internal server error     |
| `api_error`             | Upstream API error        |

## Rate Limiting

Modmux inherits rate limiting from GitHub Copilot. Rate limit headers are passed
through from the upstream service.

## Endpoints

### Core Endpoints

- **[/v1/messages](./anthropic-proxy.md)** - Anthropic-compatible chat
  completions
- **[/v1/chat/completions](./openai-proxy.md)** - OpenAI-compatible chat
  completions
- **[/v1/responses](./usage-metrics.md#responses-endpoint)** - OpenAI Responses
  API (for Codex compatibility)

### Utility Endpoints

- **[/v1/models](./openai-proxy.md#models-endpoint)** - List available models
- **[/v1/usage](./usage-metrics.md#usage-endpoint)** - Usage metrics and
  statistics
- **[/v1/messages/count_tokens](./token-counting.md)** - Token counting utility
- **[/health](#health-endpoint)** - Service health check

### Health Endpoint

Simple health check endpoint for service monitoring.

**Request:**

```http
GET /health
```

**Response:**

```json
{
  "status": "ok"
}
```

## Model Support

Modmux supports GitHub Copilot models with automatic model resolution:

### Model Aliases

| Alias                        | Resolved Model |
| ---------------------------- | -------------- |
| `claude-3-5-sonnet-20241022` | `gpt-4o`       |
| `claude-3-5-haiku-20241022`  | `gpt-4o-mini`  |
| `claude-3-opus-20240229`     | `o1-preview`   |

Models are resolved dynamically and the actual available models depend on your
GitHub Copilot subscription.

## Agent Detection

Modmux automatically detects the calling agent from the User-Agent header for
metrics tracking:

| User-Agent Contains        | Detected Agent |
| -------------------------- | -------------- |
| `claude-code`, `anthropic` | `claude-code`  |
| `cline`                    | `cline`        |
| `codex`                    | `codex`        |

## Usage Metrics

All requests are tracked for usage metrics with the following dimensions:

- **endpoint** - The API endpoint called
- **agent** - The detected agent (from User-Agent)
- **model** - The requested model
- **status** - HTTP response status
- **duration** - Request duration in milliseconds

Access usage data via the
[/v1/usage endpoint](./usage-metrics.md#usage-endpoint).

## Next Steps

- [Anthropic Proxy API](./anthropic-proxy.md) - `/v1/messages` endpoint
- [OpenAI Proxy API](./openai-proxy.md) - `/v1/chat/completions` and
  `/v1/models`
- [Usage Metrics API](./usage-metrics.md) - `/v1/usage` and `/v1/responses`
- [Token Counting API](./token-counting.md) - `/v1/messages/count_tokens`
