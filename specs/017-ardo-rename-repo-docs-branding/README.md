---
status: complete
created: 2026-03-21
priority: high
tags:
- rename
- docs
- branding
- github
depends_on:
- 015-ardo-rename-core-runtime-cli
- 016-ardo-rename-config-env-migration
parent: 014-coco-to-ardo-rename
created_at: 2026-03-21T02:09:18.093913Z
updated_at: 2026-03-21T02:24:53.255908Z
completed_at: 2026-03-21T02:24:53.255908Z
transitions:
- status: in-progress
  at: 2026-03-21T02:21:59.433062Z
- status: complete
  at: 2026-03-21T02:24:53.255908Z
---

# Ardo Rename Child: Repository, Documentation, and Branding

## Overview

Apply Ardo naming across repository metadata, documentation, GitHub references, templates, workflow text, and visual branding assets.

## Design

This child spec covers all public-facing identity surfaces:

- org/repo URLs and badge links updated to `ardo-org`
- README/docs/examples/diagrams updated to Ardo terms
- issue/PR templates and workflow metadata updated
- logos/icons/social preview assets refreshed for Ardo
- website and marketing references aligned with new brand language

## Plan

- [x] Build inventory of docs, templates, workflows, and brand assets with Coco references.
- [x] Update GitHub organization/repository links and badges.
- [x] Update all active documentation and examples to Ardo terminology.
- [x] Update conceptual diagrams and architecture text labels.
- [x] Replace visible branding assets and metadata (logos, social previews, titles).
- [x] Validate internal and external links after updates.

## Test

- [x] No unintended Coco references remain in active docs/workflows/assets.
- [x] Badge/link checks pass for updated org/repo endpoints.
- [x] Updated docs command examples are accurate and runnable.
- [x] Social preview and branding assets render correctly.

## Notes

Maps from umbrella requirements: R-001, R-006, R-007, R-008, R-009, R-010, R-011, R-016, R-017, R-023.

Implementation progress (2026-03-21):

- Updated active documentation and public website copy from Coco to Ardo across:
  - `README.md`
  - `AGENTS.md`
  - `CONVENTIONS.md`
  - `site/index.html`
  - `site/favicon.svg`
  - docs templates and workflow text in `.github/workflows/` where applicable
- Updated GitHub org/repo and website links to `ardo-org/ardo` targets in active docs/site content.
- Updated command examples and path references to `ardo` and `~/.ardo`.
- Verified there are no remaining `Coco`/`coco` references in active docs/workflow/site scope using repository grep checks.
- Ran docs validation successfully with no warnings or errors:
  - `deno run --allow-read scripts/docs/validate.ts --format json README.md AGENTS.md CONVENTIONS.md`
- No issue/PR template files were present to update in this repository snapshot.