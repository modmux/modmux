---

## description: "Task list template for feature implementation"

# Tasks: Remove Copilot SDK — Direct HTTP Integration

**Input**: Design documents from `/specs/004-remove-copilot-sdk/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
contracts/ ✅

**Tests**: Required per Constitution Principle VIII — Contract Testing. Contract
tests in `tests/contract/` verify the new `src/copilot/` module's HTTP
interface.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing. US1 (Direct HTTP Communication) and US2 (Token
Exchange) are tightly coupled foundations; US3 and US4 build on them cleanly.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Include exact file paths in all task descriptions

---

## Phase 1: Setup

**Purpose**: Create the new module structure before implementation begins.

- [x] T001 Create directory `src/copilot/` (new module for direct HTTP client)
- [x] T002 [P] Verify `deno.json` compilerOptions and understand existing task
      definitions before editing

---

## Phase 2: Foundational — OpenAI Types (Shared by US1 + US2)

**Purpose**: Define all new OpenAI-format types that US1 and US2 both depend on.
This phase MUST complete before any US1 or US2 implementation begins.

**⚠️ CRITICAL**: No US1/US2 implementation can proceed until T003 is done.

- [x] T003 Create `src/copilot/types.ts` with all OpenAI-compatible types:
  - `CopilotToken { token: string; expiresAt: number; refreshIn: number }`
    (parse `expires_at` ISO string → milliseconds, store `refresh_in` as-is)
  - `OpenAIMessage { role: "system" | "user" | "assistant"; content: string }`
  - `OpenAIChatRequest { model: string; messages: OpenAIMessage[]; max_tokens: number; stream?: boolean; temperature?: number; top_p?: number }`
  - `OpenAIChatResponse { id: string; object: "chat.completion"; choices: OpenAIChoice[]; usage: OpenAIUsage }`
  - `OpenAIChoice { index: number; message: OpenAIMessage; finish_reason: "stop" | "length" | null }`
  - `OpenAIUsage { prompt_tokens: number; completion_tokens: number; total_tokens: number }`
  - `OpenAIStreamChunk { id: string; object: "chat.completion.chunk"; choices: OpenAIStreamChoice[] }`
  - `OpenAIStreamChoice { index: number; delta: OpenAIStreamDelta; finish_reason: "stop" | "length" | null }`
  - `OpenAIStreamDelta { role?: "assistant"; content?: string }`
  - Helper
    `finishReasonToStopReason(r: string | null): "end_turn" | "max_tokens" | null`
    (maps `"stop"` → `"end_turn"`, `"length"` → `"max_tokens"`, `null` → `null`)

**Checkpoint**: `T003` done — US1 and US2 implementation can now proceed in
parallel.

---

## Phase 3: User Story 2 — Token Exchange and Caching (Priority: P1) 🔑

**Goal**: In-memory Copilot token cache with proactive refresh. No SDK involved.

**Independent Test**: Call `getToken()` twice; assert only one `fetch` call is
made to `https://api.github.com/copilot_internal/v2/token`. Call again after
setting cached token's `expiresAt` to `Date.now() - 1`; assert a second `fetch`
call is made.

### Contract Tests for User Story 2 ⚠️

- [x] T004 [P] [US2] Write contract test `tests/contract/token_test.ts`:
  - Test `getToken()` with no cache → makes one GET to token endpoint, caches
    result
  - Test `getToken()` with valid cache → returns cached token, zero fetch calls
  - Test `getToken()` with expired cache (`expiresAt` in past) → re-fetches
  - Test `getToken()` with near-expiry cache (`expiresAt` within 60s) →
    re-fetches
  - Test 401 response → throws `TokenInvalidError`
  - Test 403 response → throws `SubscriptionRequiredError`
  - Test 429 response → throws `RateLimitError`
  - Use `fetch` stub/mock; do not make real network calls

### Implementation for User Story 2

- [x] T005 [US2] Create `src/copilot/token.ts`:
  - Module-level `let cachedToken: CopilotToken | null = null`
  - `function isTokenFresh(t: CopilotToken): boolean` — returns true if
    `t.expiresAt - Date.now() > 60_000`
  - `async function exchangeToken(githubToken: string): Promise<CopilotToken>` —
    `GET https://api.github.com/copilot_internal/v2/token` with
    `Authorization: token <githubToken>` and `Accept: application/json`; parse
    response JSON; convert `expires_at` ISO string to milliseconds for
    `expiresAt`; map 401 → `TokenInvalidError`, 403 →
    `SubscriptionRequiredError`, 429 → `RateLimitError`, 5xx → `NetworkError`
  - `async function getToken(): Promise<CopilotToken>` — loads GitHub token from
    `createTokenStore()` in `src/lib/token.ts`; returns `cachedToken` if fresh;
    otherwise calls `exchangeToken()` and updates `cachedToken`
  - `function clearTokenCache(): void` — resets `cachedToken = null` (for
    testing)
  - Import error types from `src/lib/errors.ts`; import `createTokenStore` from
    `src/lib/token.ts`

**Checkpoint**: US2 complete — `getToken()` works and is independently testable.

---

## Phase 4: User Story 1 — Direct Copilot HTTP Communication (Priority: P1) 🎯 MVP

**Goal**: Replace the SDK session + CLI binary with direct `fetch` calls to the
Copilot chat completions endpoint. Anthropic-facing API is unchanged.

**Independent Test**: Send `POST /v1/messages` to the running proxy; verify the
response is Anthropic-formatted and that no CLI process was spawned (check via
`ps aux`).

### Contract Tests for User Story 1 ⚠️

- [x] T006 [P] [US1] Write contract test
      `tests/contract/copilot_client_test.ts`:
  - Test `chat()` non-streaming: stub fetch to return an `OpenAIChatResponse`;
    assert returned `ProxyResponse` has correct `content[0].text`,
    `stop_reason: "end_turn"`, and mapped `usage.input_tokens` /
    `usage.output_tokens`
  - Test `chat()` with `finish_reason: "length"` → `stop_reason: "max_tokens"`
  - Test `chatStream()`: stub streaming SSE response; assert `onChunk` is called
    with `message_start`, `content_block_start`, one or more
    `content_block_delta`, then `content_block_stop`, `message_delta`,
    `message_stop` in that order
  - Test Anthropic→OpenAI message mapping: `system` field prepended as
    `{ role: "system" }` message; `messages[]` passed through unchanged
  - Test 401 response → `authentication_error` in returned `ProxyResponse`
  - Test 503 response → `overloaded_error` in returned `ProxyResponse`

### Implementation for User Story 1

- [x] T007 [US1] Create `src/copilot/client.ts`:
  - `const COPILOT_CHAT_URL = "https://api.githubcopilot.com/chat/completions"`
  - `function buildHeaders(copilotToken: string): Record<string, string>` —
    returns headers: `Authorization: Bearer <copilotToken>`,
    `Content-Type: application/json`, `Editor-Version: vscode/1.96.0`,
    `Editor-Plugin-Version: copilot-chat/0.24.0`,
    `Copilot-Integration-Id: vscode-chat`,
    `openai-intent: conversation-completions`
  - `function toOpenAIMessages(req: ProxyRequest): OpenAIMessage[]` — prepend
    system as `{ role: "system", content: req.system }` if present, then spread
    `req.messages`
  - `async function chat(request: ProxyRequest): Promise<ProxyResponse>` — calls
    `getToken()`, builds `OpenAIChatRequest`, POSTs to `COPILOT_CHAT_URL`, maps
    `OpenAIChatResponse` → `ProxyResponse` using `finishReasonToStopReason` and
    usage field rename; wraps non-200 into `ProxyResponse` with Anthropic error
    content
  - `async function chatStream(request: ProxyRequest, onChunk: (e: StreamEvent) => void): Promise<void>`
    — calls `getToken()`, POSTs with `stream: true`, reads response body as a
    `ReadableStream<Uint8Array>`, decodes lines, parses SSE `data:` lines, skips
    `data: [DONE]`; emits Anthropic events in sequence: first content chunk
    triggers `message_start` + `content_block_start`; each `delta.content` →
    `content_block_delta`; `finish_reason` set → `content_block_stop` +
    `message_delta` + `message_stop`
  - Import `ProxyRequest`, `ProxyResponse`, `StreamEvent`, `generateMessageId`
    from `src/server/types.ts`; import `getToken` from `src/copilot/token.ts`;
    import OpenAI types from `src/copilot/types.ts`

- [x] T008 [US1] Create `src/copilot/mod.ts` — barrel exports:
  ```typescript
  export { chat, chatStream } from "./client.ts";
  export { clearTokenCache, getToken } from "./token.ts";
  export type * from "./types.ts";
  ```

- [x] T009 [US1] Rewrite `src/server/copilot.ts`:
  - Remove ALL imports from `@github/copilot-sdk`
  - Replace `createSession()`, `getClient()` with imports of `chat` and
    `chatStream` from `src/copilot/mod.ts`
  - Rewrite `chat(request)` to call `copilotChat(request)` from the new module
    (rename import to avoid collision); return result directly
  - Rewrite `chatStream(request, onChunk)` to call
    `copilotChatStream(request, onChunk)` from the new module
  - **`stopClient()`**: remove the function body and replace with a no-op stub
    (`export async function stopClient(): Promise<void> {}`) to keep callers in
    `tests/contract/proxy_test.ts` compiling without modification; the HTTP
    model has no persistent client connection to close
  - Keep `countTokens()` function unchanged (uses local `estimateTokens`, no
    SDK)
  - Remove `transformToPrompt()` helper (now handled inside
    `src/copilot/client.ts`)
  - Keep `estimateTokens()` helper for `countTokens()`

**Checkpoint**: US1 complete — proxy serves `/v1/messages` via direct HTTP, no
SDK.

---

## Phase 5: User Story 3 — Token Validation Without SDK (Priority: P2)

**Goal**: Remove `CopilotClient` from `src/cli/auth.ts`; use token exchange as
probe.

**Independent Test**: Call `validateToken` with a stubbed `getToken` that
resolves → returns `true`. Call with stubbed `getToken` that throws
`TokenInvalidError` → returns `false`.

- [x] T010 [US3] Update `src/cli/auth.ts`:
  - Remove `import { CopilotClient } from "@github/copilot-sdk"`
  - Add `import { getToken, clearTokenCache } from "../copilot/mod.ts"`
  - Rewrite `validateToken(token: AuthToken): Promise<boolean>`:
    - Return `false` early if `!token || !isTokenValid(token)`
    - Call `clearTokenCache()` to force a fresh exchange (avoids using stale
      cache)
    - Call `await getToken()` — if it resolves, return `true`
    - Catch `TokenExpiredError | TokenInvalidError` → return `false`
    - Catch `SubscriptionRequiredError` → return `false`
    - Re-throw other errors

**Checkpoint**: US3 complete — `src/cli/auth.ts` has zero SDK imports.

---

## Phase 6: User Story 4 — SDK and Patch Script Removal (Priority: P2)

**Goal**: Eliminate all SDK artifacts from the repository.

**Independent Test**: `grep -r "@github/copilot-sdk" src/ tests/ deno.json` →
zero matches. `ls scripts/patch_copilot_sdk.ts` → file not found.

- [x] T011 [US4] Delete `scripts/patch_copilot_sdk.ts` (remove file entirely)

- [x] T012 [US4] Update `deno.json`:
  - Remove `"@github/copilot-sdk": "npm:@github/copilot-sdk@0.1.32"` from
    `imports`
  - Remove `"patch:copilot-sdk"` task from `tasks`
  - Update `"dev"` task to: `"deno run -A --watch src/cli/main.ts"` (remove
    `deno task patch:copilot-sdk &&` prefix)
  - Update `"test"` task to: `"deno test --allow-all"` (remove
    `deno task patch:copilot-sdk &&` prefix)
  - Keep all other tasks (`lint`, `fmt`, `fmt:check`, `check`, `quality`)
    unchanged

- [x] T013 [US4] Update existing `tests/contract/proxy_test.ts`:
  - The `import { stopClient }` on line 3 and calls on lines 80 and 100 will
    continue to compile because T009 retains `stopClient` as a no-op — **no
    change needed** to these lines
  - Remove any remaining SDK-dependent stubs or mock imports (search for
    `@github/copilot-sdk`, `CopilotClient`, `createSession`)
  - Ensure tests still pass by mocking `fetch` instead of SDK sessions if needed
  - Verify the file compiles cleanly: `deno check tests/contract/proxy_test.ts`

- [x] T014 [P] [US4] Verify zero SDK references remain:
  - Run `grep -r "@github/copilot-sdk" src/ tests/ deno.json scripts/` and
    assert no output
  - Run
    `grep -r "CopilotClient\|copilot-sdk\|patch_copilot" src/ tests/ deno.json`
    and assert no output

**Checkpoint**: All SDK artifacts removed. Repository is fully self-contained.

---

## Phase 7: Polish & Final Validation

**Purpose**: Quality gate, cleanup, and cross-cutting verification.

- [x] T015 [P] Run `deno lint` — fix any linting errors in new/modified files
- [x] T016 [P] Run `deno fmt` — auto-format all new/modified TypeScript files
- [x] T016b Run `deno check tests/contract/*.ts` — verify all existing test
      files compile against the rewritten `src/server/copilot.ts` before
      proceeding to Phase 6 SDK removal
- [x] T017 Run `deno check src/**/*.ts tests/**/*.ts` — fix any type errors
- [x] T018 Run `deno test --allow-all` — all tests must pass including new
      contract tests
- [x] T019 Run `deno task quality` — canonical quality gate from `deno.json`;
      must pass cleanly with zero errors
- [x] T020 [P] Run quickstart validation from
      `specs/004-remove-copilot-sdk/quickstart.md`:
  - Confirm `grep -r "@github/copilot-sdk" src/ tests/ deno.json` → zero matches
  - Confirm `ls scripts/patch_copilot_sdk.ts` → not found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all implementation
  phases
- **US2 (Phase 3)**: Depends on Phase 2 (needs `CopilotToken` type from T003)
- **US1 (Phase 4)**: Depends on Phase 2 AND Phase 3 (`T005` must exist for
  `getToken()`)
- **US3 (Phase 5)**: Depends on Phase 3 (`getToken()` + `clearTokenCache()` must
  exist)
- **US4 (Phase 6)**: Depends on Phase 4 + Phase 5 (SDK must not be needed
  anywhere)
- **Polish (Phase 7)**: Depends on all prior phases complete

### Task-Level Critical Path

```
T001 → T003 → T005 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T015–T020
               ↑                               ↑
              T004 (parallel test)         T006 (parallel test)
```

### Parallel Opportunities Within Phases

- **Phase 2** (after T003 done): T004, T006, and T007 can all start in parallel
  (T007 imports `getToken` from T005 but can be written as a file stub before
  T005 exists; full compilation requires T005 — do not run `deno check` on T007
  until T005 is done)
- **Phase 6**: T011 and T012 can run in parallel (different files)
- **Phase 7**: T015, T016, T020 can run in parallel

---

## Parallel Execution Examples

### After T003 (Foundational Types) Done

```bash
# T004 and T006 are fully independent and can launch simultaneously:
Task T004: "Write tests/contract/token_test.ts"     # tests only; needs T003 types
Task T006: "Write tests/contract/copilot_client_test.ts"  # tests only; needs T003 types
# T007 may be stubbed in parallel but requires T005 to compile — start after T005 if in doubt
```

### Phase 6: SDK Cleanup

```bash
# Run in parallel:
Task T011: "Delete scripts/patch_copilot_sdk.ts"
Task T012: "Update deno.json"
```

---

## Implementation Strategy

### MVP (US1 + US2 only — Phases 1–4)

1. Complete Phase 1: Setup (`src/copilot/` directory)
2. Complete Phase 2: OpenAI types (`T003`)
3. Complete Phase 3: Token exchange (`T004`, `T005`)
4. Complete Phase 4: HTTP client + server rewrite (`T006`–`T009`)
5. **STOP and VALIDATE**: `POST /v1/messages` works end-to-end, no SDK spawned

### Full Delivery

6. Complete Phase 5: Remove last SDK usage from auth (`T010`)
7. Complete Phase 6: Delete SDK artifacts (`T011`–`T014`)
8. Complete Phase 7: Quality gate (`T015`–`T020`)

### Verification Checkpoints

After each phase, verify the phase checkpoint criterion before proceeding:

- Phase 3 ✓: `getToken()` caches correctly (two calls → one fetch)
- Phase 4 ✓: Proxy serves `/v1/messages` via direct HTTP, zero SDK imports in
  `src/server/`
- Phase 5 ✓: `grep "@github/copilot-sdk" src/cli/auth.ts` → no output
- Phase 6 ✓: `grep -r "@github/copilot-sdk" src/ tests/ deno.json` → no output
- Phase 7 ✓: `deno task quality` passes cleanly

---

## Notes

- `[P]` tasks touch different files and have no incomplete dependencies — safe
  to parallelize
- `countTokens()` in `src/server/copilot.ts` does NOT need to call the Copilot
  API — keep `estimateTokens()` as-is
- Do NOT modify `src/server/types.ts` — the Anthropic-facing contract is
  unchanged
- Do NOT modify `src/lib/token.ts` or `src/lib/errors.ts` — reuse existing types
- Write tests BEFORE implementation for T004 and T006 (contract-first per
  Constitution VIII)
- Commit after each phase checkpoint to keep the branch history clean
