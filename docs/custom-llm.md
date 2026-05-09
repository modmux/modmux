# Use Modmux as a Custom LLM Endpoint

Use this guide when you want to run Modmux locally and connect your own client
or tool to it as a model provider.

## Prerequisites

- Modmux installed
- GitHub account with Copilot access
- Terminal access

## 1. Start Modmux and authenticate

```bash
modmux start
modmux status
```

On first run, complete GitHub device login in your browser.

Modmux binds to `127.0.0.1` and starts at port `11435`. If that port is busy, it
scans upward. Always use the endpoint shown by `modmux status`.

## 2. Pick your API compatibility mode

| Mode                 | Endpoint                                            | Best for                                                   |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| OpenAI-compatible    | `POST /v1/chat/completions` or `POST /v1/responses` | OpenAI SDKs and tools that support custom OpenAI base URLs |
| Anthropic-compatible | `POST /v1/messages`                                 | Tools that expect Anthropic Messages API format            |

Base URL format:

```text
http://127.0.0.1:<port>
```

## 3. Configure your client or tool

### OpenAI-compatible clients

Set:

- Base URL: `http://127.0.0.1:<port>/v1`
- API key: any non-empty placeholder if your client requires it

Python example:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:11435/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Say hello"}],
    max_tokens=100
)

print(response.choices[0].message.content)
```

### Anthropic-compatible clients

Point requests at:

```text
http://127.0.0.1:<port>/v1/messages
```

Use the Anthropic Messages request shape (`model`, `messages`, `max_tokens`).

### Tool-specific snippets

For supported coding agents, Modmux can configure them directly:

```bash
modmux configure claude-code
modmux configure cline
modmux configure codex
modmux doctor
```

## 4. Validate the endpoint

```bash
curl http://127.0.0.1:11435/health
curl http://127.0.0.1:11435/v1/models
```

OpenAI-style request:

```bash
curl -X POST http://127.0.0.1:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 50
  }'
```

Anthropic-style request:

```bash
curl -X POST http://127.0.0.1:11435/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 50
  }'
```

If your running port is not `11435`, replace it with the port from
`modmux status`.

## 5. Troubleshooting

- If requests fail, check `modmux status` and `curl /health` first.
- If auth expired, run `modmux stop` then `modmux start`.
- If your tool cannot connect, verify it is using `127.0.0.1` and the active
  port from `modmux status`.

## Related docs

- [Getting started](./getting-started.md)
- [API reference](./api/README.md)
- [OpenAI proxy details](./api/openai-proxy.md)
- [Anthropic proxy details](./api/anthropic-proxy.md)
- [Troubleshooting](./troubleshooting.md)
