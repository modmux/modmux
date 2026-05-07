---
status: complete
created: 2026-04-14
created_at: 2026-04-24T02:44:41.958485Z
updated_at: 2026-04-24T02:44:41.958485Z
completed_at: 2026-04-24T02:44:41.958485Z
transitions:
  - status: complete
    at: 2026-04-24T02:44:41.958485Z
title: Conventional Commit Release Notes
---

# Conventional Commit Release Notes

## Specification

### Background

The current release workflow (`.github/workflows/release.yml`) triggers on git
tags matching `v[0-9]*.[0-9]*.[0-9]*`. It successfully:

- Builds binaries for 5 platforms (macOS arm64/x64, Linux arm64/x64, Windows
  x64)
- Creates GitHub releases with `softprops/action-gh-release`
- Attaches binaries and release-manifest.json
- Handles pre-release detection

However, the release notes are generated using GitHub's auto-generated notes
(`generate_release_notes: true`), which:

- Lists PR titles rather than individual commits
- Cannot filter by commit type (feat, fix, docs, etc.)
- Less detailed than proper conventional commit-based changelogs

### Proposal

Enhance the release workflow to generate release notes from conventional commits
between tags, providing:

- Categorized changelog (Features, Bug Fixes, etc.)
- Individual commit messages with SHA references
- Consistent formatting aligned with the project's conventional commit
  convention

### User Scenarios & Testing

#### User Story 1 — View Categorized Release Notes (Priority: P1)

A user viewing a GitHub Release sees properly categorized changelog entries
grouped by commit type.

**Acceptance Scenarios**:

1. **Given** a release is created from tag `v0.3.0`, **When** the release notes
   are displayed, **Then** commits are grouped into sections (Features, Bug
   Fixes, etc.) based on conventional commit types.
2. **Given** a commit message follows `feat: add dark mode`, **When** release
   notes are generated, **Then** it appears under "New Features" section.
3. **Given** a commit message follows `fix: resolve login timeout`, **When**
   release notes are generated, **Then** it appears under "Bug Fixes" section.
4. **Given** a commit contains `BREAKING CHANGE:` in body, **When** release
   notes are generated, **Then** it appears prominently at the top with warning
   styling.

### Technical Specification

#### Implementation

Add `loopwerk/tag-changelog@v1` action to the release job before the release
creation step.

**Changes to `.github/workflows/release.yml`**:

1. Add step before `softprops/action-gh-release`:
   ```yaml
   - name: Generate changelog
     id: changelog
     uses: loopwerk/tag-changelog@v1
     with:
       token: ${{ secrets.GITHUB_TOKEN }}
   ```

2. Modify release step to use generated changelog:
   ```yaml
   - uses: softprops/action-gh-release@v2
     with:
       body: ${{ steps.changelog.outputs.changes }}
       generate_release_notes: false # replaced by explicit body
       # ... other settings unchanged
   ```

#### Action Configuration

- **Action**: `loopwerk/tag-changelog@v1`
- **Token**: `${{ secrets.GITHUB_TOKEN }}` (required for GitHub API access)
- **Default behavior**: Includes all commit types, no exclusions (per user
  requirement)
- **Output**: `changes` - Markdown formatted changelog without version header
  (suitable for GitHub Release body)

#### Validation

No additional testing required - the action is well-maintained and tested.
Existing workflow validation (`deno task quality`) confirms no regressions.

### Dependencies

- **loopwerk/tag-changelog@v1**: Active maintenance, ~150 stars, MIT licensed
- No additional runtime dependencies
- No configuration files required

### Risks & Mitigation

| Risk                                     | Likelihood | Impact | Mitigation                                                                                                                         |
| ---------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Action becomes unmaintained              | Low        | Medium | Well-established action with 12 releases; alternatives available (requarks/changelog-action, TriPSs/conventional-changelog-action) |
| First release has no previous tag        | Low        | Low    | First release will show all commits from repo start; subsequent releases work normally                                             |
| Commits don't follow conventional format | Low        | Medium | Action handles non-conventional commits gracefully; they appear in output but ungrouped                                            |

### Timeline

- Implementation: ~15 lines added to workflow
- Testing: Create test tag `v0.3.0-test` to verify changelog generation
  (optional)
- No breaking changes
