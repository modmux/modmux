# Quickstart: Anthropic-Compatible API Proxy

## Prerequisites

1. **GitHub Copilot CLI installed**
   ```bash
   brew install ghcopilot
   # or see: https://github.com/cli/copilot-cli
   ```

2. **GitHub authentication**
   ```bash
   gh auth login
   gh copilot auth login
   ```

3. **Deno installed**
   ```bash
   brew install deno
   ```

---

## Quick Start

### 1. Run Claudio

```bash
cd /path/to/claudio
deno run -A src/cli/main.ts
```

### 2. Configure Claude Code

Set the environment variable before running Claude Code:

```bash
export ANTHROPIC_API_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy  # Required but unused
```

### 3. Run Claude Code

```bash
claude  # or whatever your Claude Code command is
```

---

## Configuration

### Port

Default port is 8080. Override with:

```bash
CLAUDIO_PORT=9000 deno run -A src/cli/main.ts
```

### Environment Variables

| Variable     | Default   | Description        |
| ------------ | --------- | ------------------ |
| CLAUDIO_PORT | 8080      | Proxy server port  |
| CLAUDIO_HOST | 127.0.0.1 | Proxy bind address |

---

## Testing the Proxy

### Test non-streaming request

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Say hi"}],
    "max_tokens": 10
  }'
```

### Test streaming request

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Count to 3"}],
    "max_tokens": 20,
    "stream": true
  }'
```

### Test token counting

```bash
curl -X POST http://localhost:8080/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello world"}]
  }'
```

---

## Troubleshooting

### "Copilot CLI not found"

Install Copilot CLI:

```bash
brew install ghcopilot
```

### "Not authenticated"

Run:

```bash
gh auth login
gh copilot auth login
```

### "Port already in use"

Change port:

```bash
CLAUDIO_PORT=8081 deno run -A src/cli/main.ts
```

---

## Quality Gates

Before any code change, run:

```bash
deno lint && deno fmt --check && deno check && deno test
```
