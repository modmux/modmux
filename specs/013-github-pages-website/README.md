---
status: in-progress
created: 2026-03-18
priority: high
tags:
- website
- github-pages
- docs
- marketing
- installation
created_at: 2026-03-18T15:52:25.490625Z
updated_at: 2026-03-18T16:00:29.510060Z
transitions:
- status: in-progress
  at: 2026-03-18T16:00:29.510060Z
---

# GitHub Pages Website

## Overview

Create a public website for Coco hosted on GitHub Pages that explains why the tool exists, what it does, how to install it quickly, and how it works at a high level. The first release should optimize for a single-page experience that helps a new visitor move from curiosity to successful installation without needing to read the repository README first.

## Problem

Coco already has solid repository documentation, but it does not have a purpose-built public website that quickly communicates its value to new users. The current README is useful once a visitor is already inside the repository, but it is not structured as a concise product site with a clear narrative around the problem Coco solves, the agents it supports, the trust boundaries of a local proxy, and the easiest installation path.

Key gaps:

- No dedicated landing page for discovery and positioning
- No concise explanation of why Coco is needed for people unfamiliar with local AI gateways
- Installation instructions exist, but they are embedded in repo docs instead of presented as a short guided path
- "How it works" details exist, but they are not framed for first-time understanding
- No FAQ, comparison, roadmap, or visual proof points intended for public adoption

## Requirements

- [x] **R-001** The website MUST be compatible with GitHub Pages static hosting with no required server-side runtime.
- [x] **R-002** The first release MUST be a single-page site optimized for first-time visitors evaluating whether to use Coco.
- [x] **R-003** The page MUST explain why Coco is needed, including the problem of connecting multiple coding agents to GitHub Copilot through a consistent local gateway.
- [x] **R-004** The page MUST explain what Coco does in plain language before introducing internal implementation details.
- [x] **R-005** The page MUST include a straightforward installation section with clearly separated paths for npm, JSR/Deno, direct binary download, and source-based setup if that path is retained.
- [x] **R-006** Installation instructions MUST be concise enough that a new user can identify the recommended path in under 30 seconds.
- [x] **R-007** The page MUST include a "How it works" section that explains the local proxy flow, supported endpoint compatibility, and the role of agent configuration.
- [x] **R-008** The page MUST clearly communicate trust and operating boundaries, including that Coco runs locally, binds to localhost, and rewrites agent configuration reversibly.
- [x] **R-009** The page MUST include a supported agents section aligned with the current built-in agent registry.
- [x] **R-010** The page MUST include an FAQ section covering common adoption and setup questions.
- [x] **R-011** The page MUST include a comparison or positioning section that clarifies when Coco is useful and why a user would choose it over manual per-agent setup.
- [x] **R-012** The page MUST include a roadmap or status section that reflects current project maturity without promising unsupported functionality.
- [x] **R-013** The page MUST reserve space for screenshots or demo media so the product can be shown visually, even if placeholders are used initially.
- [x] **R-014** The content MUST reuse verified repository facts where possible and MUST NOT repeat outdated Claudio branding from older documentation.
- [x] **R-015** The content and structure MUST remain consistent with Coco's calm, clear product voice and current terminology.
- [x] **R-016** The page MUST be usable on both desktop and mobile screen sizes.

## Non-Goals

- Building a full multi-page documentation portal in the first release
- Replacing the repository README as the canonical developer document
- Adding analytics, blog infrastructure, search, or account features
- Redesigning Coco's product scope or changing runtime behavior
- Migrating every existing documentation page into the website

## Technical Notes

### Recommended Information Architecture

The single-page website should be structured in this order:

1. Hero section with one-sentence value proposition and primary install/action links
2. Why Coco section explaining the problem and intended audience
3. What It Does section summarizing supported protocols, local service behavior, and agent support
4. Installation section with the recommended path first and alternatives below it
5. How It Works section with a simple request-flow diagram or equivalent explanation
6. Supported Agents section
7. Screenshots or demo section
8. Comparison or positioning section
9. FAQ section
10. Roadmap or status section

### Content Sources

Implementation should reuse and adapt accurate material from:

- `README.md` for product description, install methods, quick start, supported agents, and architecture summary
- `CONVENTIONS.md` for messaging boundaries such as calm UX, transparency, and localhost-only behavior
- Current source code and agent registry for supported-agent accuracy

The implementation should not copy wording from older docs without review because some files still contain outdated Claudio references.

### Hosting Constraints

The site should be implementable as static assets that can be published directly from GitHub Pages. Any framework choice must ultimately produce a static export suitable for repository-based hosting.

## Acceptance Criteria

- A new visitor can explain Coco's purpose and intended use after reading only the landing page
- A new visitor can identify a recommended installation path quickly without reading internal repo documentation first
- A new visitor can understand the high-level request flow between coding agents, Coco, and GitHub Copilot
- A new visitor can find answers to common trust and setup questions from the page alone
- The website scope is clearly limited to a public-facing product site and does not implicitly expand into a full docs migration

## Plan

- [x] Audit current repository messaging and installation instructions for reuse
- [x] Define the final site copy outline and section-level messaging goals
- [x] Choose a GitHub Pages-compatible static implementation approach
- [x] Build the single-page site structure and navigation
- [x] Add installation, how-it-works, FAQ, positioning, and roadmap content
- [x] Add screenshots or demo media, or placeholders if media is not yet available
- [x] Verify mobile layout and GitHub Pages deployment compatibility
- [ ] Update repository documentation to link to the published site when ready

## Test

- [x] Verify all public claims on the site against repository docs and source code
- [x] Verify each installation path shown on the site matches a supported installation method
- [x] Verify the page renders correctly as a static site under GitHub Pages constraints
- [x] Verify key sections are readable and navigable on mobile and desktop
- [x] Verify the page does not contain outdated Claudio naming or unsupported feature claims

## Notes

This spec should remain focused on the public website itself. If the project later needs a broader documentation site, that should be handled as a follow-on spec rather than expanding the first release beyond a clear landing-page experience.

Implementation status on 2026-03-18:

- Added a static GitHub Pages site under `site/` with `index.html`, `styles.css`, `app.js`, and `favicon.svg`
- Added `.github/workflows/pages.yml` to deploy the `site/` directory with GitHub Pages Actions
- Site content was aligned to current code facts, including the current built-in agent registry (`claude-code`, `cline`, `codex`) rather than older README claims
- Updated `README.md` to point readers at the intended public site URL (`https://myty.github.io/coco/`)
- Publication is still blocked externally: the Pages URL returns `404` until GitHub Pages is enabled to publish via GitHub Actions in repository settings
