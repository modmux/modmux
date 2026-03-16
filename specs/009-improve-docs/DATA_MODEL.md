## Data Model

**Feature**: Documentation Improvement Initiative **Date**: 2026-03-08
**Purpose**: Define the structure and relationships of documentation entities

### Core Entities

#### Documentation File

**Purpose**: Represents each documentation file in the project **Attributes**:

- `fileName`: String (README.md, AGENTS.md, constitution.md)
- `fileType`: Enum (user-facing, developer, governance)
- `targetAudience`: Enum (end-users, contributors, maintainers)
- `lastModified`: DateTime
- `wordCount`: Number
- `readingTimeMinutes`: Number
- `consistencyScore`: Number (0-100)

**Validation Rules**:

- fileName must match existing documentation files
- consistencyScore must be >= 95 for successful validation
- readingTimeMinutes calculated as wordCount / 200 WPM
- lastModified automatically updated on content changes

**State Transitions**:

- Draft → Under Review → Validated → Published
- Published → Outdated (when code changes)
- Outdated → Under Review (when update triggered)

#### Documentation Section

**Purpose**: Represents logical sections within documentation files
**Attributes**:

- `sectionId`: String (unique identifier)
- `title`: String
- `content`: String (markdown content)
- `level`: Number (1-6, corresponding to h1-h6)
- `isCollapsible`: Boolean
- `targetExperienceLevel`: Enum (beginner, intermediate, advanced, all)
- `parentFile`: Reference to Documentation File
- `orderIndex`: Number

**Validation Rules**:

- title must be non-empty and follow title case conventions
- level must correspond to logical hierarchy
- content must pass markdown validation
- orderIndex must be unique within parent file

**Relationships**:

- Belongs to one Documentation File
- May contain multiple subsections (self-referential)

#### Terminology Entry

**Purpose**: Defines canonical terms and their usage rules **Attributes**:

- `canonicalForm`: String (correct spelling/capitalization)
- `alternativeForms`: Array<String> (incorrect variations to detect)
- `definition`: String (brief explanation)
- `category`: Enum (technology, process, brand, acronym)
- `enforceCapitalization`: Boolean
- `contextualRules`: Array<String> (special cases)

**Validation Rules**:

- canonicalForm must be the preferred spelling
- alternativeForms must not be empty
- category must align with terminology validation scripts
- enforceCapitalization determines case-sensitivity

**Examples**:

```json
[
  {
    "canonicalForm": "GitHub",
    "alternativeForms": ["github", "Github"],
    "definition": "Git repository hosting platform",
    "category": "brand",
    "enforceCapitalization": true
  },
  {
    "canonicalForm": "API",
    "alternativeForms": ["api", "Api"],
    "definition": "Application Programming Interface",
    "category": "acronym",
    "enforceCapitalization": true
  }
]
```

#### Validation Rule

**Purpose**: Defines automated validation criteria for documentation quality
**Attributes**:

- `ruleId`: String (unique identifier)
- `ruleName`: String (human-readable name)
- `ruleType`: Enum (markdown-lint, terminology, link-check, consistency)
- `severity`: Enum (error, warning, info)
- `configuration`: Object (tool-specific settings)
- `isActive`: Boolean
- `applicableFiles`: Array<String> (file patterns)

**Validation Rules**:

- ruleId must be unique across all validation rules
- severity determines build failure behavior
- configuration must be valid for specified ruleType
- applicableFiles supports glob patterns

#### Progressive Disclosure Element

**Purpose**: Represents collapsible/expandable content sections **Attributes**:

- `elementId`: String (unique identifier)
- `summary`: String (visible title/description)
- `content`: String (collapsible content)
- `defaultState`: Enum (collapsed, expanded)
- `targetAudience`: Enum (beginner, advanced, all)
- `parentSection`: Reference to Documentation Section
- `triggerCriteria`: Array<String> (when to show/hide)

**Validation Rules**:

- summary must be concise and descriptive
- content must be substantial enough to warrant hiding
- defaultState should be 'collapsed' for advanced content
- triggerCriteria allows conditional display

### Entity Relationships

#### Documentation File ↔ Documentation Section

- **One-to-Many**: Each file contains multiple sections
- **Cascade**: Deleting a file removes all its sections
- **Ordering**: Sections maintain hierarchical order via level and orderIndex

#### Documentation Section ↔ Progressive Disclosure Element

- **One-to-Many**: Each section may contain multiple collapsible elements
- **Dependency**: Elements cannot exist without parent sections
- **Targeting**: Elements can target specific experience levels

#### Terminology Entry ↔ Documentation File

- **Many-to-Many**: Terms appear across multiple files, files contain multiple
  terms
- **Validation**: Terminology validation runs against all files
- **Consistency**: Same terms must use canonical form across all files

#### Validation Rule ↔ Documentation File

- **Many-to-Many**: Rules apply to multiple files, files are subject to multiple
  rules
- **Filtering**: applicableFiles determines which rules apply to which files
- **Execution**: All applicable rules must pass for file validation

### Data Storage & Persistence

#### File-Based Storage

- **Documentation Files**: Stored as markdown files in repository root
- **Terminology Database**: JSON file at `scripts/docs/terminology.json`
- **Validation Configuration**: YAML/JSON files in `.github/workflows/`
- **Metrics History**: JSON files in `docs/metrics/` (optional, for trend
  analysis)

#### Derived Data

- **Consistency Scores**: Calculated during validation, not stored
- **Reading Time**: Computed from word count, updated automatically
- **Cross-References**: Generated during build, not persisted
- **TOC Generation**: Auto-generated from section hierarchy

### Integration Points

#### Version Control Integration

- All entity changes tracked through Git commits
- Documentation File lastModified derived from Git history
- Validation triggered on file changes via Git hooks/CI

#### Automation Integration

- Validation Rules executed by GitHub Actions
- Terminology Entries used by custom Deno validation scripts
- Progressive Disclosure Elements generated/validated by automation

#### Metrics Integration

- Documentation metrics collected during validation
- Consistency scores aggregated across all files
- Performance metrics (reading time, user completion rates) tracked
