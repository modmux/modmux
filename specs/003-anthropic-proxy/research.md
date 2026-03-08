# Research: Anthropic-Compatible API Proxy

## Decision: HTTP Server Library

**Chosen**: Deno std/http (built-in)

**Rationale**: Deno has built-in HTTP server with good performance. No external
dependencies needed. Matches Deno-first approach.

**Alternatives considered**:

- oak (middleware framework) - more features than needed, adds dependency
- fastify (via Deno) - not idiomatic for Deno

---

## Decision: Request/Response Transformation

**Chosen**: Manual transformation layer

**Rationale**: Need precise control over field mapping between Anthropic and
Copilot formats. Both APIs evolve, manual gives flexibility.

**Mapping required**:

- Anthropic `messages[]` → Copilot `prompt` or session context
- Anthropic `model` → Copilot model selection
- Anthropic streaming events → Copilot delta events
- Copilot response → Anthropic Message format

---

## Decision: Server Startup Strategy

**Chosen**: Lazy start (start on first request)

**Rationale**: Constitution principle I (Minimalism) - don't start unnecessary
processes. Claude Code will connect when ready.

**Alternative rejected**:

- Eager start on CLI launch - wastes resources if Claude Code not used

---

## Decision: Streaming Implementation

**Chosen**: SSE (Server-Sent Events) via Deno HTTP

**Rationale**: Anthropic API uses SSE for streaming. Copilot SDK provides
`assistant.message_delta` events that map to SSE.

**Implementation**:

- Map Copilot `assistant.message_delta` → Anthropic `content_block_delta`
- Map Copilot `assistant.message` → Anthropic `message_start`/`message_stop`

---

## Decision: Port Configuration

**Chosen**: Default port 8080, configurable via `CLAUDIO_PORT` env var

**Rationale**:

- 8080 is common default, unlikely to conflict
- Environment variable allows override without CLI flags
- Constitution principle III (Predictability) - explicit config

---

## Decision: Error Response Format

**Chosen**: Anthropic error format

**Rationale**: Claude Code expects consistent error format. Must return:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "...",
    "param": null
  }
}
```

---

## Key Technical Details

### Anthropic /v1/messages Request Format

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 1024,
  "stream": false,
  "system": "You are helpful."
}
```

### Anthropic /v1/messages Response Format

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Response" }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20
  }
}
```

### Copilot SDK Usage

```typescript
const client = new CopilotClient();
const session = await client.createSession({ model: "gpt-4.1" });
const response = await session.sendAndWait({ prompt: "Question?" });
```

### SSE Events to Implement

- `message_start` - First event with message metadata
- `content_block_start` - When content block begins
- `content_block_delta` - Text deltas
- `content_block_stop` - When content block ends
- `message_delta` - Usage information
- `message_stop` - Final event
