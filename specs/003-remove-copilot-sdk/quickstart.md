# Quickstart: Remove Copilot SDK Migration

## What changed

Claudio no longer uses the `@github/copilot-sdk` npm package or any Copilot CLI
binary. All communication with GitHub Copilot happens over plain HTTPS using
Deno's built-in `fetch`.

## Architecture

```
Claude Code
    │  POST /v1/messages (Anthropic format)
    ▼
src/server/router.ts  →  src/server/copilot.ts
                                │
                                │  uses
                                ▼
                         src/copilot/client.ts
                                │
                  ┌─────────────┴──────────────────┐
                  │                                 │
                  ▼                                 ▼
     src/copilot/token.ts          POST https://api.githubcopilot.com
     (token exchange cache)         /chat/completions
                  │
                  ▼
     GET https://api.github.com
     /copilot_internal/v2/token
```

## Running locally

```bash
# Quality gate (must pass before any merge)
deno task quality

# Start dev server (no patch step needed)
deno task dev

# Run tests
deno test --allow-all
```

## Token flow

1. On first proxy request, `src/copilot/token.ts` calls the token exchange
   endpoint using the GitHub OAuth token from `~/.claudio/tokens.json`.
2. The returned Copilot token is cached in memory for the duration of the
   process.
3. The token is refreshed automatically ~25 minutes in (60-second safety
   margin).

## Environment variables

| Variable       | Default | Description       |
| -------------- | ------- | ----------------- |
| `CLAUDIO_PORT` | `8080`  | Proxy listen port |

No additional variables are required. The GitHub OAuth token is read from the
token store, not from the environment.

## Verifying the migration

```bash
# Should return zero matches
grep -r "@github/copilot-sdk" src/ tests/ deno.json

# Should not exist
ls scripts/patch_copilot_sdk.ts 2>/dev/null && echo "FOUND" || echo "DELETED OK"
```
