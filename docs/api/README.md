# API Reference

Use this section for endpoint details. Product overview and setup live in the
README and getting-started guide.

## Base URL

```text
http://127.0.0.1:11435
```

Modmux starts at port `11435`. If that port is busy, it scans upward for an
available port. Use `modmux status` to confirm the active port.

## Authentication

Modmux manages GitHub Copilot auth itself. Start the service with `modmux start`
before calling the local endpoints.

## Endpoints

| Endpoint                         | Purpose                                       | Reference                                                            |
| -------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `POST /v1/messages`              | Anthropic-compatible chat endpoint            | [Anthropic proxy](./anthropic-proxy.md)                              |
| `POST /v1/messages/count_tokens` | Count message tokens before sending a request | [Token counting](./token-counting.md)                                |
| `POST /v1/chat/completions`      | OpenAI-compatible chat endpoint               | [OpenAI proxy](./openai-proxy.md)                                    |
| `POST /v1/responses`             | OpenAI Responses-compatible endpoint          | [Usage metrics and responses](./usage-metrics.md#responses-endpoint) |
| `GET /v1/models`                 | List available models                         | [OpenAI proxy](./openai-proxy.md#models)                             |
| `GET /v1/usage`                  | Read usage metrics                            | [Usage metrics](./usage-metrics.md#usage-endpoint)                   |
| `GET /health`                    | Health check                                  | [Health check](#health-check)                                        |

## Health check

```http
GET /health
```

```json
{
  "status": "ok"
}
```

## Error shapes

Anthropic-compatible endpoints return:

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

OpenAI-compatible endpoints return:

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

## Related docs

- [Getting started](../getting-started.md)
- [Troubleshooting](../troubleshooting.md)
