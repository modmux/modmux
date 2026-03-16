## Plan

### Summary

Build a local HTTP server that exposes Anthropic-compatible endpoints
(`/v1/messages`, `/v1/messages/count_tokens`) which proxy requests to the GitHub
Copilot SDK. This enables Claude Code to use GitHub Copilot models as if
connecting to the Anthropic API.

### Project Structure

#### Documentation (this feature)

```text
specs/002-anthropic-proxy/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── DATA_MODEL.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── CONTRACTS.md           # Phase 1 output
│   └── api.md           # API contract
└── tasks.md             # Phase 2 output
```

#### Source Code (repository root)

```text
src/
├── cli/
│   ├── main.ts          # CLI entry point (exists)
│   ├── auth.ts          # Auth module (exists)
├── server/
│   ├── mod.ts           # NEW: Server exports
│   ├── server.ts        # NEW: Server lifecycle
│   ├── router.ts        # NEW: HTTP routing
│   ├── transform.ts     # NEW: Request/response transformation
│   ├── copilot.ts      # NEW: Copilot SDK wrapper
│   └── types.ts         # NEW: API types

tests/
├── contract/
│   ├── cli_test.ts      # (exists)
│   ├── proxy_test.ts    # NEW: API contract tests
│   ├── server_test.ts   # NEW: Lifecycle tests
│   └── error_test.ts   # NEW: Error handling tests
```

**Structure Decision**: Single project with CLI + embedded HTTP server. Adding
`src/server/` for proxy components.

### Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation              | Why Needed                               | Simpler Alternative Rejected Because   |
| ---------------------- | ---------------------------------------- | -------------------------------------- |
| HTTP server complexity | Required to receive Claude Code requests | Cannot proxy without network interface |
