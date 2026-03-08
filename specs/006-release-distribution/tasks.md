---
description: "Task list for Release Distribution feature implementation"
---

# Tasks: Release Distribution

**Feature**: `006-release-distribution`\
**Input**: Design documents from `specs/006-release-distribution/`\
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅
contracts/ ✅ quickstart.md ✅\
**Tests**: No TDD — implementation tasks only (per user request)

**Organization**: Tasks grouped by user story to enable independent
implementation and testing.

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label (US1–US4) — omitted for Setup, Foundational, and
  Polish phases
- File paths are exact and relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold all new directories and files; extend `deno.json` with
fields required by every downstream phase. No story can begin until these exist.

- [x] T001 Add `name` (`"@myty/claudio"`), `version` (`"0.1.0"`), `exports`
      (`{ ".": "./src/cli/main.ts" }`), and `compile.permissions` (`net`, `env`,
      `run`, `read`, `write`) fields to `deno.json`
- [x] T002 Create `src/version.ts` with initial hand-written
      `export const VERSION = "0.1.0"` constant (must match `deno.json` version)
- [x] T003 [P] Scaffold `npm/claudio/` directory tree: create stub
      `npm/claudio/package.json`, empty `npm/claudio/bin/claudio.js`, and empty
      `npm/claudio/README.md`
- [x] T004 [P] Scaffold all five platform package directories with stub
      `package.json` files: `npm/@claudio/darwin-arm64/package.json`,
      `npm/@claudio/darwin-x64/package.json`,
      `npm/@claudio/linux-x64/package.json`,
      `npm/@claudio/linux-arm64/package.json`,
      `npm/@claudio/win32-x64/package.json`
- [x] T005 [P] Create stub `scripts/sync-version.ts` (empty Deno script;
      implementation in Foundational phase)

**Checkpoint**: Directories exist, `deno.json` has JSR-required fields, and
`src/version.ts` is present.

---

## Phase 2: Foundational (Version Infrastructure)

**Purpose**: Wire `deno.json` as the single source of truth for the version
across all distribution channels. This phase **MUST** be complete before any
user story work begins, because every channel reads from `src/version.ts` or
`npm/*/package.json`.

**⚠️ CRITICAL**: `scripts/sync-version.ts` is the version invariant enforcer.
All distribution channels depend on it.

- [x] T006 Update `showVersion()` in `src/cli/main.ts` to
      `import { VERSION } from "../version.ts"` and output `Claudio v${VERSION}`
      — replacing the hardcoded `"Claudio v0.1.0"` string
- [x] T007 Implement `scripts/sync-version.ts`: read `version` from `deno.json`;
      write `export const VERSION = "X.Y.Z";` to `src/version.ts`; write
      `version` and `optionalDependencies` versions to
      `npm/claudio/package.json`; write `version` to each of the five
      `npm/@claudio/*/package.json` files
- [x] T008 Add `sync-version` task (`"deno run -A scripts/sync-version.ts"`),
      `compile` task
      (`"deno compile --allow-net --allow-env --allow-run --allow-read --allow-write --output bin/claudio src/cli/main.ts"`),
      and update the `quality` task to use `--allow-all`
      (`"deno lint && deno fmt --check && deno check && deno test --allow-all"`)
      in `deno.json` — the expanded permission set is required for new contract
      tests that spawn subprocesses and write files

**Checkpoint**: Run `deno task sync-version` — confirm `src/version.ts` VERSION
and all npm `package.json` versions match `deno.json` version. Run
`deno task quality` — all checks pass.

---

## Phase 2.5: Contract Tests — CLI Interface (Constitution VIII)

**Purpose**: Verify the stable CLI contract defined in
`contracts/cli-interface.md` is upheld by the compiled binary and the Deno entry
point. Constitution Principle VIII mandates these tests exist before any
distribution channel is released.

**⚠️ REQUIRED**: These tests must pass in CI before the release workflow uploads
any binary.

- [x] T034 Create `tests/contract/cli_interface_test.ts` — scaffold the test
      file with `Deno.test` imports and a helper `runClaudio(args: string[])`
      that spawns `deno run -A src/cli/main.ts` via `Deno.Command` and captures
      stdout/stderr + exit code
- [x] T035 [P] Add contract test in `tests/contract/cli_interface_test.ts`:
      `--version` flag — assert stdout matches `/^Claudio v\d+\.\d+\.\d+$/`,
      exit code is `0`
- [x] T036 [P] Add contract test in `tests/contract/cli_interface_test.ts`: `-v`
      alias — assert stdout matches same pattern as `--version`, exit code is
      `0`
- [x] T037 [P] Add contract test in `tests/contract/cli_interface_test.ts`:
      `--help` flag — assert stdout contains `"Usage: claudio"` and
      `"--version"`, exit code is `0`
- [x] T038 [P] Add contract test in `tests/contract/cli_interface_test.ts`: `-h`
      alias — assert stdout matches same output as `--help`, exit code is `0`

**Checkpoint**: Run `deno task quality` — all 5 new contract tests pass
alongside the existing 54 tests (59 total).

---

## Phase 3: User Story 1 — GitHub Release Binary (Priority: P1) 🎯 MVP

**Goal**: Pushing a `v*` tag produces a GitHub Release with five self-contained
platform binaries attached as assets.

**Independent Test**: Download `claudio-macos-arm64` from a GitHub Release, run
`./claudio --version`, verify it prints `Claudio v{VERSION}` and exits `0` —
without Deno installed.

- [x] T009 [US1] Create `.github/workflows/release.yml` with
      `on: push: tags: ['v[0-9]*.[0-9]*.[0-9]*']` trigger (semver guard —
      rejects non-semver tags like `vbeta` or `release/1.0` that would break the
      version invariant); add a `quality` job that runs `deno task quality`
      using `denoland/setup-deno@v1` (`deno-version: v2.x`) on `ubuntu-latest`
- [x] T010 [US1] Add `build` matrix job (`needs: quality`) to
      `.github/workflows/release.yml` with a `matrix.include` strategy
      containing all five platform entries:
      `{ platform: macos-arm64, runner: macos-latest, target: aarch64-apple-darwin, artifact: claudio-macos-arm64 }`,
      `{ platform: macos-x64, runner: macos-13, target: x86_64-apple-darwin, artifact: claudio-macos-x64 }`,
      `{ platform: linux-x64, runner: ubuntu-latest, target: x86_64-unknown-linux-gnu, artifact: claudio-linux-x64 }`,
      `{ platform: linux-arm64, runner: ubuntu-latest, target: aarch64-unknown-linux-gnu, artifact: claudio-linux-arm64 }`,
      `{ platform: windows-x64, runner: windows-latest, target: x86_64-pc-windows-msvc, artifact: claudio-windows-x64.exe }`
- [x] T011 [US1] Add `actions/checkout@v4`, `denoland/setup-deno@v1`
      (`deno-version: v2.x`), and `actions/cache@v4` (path `~/.deno`, key
      `deno-${{ runner.os }}-${{ hashFiles('deno.lock') }}`) steps to the
      `build` matrix job in `.github/workflows/release.yml`
- [x] T012 [US1] Add `deno run -A scripts/sync-version.ts` step (name: "Sync
      version") to the `build` matrix job in `.github/workflows/release.yml` to
      ensure `src/version.ts` reflects `deno.json` before compilation
- [x] T013 [US1] Add
      `deno compile --allow-net --allow-env --allow-run --allow-read --allow-write --target ${{ matrix.target }} --output ${{ matrix.artifact }} src/cli/main.ts`
      compile step to the `build` matrix job in `.github/workflows/release.yml`
- [x] T014 [US1] Add `actions/upload-artifact@v4` step to the `build` matrix job
      in `.github/workflows/release.yml` uploading `${{ matrix.artifact }}` with
      `name: ${{ matrix.artifact }}` and `retention-days: 1`
- [x] T015 [US1] Add `release` job (`needs: build`, runs-on `ubuntu-latest`) to
      `.github/workflows/release.yml` with `actions/download-artifact@v4`
      (pattern `claudio-*`, merge-multiple: true) and a shell step that
      generates `release-manifest.json` containing version (from `deno.json`),
      tag name, publish timestamp, and SHA-256 checksums for each binary
- [x] T016 [US1] Add `softprops/action-gh-release@v2` step to the `release` job
      in `.github/workflows/release.yml` with
      `files: claudio-* release-manifest.json`, `generate_release_notes: true`,
      and `permissions: contents: write`

**Checkpoint**: Push a `v0.1.0` tag — verify five binaries and
`release-manifest.json` appear on the GitHub Release page. Download
`claudio-macos-arm64`, run `./claudio --version` — prints `Claudio v0.1.0`,
exits `0`.

---

## Phase 4: User Story 2 — npm Shim Package (Priority: P2)

**Goal**: `npm install -g claudio` installs the correct platform binary via
`optionalDependencies` and places `claudio` on PATH. No Deno runtime required on
supported platforms.

**Independent Test**: Run `npm install -g claudio` in a clean Node.js 18
environment on macOS arm64. Verify `claudio --version` prints
`Claudio v{VERSION}` without Deno installed. Verify `@claudio/darwin-arm64` is
the installed platform package.

- [x] T017 [US2] Implement `npm/claudio/package.json` with: `name: "claudio"`,
      `version` (placeholder; sync-version.ts will write final value),
      `description: "GitHub Copilot bridge for Claude Code"`,
      `bin: { "claudio": "./bin/claudio.js" }`, `engines: { "node": ">=18" }`,
      and `optionalDependencies` for all five `@claudio/*` packages — per
      `contracts/npm-package.md`
- [x] T018 [US2] Implement `npm/claudio/bin/claudio.js` Node.js shim per
      `contracts/npm-package.md` resolution algorithm: (1) build platform key
      from `process.platform + " " + process.arch`; (2) map to
      `@claudio/<os>-<arch>` package name; (3) attempt
      `require.resolve("<pkg>/bin/claudio")` (with `.exe` on win32); (4) on
      success
      `const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit", shell: false }); process.exit(result.status ?? 1);`
      — use `spawnSync` (not `execFileSync`) so the exit code is returned rather
      than thrown; (5) on failure check if `deno` is on PATH and
      `spawnSync("deno", ["run", "-A", "jsr:@myty/claudio", ...], { stdio: "inherit" })`;
      (6) if neither,
      `console.error("Claudio is not supported on this platform…")` and
      `process.exit(1)`
- [x] T019 [US2] Write `npm/claudio/README.md` with: npm install command
      (`npm install -g claudio`), supported platform table (5 platforms mapped
      to `@claudio/*` package names), fallback behaviour description, and link
      to GitHub Releases for manual binary download
- [x] T020 [P] [US2] Implement `npm/@claudio/darwin-arm64/package.json` with
      `name: "@claudio/darwin-arm64"`, `version` (placeholder),
      `os: ["darwin"]`, `cpu: ["arm64"]`, `preferUnplugged: true`, `bin: {}`
- [x] T021 [P] [US2] Implement `npm/@claudio/darwin-x64/package.json` with
      `name: "@claudio/darwin-x64"`, `version` (placeholder), `os: ["darwin"]`,
      `cpu: ["x64"]`, `preferUnplugged: true`, `bin: {}`
- [x] T022 [P] [US2] Implement `npm/@claudio/linux-x64/package.json` with
      `name: "@claudio/linux-x64"`, `version` (placeholder), `os: ["linux"]`,
      `cpu: ["x64"]`, `preferUnplugged: true`, `bin: {}`
- [x] T023 [P] [US2] Implement `npm/@claudio/linux-arm64/package.json` with
      `name: "@claudio/linux-arm64"`, `version` (placeholder), `os: ["linux"]`,
      `cpu: ["arm64"]`, `preferUnplugged: true`, `bin: {}`
- [x] T024 [P] [US2] Implement `npm/@claudio/win32-x64/package.json` with
      `name: "@claudio/win32-x64"`, `version` (placeholder), `os: ["win32"]`,
      `cpu: ["x64"]`, `preferUnplugged: true`, `bin: {}`
- [x] T025 [US2] Add `publish-npm` job (`needs: release`) to
      `.github/workflows/release.yml`: (1) download all build artifacts; (2) for
      each platform package, copy binary into `npm/@claudio/<platform>/bin/` and
      `chmod +x` on non-Windows; (3) `npm publish --access public` each
      `npm/@claudio/*` package; (4) `npm publish --access public` the
      `npm/claudio` package; use `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` and
      `registry-url: https://registry.npmjs.org` via `actions/setup-node@v4`

**Checkpoint**: After a tagged release, run `npm install -g claudio@{VERSION}` —
verify `claudio --version` matches tagged version and the correct
`@claudio/<platform>` package was installed.

---

## Phase 5: User Story 3 — JSR Package (Priority: P3)

**Goal**: `deno install -A -n claudio jsr:@myty/claudio` installs Claudio for
Deno users. No compiled binary; runs from TypeScript source via Deno runtime.
Published automatically on every tagged release using OIDC (no stored secrets).

**Independent Test**: After a tagged release, run
`deno install -A -n claudio jsr:@myty/claudio`. Verify `claudio --version` works
and behaviour matches the compiled binary.

- [x] T026 [US3] Add `publish-jsr` job (`needs: quality`, independent of
      `build`/`release`) to `.github/workflows/release.yml` with
      `permissions: contents: read, id-token: write`, `denoland/setup-deno@v1`
      (`deno-version: v2.x`), and `deno publish` step (no `--token` flag — OIDC
      trusted publisher handles authentication)
- [x] T027 [US3] Add a prominent `# PREREQUISITE (one-time manual setup)`
      comment block to the `publish-jsr` job in `.github/workflows/release.yml`
      explaining: navigate to jsr.io/@myty/claudio → Publishing → "Add GitHub
      Actions publisher" → set repository to `myty/claudio` and environment to
      `""` (no environment restriction); also add this prerequisite to
      `specs/006-release-distribution/quickstart.md` under a "One-Time Setup"
      section

**Checkpoint**: After a tagged release and JSR trusted publisher configured,
verify `@myty/claudio` package appears on jsr.io with the correct version.

---

## Phase 6: User Story 4 — mise Compatibility (Priority: P3)

**Goal**: `mise use -g claudio` auto-detects the current platform, downloads the
matching binary from GitHub Releases, and puts `claudio` on PATH. Requires no
external registry registration — works out-of-the-box via the `github` backend
and the binary naming convention established in US1.

**Independent Test**: Configure mise with `github:myty/claudio`, run
`mise install claudio`, verify `claudio --version` works.

- [x] T028 [US4] Create `.mise.toml` at repo root with `[tools]` section:
      `claudio = "latest"` — this signals to developers that `mise install`
      works for this project and documents the `github` backend convention
- [x] T029 [US4] Add mise installation section to `README.md`:
      `mise use -g claudio` (global latest), `mise install claudio@{version}`
      (pin), `mise up claudio` (update); note that no
      `~/.config/mise/config.toml` backend config is needed because asset names
      match the `github` backend auto-detection pattern

**Checkpoint**: In a repo clone with mise installed, run `mise install` — verify
`claudio --version` resolves to the latest GitHub Release binary.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-user documentation, operational runbook additions, and final
end-to-end validation across all distribution channels.

- [x] T030 Add top-level "Installation" section to `README.md` covering all four
      channels: GitHub Release direct download (curl commands for all 5
      platforms with `chmod +x`), npm global install, JSR/Deno install, and mise
      install
- [x] T031 Add macOS Gatekeeper workaround note to `README.md` under the GitHub
      Release download instructions:
      `xattr -d com.apple.quarantine /path/to/claudio` — document that
      downloaded binaries are unsigned and will be quarantined on first run
- [x] T032 Add `NPM_TOKEN` secret setup instruction as a comment in the
      `publish-npm` job in `.github/workflows/release.yml` and as a "Repository
      Secrets" section in `specs/006-release-distribution/quickstart.md`
      describing how to create an npm automation token and add it as `NPM_TOKEN`
      in GitHub repo secrets
- [x] T033 Run end-to-end version invariant validation: execute
      `deno task sync-version`, then assert `deno.json` version ==
      `src/version.ts` VERSION == `npm/claudio/package.json` version == all five
      `npm/@claudio/*/package.json` versions == `./bin/claudio --version` output
      (after local compile); document this validation in
      `specs/006-release-distribution/quickstart.md` under "Releasing a New
      Version"

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup          — no dependencies; start immediately
Phase 2: Foundational   — needs Phase 1 complete; BLOCKS all user stories
Phase 2.5: Contract Tests — needs Phase 2 (deno.json quality task updated); MUST pass before Phase 3
Phase 3: US1            — needs Phase 2.5; MVP deliverable (P1)
Phase 4: US2            — needs Phase 2; can parallelize with US1 after Phase 2
Phase 5: US3            — needs Phase 2 (deno.json fields) + Phase 3 workflow file
Phase 6: US4            — needs Phase 3 GitHub Release assets (binary naming)
Phase 7: Polish         — needs all user stories complete
```

### User Story Dependencies

| Story    | Blocks                                | Depends On                                           |
| -------- | ------------------------------------- | ---------------------------------------------------- |
| US1 (P1) | US4 (binary naming), US2 publish step | Phase 2 (version infra)                              |
| US2 (P2) | nothing                               | Phase 2 (sync-version) + US1 release job exists      |
| US3 (P3) | nothing                               | Phase 2 (deno.json fields) + US1 workflow file       |
| US4 (P3) | nothing                               | US1 GitHub Release assets (binary naming convention) |

### Within Each Phase

- T003, T004, T005 (Phase 1) can run in parallel — different directories
- T006, T007, T008 (Phase 2) are sequential — T006 depends on T002; T007 depends
  on T005; T008 depends on T007
- T009–T016 (US1) are sequential — each adds to the same workflow file
- T017–T019 (US2) are sequential — package.json → shim → README
- T020–T024 (US2) can run in parallel — five independent platform packages
- T025 (US2 CI) depends on T017–T024 and T016 (release job must exist)
- T026, T027 (US3) can run in parallel — workflow job + quickstart doc
- T028, T029 (US4) can run in parallel — different files

---

## Parallel Execution Examples

### Phase 1 — Scaffold in parallel

```
Task T003: Scaffold npm/claudio/ directory
Task T004: Scaffold npm/@claudio/ platform directories
Task T005: Create scripts/sync-version.ts stub
```

### Phase 3 — US1 release workflow (sequential, same file)

```
Step 1: T009 — Create release.yml with quality job
Step 2: T010 — Add build matrix job
Step 3: T011 — Add checkout/deno/cache steps
Step 4: T012 — Add sync-version step
Step 5: T013 — Add deno compile step
Step 6: T014 — Add upload-artifact step
Step 7: T015 — Add release job + manifest generation
Step 8: T016 — Add softprops/action-gh-release step
```

### Phase 4 — npm platform packages in parallel after T017

```
After T017 (main package.json defined):
  Task T020: @claudio/darwin-arm64/package.json
  Task T021: @claudio/darwin-x64/package.json
  Task T022: @claudio/linux-x64/package.json
  Task T023: @claudio/linux-arm64/package.json
  Task T024: @claudio/win32-x64/package.json
```

### Phase 5+6 — After Phase 2 complete (can parallelize with US1/US2)

```
US3 (T026, T027): Add JSR publish job — independent of build matrix
US4 (T028, T029): mise.toml + README — independent of workflow
```

---

## Implementation Strategy

### MVP Scope (User Story 1 only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T008) — version sync wired
3. Complete Phase 3: US1 (T009–T016) — GitHub Release workflow live
4. **STOP AND VALIDATE**: push `v0.1.0` tag → verify 5 binaries on GitHub
   Release
5. Binary users can install immediately via `curl` + `chmod`

### Incremental Delivery

```
MVP:  Phase 1 + 2 + US1  → GitHub Release binaries ✅
Add:  US2 (T017–T025)    → npm install -g claudio ✅
Add:  US3 (T026–T027)    → deno install jsr:@myty/claudio ✅
Add:  US4 (T028–T029)    → mise use -g claudio ✅
Done: Phase 7 (T030–T033) → docs + validation ✅
```

### Parallel Team Strategy

With two developers after Phase 2 is complete:

```
Developer A: US1 (T009–T016) → GitHub Release workflow
Developer B: US2 (T017–T024) → npm package scaffolding
Then: Developer A adds T025 (npm publish CI) once US2 packages exist
      Developer B adds T026–T027 (JSR CI) concurrently
      Both add T028–T029 (mise) independently
```

---

## Task Count Summary

| Phase                       | Tasks         | Stories       | [P] Tasks        |
| --------------------------- | ------------- | ------------- | ---------------- |
| Phase 1: Setup              | 5 (T001–T005) | —             | T003, T004, T005 |
| Phase 2: Foundational       | 3 (T006–T008) | —             | —                |
| Phase 2.5: Contract Tests   | 5 (T034–T038) | —             | T035–T038        |
| Phase 3: US1 GitHub Release | 8 (T009–T016) | US1 (P1)      | —                |
| Phase 4: US2 npm Shim       | 9 (T017–T025) | US2 (P2)      | T020–T024        |
| Phase 5: US3 JSR            | 2 (T026–T027) | US3 (P3)      | T026, T027       |
| Phase 6: US4 mise           | 2 (T028–T029) | US4 (P3)      | T028, T029       |
| Phase 7: Polish             | 4 (T030–T033) | —             | —                |
| **Total**                   | **38**        | **4 stories** | **14**           |

---

## Key Invariants (Non-Negotiable)

From `plan.md` — these must hold after every release:

```
deno.json version
  == src/version.ts VERSION
  == npm/*/package.json version
  == JSR @myty/claudio version
  == GitHub Release tag (without "v" prefix)
  == claudio --version output (without "Claudio v" prefix)
```

Binary naming MUST follow exactly (breaks mise auto-detection and npm shim if
changed):

```
claudio-macos-arm64        ← aarch64-apple-darwin
claudio-macos-x64          ← x86_64-apple-darwin
claudio-linux-x64          ← x86_64-unknown-linux-gnu
claudio-linux-arm64        ← aarch64-unknown-linux-gnu
claudio-windows-x64.exe    ← x86_64-pc-windows-msvc
```

Compile permissions (must be embedded in every binary):

```
--allow-net --allow-env --allow-run --allow-read --allow-write
```
