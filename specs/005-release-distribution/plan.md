## Plan

### Summary

[Extract from feature spec: primary requirement + technical approach from
research]

### Project Structure

#### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/lean-spec plan command output)
├── research.md          # Phase 0 output (/lean-spec plan command)
├── DATA_MODEL.md        # Phase 1 output (/lean-spec plan command)
├── quickstart.md        # Phase 1 output (/lean-spec plan command)
├── CONTRACTS.md           # Phase 1 output (/lean-spec plan command)
└── tasks.md             # Phase 2 output (/lean-spec tasks command - NOT created by /lean-spec plan)
```

#### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
## [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

## [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

## [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

### Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
