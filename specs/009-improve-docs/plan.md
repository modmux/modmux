## Plan

### Summary

Improve the AGENTS, README, and constitution documentation to enhance developer
onboarding, contributor clarity, and project governance. This initiative focuses
on creating comprehensive, consistent, and maintainable documentation using
automated validation tools, progressive disclosure for different user experience
levels, and automated maintenance workflows.

### Project Structure

#### Documentation (this feature)

```text
specs/009-improve-docs/
├── plan.md              # This file (/lean-spec plan command output)
├── research.md          # Phase 0 output (/lean-spec plan command)
├── DATA_MODEL.md        # Phase 1 output (/lean-spec plan command)
├── quickstart.md        # Phase 1 output (/lean-spec plan command)
├── CONTRACTS.md           # Phase 1 output (/lean-spec plan command)
└── tasks.md             # Phase 2 output (/lean-spec tasks command - NOT created by /lean-spec plan)
```

#### Source Code (repository root)

```text
## Documentation files to be improved
README.md               # User-facing project documentation
AGENTS.md              # Development team guidelines and architecture
CONVENTIONS.md  # Project governance and principles

## Automation and validation
.github/workflows/     # CI/CD for documentation validation
├── docs-validation.yml
└── consistency-check.yml

## Documentation tooling
scripts/docs/          # Documentation maintenance scripts
├── consistency-check.ts
├── terminology-validator.ts
└── progressive-disclosure-builder.ts

## Documentation assets
docs/                  # Supporting documentation assets
├── images/            # Screenshots, diagrams
├── templates/         # Reusable documentation templates
└── style-guide.md     # Documentation style guidelines
```

**Structure Decision**: Single repository approach with documentation files at
root level, automated validation through GitHub Actions, and supporting tooling
in dedicated directories. This maintains the existing structure while adding
necessary automation and consistency tools.
