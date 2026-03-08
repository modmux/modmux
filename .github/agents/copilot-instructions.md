# claudio Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-07

## Active Technologies

- Deno 2.x + TypeScrip + None (zero runtime deps; Deno std lib only)
  (006-release-distribution)
- `deno.json` (version source of truth), `src/version.ts`
  (006-release-distribution)

- Deno (latest stable) + TypeScrip + Deno std/http (existing), native `fetch`
  (built-in — no new deps) (004-remove-copilot-sdk)

## Project Structure

```text
src/
tests/
```

## Commands

# Add commands for Deno (latest stable) + TypeScrip

## Code Style

Deno (latest stable) + TypeScrip: Follow standard conventions

## Recent Changes

- 006-release-distribution: Added Deno 2.x + TypeScrip + None (zero runtime
  deps; Deno std lib only)

- 004-remove-copilot-sdk: Added Deno (latest stable) + TypeScrip + Deno std/http
  (existing), native `fetch` (built-in — no new deps)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
