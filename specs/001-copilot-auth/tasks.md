---

## description: "Task list for implementing Copilot Authentication feature"

# Tasks: Copilot Authentication

**Input**: Design documents from `/specs/001-copilot-auth/` **Prerequisites**:
plan.md (required), spec.md (required for user stories), research.md,
data-model.md, contracts/

**Tests**: Not explicitly requested - following minimal approach per
constitution

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project structure per plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure per implementation plan in src/
- [x] T002 [P] Create deno.json configuration with permissions and
      @github/copilot-sdk import
- [x] T003 [P] Configure Deno permissions for network and file access
- [x] T004 [P] Add @github/copilot-sdk dependency to deno.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can
be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create error types in src/lib/errors.ts
- [x] T006 Create token storage interfaces in src/lib/token.ts
- [x] T007 [P] Create CLI entry point stub in src/cli/main.ts
- [x] T008 [P] Create auth module exports in src/auth/mod.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in
parallel

---

## Phase 3: User Story 1 - First-Time Authentication (Priority: P1) 🎯 MVP

**Goal**: Users can authenticate with GitHub Copilot using device flow via
Copilot SDK

**Independent Test**: Run Claudio in fresh environment - system prompts for
auth, completes device flow, stores token

### Implementation for User Story 1

- [x] T009 [P] [US1] Create Copilot SDK auth integration in src/auth/copilot.ts
- [x] T010 [US1] Implement device flow initiation and polling in
      src/auth/copilot.ts
- [x] T011 [US1] Implement token storage to platform secure storage in
      src/lib/token.ts
- [x] T012 [US1] Connect auth flow to CLI entry point in src/cli/main.ts
- [x] T013 [US1] Display verification URL and device code per UX spec
- [x] T014 [US1] Handle auth success and store token

**Checkpoint**: At this point, User Story 1 should be fully functional and
testable independently

---

## Phase 4: User Story 2 - Returning User Authentication (Priority: P1)

**Goal**: Returning users authenticate seamlessly without re-authentication

**Independent Test**: Run Claudio twice - second run uses cached credentials
without prompting

### Implementation for User Story 2

- [x] T015 [P] [US2] Implement token validation in src/lib/token.ts
- [x] T016 [US2] Implement token cache loading on startup in src/auth/copilot.ts
- [x] T017 [US2] Skip auth flow when valid token exists in src/cli/main.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work
independently

---

## Phase 5: User Story 3 - Authentication Failure Handling (Priority: P2)

**Goal**: Users receive clear error messages for auth failures

**Independent Test**: Test with invalid credentials, expired tokens, network
failures

### Implementation for User Story 3

- [x] T018 [P] [US3] Implement token expiration detection in src/lib/token.ts
- [x] T019 [US3] Implement re-authentication trigger in src/auth/copilot.ts
- [x] T020 [US3] Implement network error handling in src/auth/copilot.ts
- [x] T021 [US3] Display clear error messages per UX spec in src/cli/main.ts

---

## Phase 6: User Story 4 - Secure Credential Storage (Priority: P2)

**Goal**: Tokens stored securely using platform mechanisms, never logged

**Independent Test**: Verify tokens not in logs, stored in Keychain/Credential
Manager

### Implementation for User Story 4

- [x] T022 [P] [US4] Implement platform secure storage integration in
      src/lib/token.ts
- [x] T023 [US4] Implement fallback to encrypted file storage in
      src/lib/token.ts
- [x] T024 [US4] Add --reauth flag to CLI in src/cli/main.ts
- [x] T025 [US4] Verify no token logging in all auth paths

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T026 [P] Verify CLI startup time <200ms
- [ ] T027 [P] Verify auth flow <5s for returning users
- [ ] T028 Run quickstart.md validation
- [ ] T029 Update project documentation if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user
  stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can proceed in parallel after Phase 2
- **Polish (Final Phase)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No
  dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Depends on US1
  token storage
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independent

### Within Each User Story

- Models/services before CLI integration
- Core implementation before edge cases
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- User Stories 2, 3, 4 can start in parallel after US1 core complete
- All tasks for a user story marked [P] can run in parallel

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break
  independence
