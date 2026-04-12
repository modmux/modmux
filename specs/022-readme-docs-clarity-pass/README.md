---
status: complete
created: 2026-04-12
priority: high
tags:
  - docs
  - readme
  - content
  - editorial
created_at: 2026-04-12T02:37:15.349759Z
updated_at: 2026-04-12T02:41:52.749023Z
completed_at: 2026-04-12T02:41:52.749023Z
transitions:
  - status: complete
    at: 2026-04-12T02:41:52.749023Z
---

# README and Documentation Clarity Pass

## Overview

Improve the README and user-facing documentation so Modmux is faster to
understand and easier to scan. The goal is a documentation set that is clear,
direct, and deliberately short, with less overlap between surfaces and less
accumulated prose.

## Design

### Documentation roles

- **README.md** should answer: what Modmux is, why someone would use it, how to
  install it, how to do the first successful setup, and where deeper docs live.
- **docs/getting-started.md** should be the shortest reliable path from install
  to first working request.
- **docs/troubleshooting.md** should be solution-first and should not repeat
  tutorial content unless needed for a fix.
- **docs/api/*.md** should act as reference docs: concise context, accurate
  request/response details, and practical examples without repeated product
  explanation.
- **CONTRIBUTING.md** should stay contributor-focused rather than duplicating
  user onboarding.

### Editorial rules

- Lead with the answer, not the preamble.
- Prefer short sentences and scan-first structure.
- One purpose per section.
- Remove duplicated explanation across files.
- Avoid promotional language and filler.
- Keep product terminology consistent across all doc surfaces.

### Scope boundaries

- In scope: `README.md`, `CONTRIBUTING.md`, `docs/getting-started.md`,
  `docs/troubleshooting.md`, `docs/api/*.md`, and any lightweight supporting
  style guidance needed to keep the docs concise.
- Out of scope: website landing page copy, agent instruction files, changelog
  history, and product/runtime changes.

## Plan

- [x] Audit the current README, CONTRIBUTING guide, onboarding docs,
      troubleshooting docs, and API docs for verbosity, duplication, and unclear
      section ownership.
- [x] Define the job of each doc surface and identify overlap that should be
      removed instead of rewritten in multiple places.
- [x] Rewrite the README around a scan-first structure: product definition,
      recommended install path, short quick start, and links to deeper docs.
- [x] Tighten `docs/getting-started.md` and `docs/troubleshooting.md` so each is
      shorter, more task-focused, and free of repeated explanatory scaffolding.
- [x] Review `docs/api/*.md` for repeated background context, overly long
      examples, and wording that can be compressed without losing reference
      value.
- [x] Add or update lightweight documentation writing guidance so future docs
      stay concise and consistent.
- [x] Verify commands, paths, versions, and examples against the current CLI and
      repository state.

## Test

- [x] A new visitor can explain what Modmux is and how to begin from the README
      alone.
- [x] Each documentation surface has a distinct role with less duplicated
      content between files.
- [x] Headings and opening paragraphs are concrete and do not merely restate
      each other.
- [x] Terminology is consistent for Modmux, GitHub Copilot, supported agents,
      install methods, and endpoint names.
- [x] Commands and examples shown in docs remain accurate against the current
      repository and CLI behavior.

## Notes

This should be treated as a follow-up to the earlier editorial cleanup, not a
restart of the website work. If the audit shows that README and docs overlap
because the documentation architecture is unclear, prefer sharpening surface
ownership over simply trimming sentences.
