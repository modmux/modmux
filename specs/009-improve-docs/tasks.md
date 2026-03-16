## Tasks

> Status: Implemented in main. This task list is kept as a historical record.

**Input**: Design documents from `/specs/009-improve-docs/` **Prerequisites**:
plan.md (required), README.md (required for user stories), research.md,
DATA_MODEL.md, CONTRACTS.md

**Tests**: Not explicitly requested in specification - focusing on
implementation and validation tasks

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

### Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

### Path Conventions

Documentation project structure based on plan.md:

- Documentation files: `README.md`, `AGENTS.md`, `CONVENTIONS.md`
- Automation scripts: `scripts/docs/`
- GitHub Actions: `.github/workflows/`
- Configuration files: Repository root

### Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and validation infrastructure

- [x] T001 Create documentation validation infrastructure directory structure
      per plan.md
- [x] T002 [P] Create documentation configuration file `.docs-config.json`
- [x] T003 [P] Create markdownlint configuration file `.markdownlint.jsonc`
- [x] T004 [P] Create terminology database file `scripts/docs/terminology.json`
- [x] T005 [P] Create scripts directory structure `scripts/docs/`

---

### Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core validation infrastructure that MUST be complete before ANY
user story documentation can be improved

**⚠️ CRITICAL**: No user story documentation work can begin until this phase is
complete

- [x] T006 Implement main validation script `scripts/docs/validate.ts`
- [x] T007 [P] Implement terminology validation function in
      `scripts/docs/validate.ts`
- [x] T008 [P] Implement markdown validation function in
      `scripts/docs/validate.ts`
- [x] T009 [P] Implement progressive disclosure generator
      `scripts/docs/generate-disclosure.ts`
- [x] T010 [P] Create GitHub Actions workflow
      `/.github/workflows/docs-validation.yml`
- [x] T011 [P] Implement documentation metrics collection in validation script
- [x] T012 Test validation infrastructure with existing documentation files

**Checkpoint**: Foundation ready - user story documentation improvement can now
begin in parallel

---

### Phase 3: User Story 1 - Developer Onboarding Experience (Priority: P1) 🎯 MVP

**Goal**: New developers can quickly understand Claudio's purpose, install it
correctly, and get it running with their GitHub Copilot subscription within 10
minutes

**Independent Test**: Have a new developer follow the README from discovery to
successful first run and verify they understand Claudio's purpose and value
proposition

#### Implementation for User Story 1

- [x] T013 [P] [US1] Run validation baseline on current `README.md`
- [x] T014 [P] [US1] Analyze current README structure against user experience
      contract
- [x] T015 [US1] Improve README project title and description section per FR-001
      in `README.md`
- [x] T016 [US1] Add features section with benefits-focused descriptions in
      `README.md`
- [x] T017 [US1] Enhance installation instructions for all platforms per FR-002
      in `README.md`
- [x] T018 [US1] Add comprehensive troubleshooting section per FR-003 in
      `README.md`
- [x] T019 [US1] Add usage examples and command-line options per FR-004 in
      `README.md`
- [x] T020 [US1] Apply progressive disclosure formatting to advanced sections in
      `README.md`
- [x] T021 [US1] Validate README meets 95% consistency score requirement
- [x] T022 [US1] Test README with new developer onboarding scenario

**Checkpoint**: At this point, README should enable 10-minute onboarding and be
fully functional independently

---

### Phase 4: User Story 2 - Development Team Clarity (Priority: P2)

**Goal**: Development team members can quickly understand project architecture,
coding standards, and contribution guidelines to effectively work on the
codebase

**Independent Test**: Have a new contributor successfully set up development
environment and make their first contribution following the guidelines

#### Implementation for User Story 2

- [x] T023 [P] [US2] Run validation baseline on current `AGENTS.md`
- [x] T024 [P] [US2] Analyze current AGENTS.md structure against developer
      requirements
- [x] T025 [US2] Update project structure documentation per FR-005 in
      `AGENTS.md`
- [x] T026 [US2] Update active technologies section per FR-006 in `AGENTS.md`
- [x] T027 [US2] Add clear code style guidelines per FR-007 in `AGENTS.md`
- [x] T028 [US2] Add contribution workflow documentation in `AGENTS.md`
- [x] T029 [US2] Add development command reference in `AGENTS.md`
- [x] T030 [US2] Ensure terminology consistency with README and constitution
- [x] T031 [US2] Apply progressive disclosure for advanced development topics in
      `AGENTS.md`
- [x] T032 [US2] Validate AGENTS.md meets consistency requirements
- [x] T033 [US2] Test AGENTS.md with new contributor scenario

**Checkpoint**: At this point, AGENTS.md should enable 15-minute contributor
setup and work independently

---

### Phase 5: User Story 3 - Project Governance Clarity (Priority: P3)

**Goal**: Project maintainers and contributors understand the project's core
principles, scope boundaries, and quality standards through a clear, actionable
constitution

**Independent Test**: Present maintainers with feature requests and verify they
can make consistent decisions using constitutional principles within 5 minutes

#### Implementation for User Story 3

- [x] T034 [P] [US3] Run validation baseline on current `CONVENTIONS.md`
- [x] T035 [P] [US3] Analyze constitution structure against governance
      requirements
- [x] T036 [US3] Enhance scope boundaries definition per FR-008 in
      `CONVENTIONS.md`
- [x] T037 [US3] Strengthen quality gates and testing requirements per FR-009 in
      `CONVENTIONS.md`
- [x] T038 [US3] Improve architectural decision guidance per FR-010 in
      `CONVENTIONS.md`
- [x] T039 [US3] Add decision-making process documentation in `CONVENTIONS.md`
- [x] T040 [US3] Ensure constitutional principles are numbered and actionable
- [x] T041 [US3] Apply consistent terminology with other documentation files
- [x] T042 [US3] Validate constitution meets consistency requirements
- [x] T043 [US3] Test constitution with feature evaluation scenarios

**Checkpoint**: All user stories should now be independently functional with
clear governance guidance

---

### Phase 6: Cross-Document Consistency & Automation

**Purpose**: Ensure consistency across all documentation files and enable
automated maintenance

- [x] T044 [P] Run comprehensive validation across all documentation files
- [x] T045 [P] Fix terminology inconsistencies identified by validation
- [x] T046 [P] Ensure consistent tone and formatting per FR-011 across all files
- [x] T047 [P] Configure automated triggers in `.github/workflows/` per FR-015
- [x] T047b [P] Test automated trigger functionality with manual review gates
- [x] T048 [P] Create documentation style guide in `docs/style-guide.md`
- [x] T049 [P] Set up automated maintenance workflows in `.github/workflows/`
- [x] T050 [P] Create documentation templates in `docs/templates/`

---

### Phase 7: Polish & Validation

**Purpose**: Final validation and quality assurance across the complete
documentation set

- [x] T051 [P] Validate all success criteria are met (SC-001 through SC-007)
- [ ] T052 [P] Run complete validation suite and ensure 95% consistency score
- [ ] T053 [P] Test documentation with actual user scenarios
- [ ] T053a [P] Test documentation with platform-specific installation errors
- [ ] T053b [P] Validate progressive disclosure works for different experience
      levels
- [ ] T053c [P] Test constitutional principle conflict resolution scenarios
- [ ] T053d [P] Verify documentation maintenance under rapid code changes
- [ ] T054 [P] Validate GitHub Actions workflows work correctly
- [ ] T055 [P] Create documentation metrics baseline for future tracking
- [ ] T056 Run quickstart.md validation with complete implementation
- [ ] T057 Document maintenance procedures and update schedules

---

### Dependencies & Execution Order

#### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user
  stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Cross-Document Consistency (Phase 6)**: Depends on all user stories being
  complete
- **Polish (Phase 7)**: Depends on Cross-Document Consistency completion

#### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No
  dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent
  but may reference US1 for consistency
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent
  but should align with US1/US2 principles

#### Within Each User Story

- Validation baseline before improvements
- Structure analysis before content changes
- Content improvements before formatting
- Progressive disclosure application after content is finalized
- Validation testing after all changes complete
- User scenario testing as final verification

#### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if
  team capacity allows)
- Validation baseline and analysis tasks within each story marked [P] can run in
  parallel
- Different user stories can be worked on in parallel by different team members
- Cross-document consistency tasks marked [P] can run in parallel
- Polish phase tasks marked [P] can run in parallel

---

### Parallel Example: User Story 1

```bash
## Launch baseline analysis for User Story 1 together:
Task: "Run validation baseline on current README.md"
Task: "Analyze current README structure against user experience contract"

## No parallel opportunities in content changes due to single file conflicts
## But validation and testing can run in parallel after content complete
```

---

### Implementation Strategy

#### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (README improvements)
4. **STOP and VALIDATE**: Test README with new developer onboarding
5. Deploy/demo if ready

#### Incremental Delivery

1. Complete Setup + Foundational → Validation infrastructure ready
2. Add User Story 1 (README) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (AGENTS.md) → Test independently → Deploy/Demo
4. Add User Story 3 (Constitution) → Test independently → Deploy/Demo
5. Add Cross-Document Consistency → Unified experience
6. Add Polish → Production ready

#### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (README.md improvements)
   - Developer B: User Story 2 (AGENTS.md improvements)
   - Developer C: User Story 3 (Constitution improvements)
3. Stories complete and integrate independently via consistency validation

---

### Success Criteria Validation

#### Checkpoint Validations

- **After Phase 2**: Validation infrastructure works correctly
- **After Phase 3**: README enables 10-minute onboarding (SC-001)
- **After Phase 4**: AGENTS.md enables 15-minute contributor setup (SC-003)
- **After Phase 5**: Constitution enables 5-minute decisions (SC-004)
- **After Phase 6**: 95% consistency score achieved (SC-005)
- **After Phase 7**: All success criteria validated

#### Measurement Requirements

- **SC-001**: Time new users from README discovery to first successful run
- **SC-002**: Track percentage of questions answered within documentation
- **SC-003**: Time contributors from AGENTS.md read to environment setup
- **SC-004**: Time maintainers from question to constitutional decision
- **SC-005**: Automated consistency score measurement
- **SC-006**: Support ticket tracking (30-day rolling averages)
- **SC-007**: First contribution timing measurement

---

### Notes

- [P] tasks = different files or independent analysis, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Validation scripts enable objective measurement of success criteria
- Commit after each logical group of changes
- Stop at any checkpoint to validate story independently
- Progressive disclosure maintains accessibility while providing depth
- Automated maintenance ensures documentation stays current
