---
title: "Anthropic-Compatible API Proxy"
status: complete
created: "2026-02-28"
---

# Anthropic-Compatible API Proxy

## Specification

### User Scenarios & Testing _(mandatory)_

#### User Story 1 - Claude Code Connection (Priority: P1)

Claude Code should be able to connect to Claudio as if it were an Anthropic API
endpoint. Claudio proxies these requests to the GitHub Copilot SDK, transforms
responses back to Anthropic format, and returns them to Claude Code.

**Why this priority**: This is the core bridge functionality that enables Claude
Code to use Copilot models.

**Independent Test**: Can be tested by running Claude Code with
`ANTHROPIC_API_URL=http://localhost:8080` and verifying it works.

**Acceptance Scenarios**:

1. **Given** Claude Code sends a POST to `/v1/messages`, **When** the request is
   valid, **Then** Claudio proxies to Copilot SDK and returns
   Anthropic-formatted response
2. **Given** Claude Code sends a POST to `/v1/messages/count_tokens`, **When**
   the request is valid, **Then** Claudio returns token count in Anthropic
   format
3. **Given** Claude Code connects with streaming, **Then** Claudio streams
   Copilot responses as SSE in Anthropic format

---

#### User Story 2 - Server Lifecycle (Priority: P1)

Claudio should manage the proxy server lifecycle: start on launch, handle
graceful shutdown, and clean up resources.

**Why this priority**: The proxy must be reliable and not leave orphaned
processes.

**Independent Test**: Can be tested by starting/stopping Claudio and checking
for zombie processes.

**Acceptance Scenarios**:

1. **Given** Claudio is started, **When** no other process needs it, **Then** it
   should not start the proxy server (lazy start)
2. **Given** Claude Code connects to the proxy, **When** Claude Code
   disconnects, **Then** Claudio should continue running for potential
   reconnection
3. **Given** Claudio receives shutdown signal, **Then** it should stop the proxy
   server gracefully

---

#### User Story 3 - Error Handling (Priority: P2)

The proxy should handle errors gracefully and return appropriate
Anthropic-compatible error responses.

**Why this priority**: Claude Code expects consistent error formats.

**Independent Test**: Can be tested by sending invalid requests and verifying
error response format.

**Acceptance Scenarios**:

1. **Given** Copilot SDK is unavailable, **When** request received, **Then**
   return 503 with Anthropic error format
2. **Given** Invalid request body, **When** request received, **Then** return
   400 with validation error
3. **Given** Request timeout, **Then** return 504 with timeout error

---

### Requirements _(mandatory)_

#### Functional Requirements

- **FR-001**: Server MUST expose POST `/v1/messages` endpoint with
  Anthropic-compatible request/response format
- **FR-002**: Server MUST expose POST `/v1/messages/count_tokens` endpoint
- **FR-003**: Server MUST support streaming responses via SSE
- **FR-004**: Server MUST proxy requests to Copilot SDK
- **FR-005**: Server MUST transform Copilot request format to Anthropic format
- **FR-006**: Server MUST transform Copilot response format to Anthropic format
- **FR-007**: Server MUST run on configurable port (default: 8080)
- **FR-008**: Server MUST return proper Anthropic error responses

#### Key Entities

- **ProxyRequest**: Anthropic-formatted request (model, messages, max_tokens,
  stream, system)
- **ProxyResponse**: Anthropic-formatted response (id, type, role, content,
  stop_reason)
- **StreamEvent**: SSE event (message_start, content_block_start, delta,
  content_block_stop, message_stop)

### Success Criteria _(mandatory)_

#### Measurable Outcomes

- **SC-001**: Claude Code can connect and send messages via the proxy (latency
  <100ms)
- **SC-002**: Streaming responses work correctly
- **SC-003**: Error responses follow Anthropic format
- **SC-004**: Server starts on-demand when first request arrives

## Sub-Specs

This spec is organized using sub-spec files:

- **[RESEARCH](./RESEARCH.md)** - Additional documentation
- **[DATA_MODEL](./DATA_MODEL.md)** - Additional documentation
- **[PLAN](./PLAN.md)** - Additional documentation
- **[QUICKSTART](./QUICKSTART.md)** - Additional documentation
- **[TASKS](./TASKS.md)** - Additional documentation
- **[CONTRACTS](./CONTRACTS.md)** - Additional documentation
