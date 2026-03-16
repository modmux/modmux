## Contracts

### user-experience

**Purpose**: Define the user interface contract for documentation files
**Version**: 1.0.0 **Date**: 2026-03-08

### Overview

This contract defines the standardized user experience and content structure for
README.md, AGENTS.md, and constitution documentation to ensure consistency and
usability.

### 1. README.md User Interface Contract

#### Required Sections (in order)

1. **Project Title & Description**
   ```markdown
   # Project Name

   **Brief tagline** — Detailed explanation of what the project does and why it's
   valuable.
   ```

2. **Features Section**
   ```markdown
   ## Features

   - 🔗 **Feature Name** — Brief description with benefit
   - 🚀 **Feature Name** — Brief description with benefit
   ```

3. **Installation Instructions**
   ```markdown
   ## Installation

   ### Method 1 (Recommended)

   - Clear step-by-step instructions
   - Platform-specific variations in collapsible sections

   <details>
   <summary>Platform-specific instructions</summary>

   Platform-specific content here

   </details>
   ```

4. **Quick Start / Usage**
   ```markdown
   ## Quick Start

   Basic usage example that gets users running immediately
   ```

5. **Advanced Configuration** (Progressive Disclosure)
   ```markdown
   <details>
   <summary>🔧 Advanced Configuration</summary>

   Detailed configuration options for power users

   </details>
   ```

6. **Troubleshooting** (Progressive Disclosure)
   ```markdown
   <details>
   <summary>🆘 Troubleshooting</summary>

   Common issues and solutions

   </details>
   ```

#### Content Standards

- **Reading Time**: Target 5-10 minutes for complete read
- **Onboarding Goal**: New users successful within 10 minutes
- **Tone**: Professional, helpful, encouraging
- **Code Examples**: Always include working, copy-pasteable examples
- **Links**: All external links must be validated and working

#### Progressive Disclosure Rules

- **Beginner Content**: Always visible, no collapsing
- **Installation Details**: Platform-specific instructions collapsible
- **Advanced Features**: Collapsed by default
- **Troubleshooting**: Collapsed by default
- **API Reference**: Link to external docs or collapse

### 2. AGENTS.md Developer Interface Contract

#### Required Sections (in order)

1. **Project Overview**
   ```markdown
   # Project Development Guidelines

   Brief description of project architecture and development approach.

   Auto-generated from all feature plans. Last updated: [DATE]
   ```

2. **Active Technologies**
   ```markdown
   ## Active Technologies

   - Technology stack with versions
   - Key dependencies with purpose
   - Platform requirements
   ```

3. **Project Structure**
   ````markdown
   ## Project Structure

   \```text src/ ├── directory/ # Purpose └── file.ext # Purpose \```
   ````

4. **Development Commands**
   ````markdown
   ## Commands

   \```bash

   # Development

   deno task dev

   # Testing

   deno task test

   # Quality checks

   deno task quality \```
   ````

5. **Code Style Guidelines**
   ```markdown
   ## Code Style

   - Specific style requirements
   - Linting configuration
   - Formatting standards
   ```

6. **Contribution Guidelines**
   ```markdown
   ## Contributing

   - Setup instructions for new contributors
   - PR requirements
   - Testing expectations
   ```

#### Auto-Generation Requirements

- **Technology Stack**: Must be updated when dependencies change
- **Project Structure**: Must reflect actual directory layout
- **Recent Changes**: Auto-updated from feature implementation
- **Manual Additions**: Preserved between `<!-- MANUAL ADDITIONS START/END -->`
  markers

#### Developer Experience Goals

- **Time to First Contribution**: ≤15 minutes from clone to PR
- **Architecture Understanding**: Clear tech stack rationale
- **Consistency**: Same patterns across all development docs

### 3. Constitution Governance Interface Contract

#### Required Sections (in order)

1. **Purpose Statement**
   ```markdown
   # Project Constitution

   Brief statement of project's core purpose and value proposition.
   ```

2. **Core Principles** (Numbered)
   ```markdown
   ## Core Principles

   ### I. Principle Name

   Clear statement of the principle with actionable guidelines.
   ```

3. **Scope Definition**
   ```markdown
   ## Scope

   ### Responsibilities

   - What the project IS responsible for

   ### Non-Responsibilities

   - What the project is NOT responsible for
   ```

4. **Technical Standards**
   ```markdown
   ## Technical Standards & Security

   ### Behavioral Guarantees

   - Must do X
   - Must not do Y

   ### Security Expectations

   - Security requirements
   ```

5. **Success Criteria**
   ```markdown
   ## Success Criteria

   Project is successful when:

   - Measurable outcome 1
   - Measurable outcome 2
   ```

6. **Governance Process**
   ```markdown
   ## Governance

   - Amendment process
   - Compliance requirements
   - Version control
   ```

#### Decision-Making Interface

- **Feature Evaluation**: ≤5 minutes to accept/reject using constitution
- **Principle Conflicts**: Clear resolution process
- **Amendment Process**: Version-controlled with rationale
- **Compliance Checking**: Automated validation where possible

### 4. Cross-Document Consistency Contract

#### Terminology Standards

All documentation must use consistent terminology:

| Term       | Correct Usage             | Incorrect Alternatives |
| ---------- | ------------------------- | ---------------------- |
| GitHub     | GitHub                    | github, Github         |
| TypeScript | TypeScript                | typescript, Typescript |
| Deno       | Deno                      | deno                   |
| API        | API (expand on first use) | api, Api               |
| CLI        | CLI (expand on first use) | cli, Cli               |

#### Tone and Voice Standards

- **Voice**: Professional, helpful, direct
- **Perspective**: Second person ("you can install")
- **Tense**: Present tense for capabilities, imperative for instructions
- **Technical Level**: Accessible to target audience
- **Examples**: Always working and current

#### Link Standards

- **Internal Links**: Relative paths, properly anchored
- **External Links**: HTTPS when available, validated regularly
- **Code Examples**: Link to actual working code when possible
- **Documentation Links**: Version-pinned to avoid drift

### 5. User Journey Interface Contract

#### New User Journey (README.md)

1. **Discover** (30 seconds): Understand project purpose and value
2. **Decide** (2 minutes): Determine if project fits their needs
3. **Install** (5 minutes): Successfully install and configure
4. **First Success** (10 minutes): Complete first successful usage
5. **Explore** (15+ minutes): Discover advanced features

**Success Metrics**:

- 95% understand purpose within 30 seconds
- 90% complete installation within 5 minutes
- 85% achieve first success within 10 minutes

#### Contributor Journey (AGENTS.md)

1. **Orient** (5 minutes): Understand architecture and tech stack
2. **Setup** (10 minutes): Get development environment running
3. **Contribute** (15 minutes): Make first meaningful contribution
4. **Review** (5 minutes): Understand code review standards

**Success Metrics**:

- 95% understand architecture within 5 minutes
- 90% have working dev environment within 10 minutes
- 80% submit valid PR within 15 minutes

#### Maintainer Journey (Constitution)

1. **Reference** (1 minute): Find relevant principle for decision
2. **Evaluate** (3 minutes): Apply principle to specific scenario
3. **Decide** (5 minutes): Make consistent decision with rationale
4. **Document** (2 minutes): Record decision for future reference

**Success Metrics**:

- 95% find relevant principle within 1 minute
- 90% make consistent decisions within 5 minutes
- 85% document rationale clearly

### 6. Accessibility Interface Contract

#### Visual Accessibility

- **Heading Hierarchy**: Logical h1 → h2 → h3 progression
- **Color Usage**: No information conveyed through color alone
- **Contrast**: Text meets WCAG AA standards when rendered
- **Images**: Alt text for all informational images

#### Cognitive Accessibility

- **Progressive Disclosure**: Complex information hidden by default
- **Chunking**: Information broken into digestible sections
- **Scannable**: Clear headings and bullet points for skimming
- **Consistent Navigation**: Same structure across all docs

#### Technical Accessibility

- **Screen Readers**: Semantic HTML in rendered markdown
- **Keyboard Navigation**: All collapsible sections keyboard accessible
- **Mobile Friendly**: Readable on small screens
- **Offline Capable**: Core information available without network

### 7. Maintenance Interface Contract

#### Update Triggers

Documentation must be updated when:

- **Dependencies Change**: Update AGENTS.md technology stack
- **Features Added**: Update README.md features and usage
- **Process Changes**: Update constitution governance
- **User Feedback**: Address confusion or gaps

#### Validation Requirements

Before publication, all documentation must:

- Pass markdown linting
- Meet terminology consistency standards
- Have all links validated
- Meet reading time targets
- Pass accessibility checks

#### Version Control

- **Atomic Changes**: Related changes in single commits
- **Clear Messages**: Commit messages describe user impact
- **Review Process**: Documentation changes reviewed like code
- **Rollback Capability**: Can revert to previous working state

This contract ensures consistent, high-quality user experience across all
project documentation.

### validation-interface

**Purpose**: Define the interface contract for documentation validation tools
and scripts **Version**: 1.0.0 **Date**: 2026-03-08

### Overview

This contract defines the standardized interfaces for documentation validation,
terminology checking, and consistency measurement tools used in the Claudio
project.

### 1. Validation Script Interface

#### Command Line Interface

All validation scripts must implement this CLI contract:

```bash
## Basic validation
deno run --allow-read scripts/docs/validate.ts [files...]

## Configuration
deno run --allow-read scripts/docs/validate.ts --config .docs-config.json [files...]

## Output format
deno run --allow-read scripts/docs/validate.ts --format json [files...]

## Severity filter
deno run --allow-read scripts/docs/validate.ts --severity error [files...]
```

#### Exit Codes

- `0`: All validations passed
- `1`: Validation errors found (blocking)
- `2`: Validation warnings found (non-blocking)
- `3`: Configuration or script errors

#### Output Format

##### JSON Output Format

```json
{
  "version": "1.0.0",
  "timestamp": "2026-03-08T10:00:00Z",
  "summary": {
    "filesProcessed": 3,
    "totalIssues": 2,
    "errorCount": 1,
    "warningCount": 1,
    "consistencyScore": 95.2
  },
  "files": [
    {
      "path": "README.md",
      "status": "error",
      "issues": [
        {
          "rule": "terminology-consistency",
          "severity": "error",
          "line": 42,
          "column": 15,
          "message": "Found 'typescript' should be 'TypeScript'",
          "suggestion": "TypeScript"
        }
      ],
      "metrics": {
        "wordCount": 1250,
        "readingTime": 6,
        "lastModified": "2026-03-08T09:30:00Z"
      }
    }
  ]
}
```

##### Human-Readable Output Format

```text
✅ AGENTS.md - passed
⚠️  README.md - 1 warning
   Line 15: Consider expanding abbreviation 'API' on first use

❌ constitution.md - 1 error
   Line 42: Found 'typescript' should be 'TypeScript'

Summary: 1 error, 1 warning across 3 files (95.2% consistency)
```

### 2. Terminology Validation Interface

#### Terminology Database Schema

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "terms": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "canonical": { "type": "string" },
          "incorrect": {
            "type": "array",
            "items": { "type": "string" }
          },
          "category": {
            "enum": ["technology", "brand", "acronym", "process"]
          },
          "caseSensitive": { "type": "boolean" },
          "contextRules": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "required": ["canonical", "incorrect", "category"]
      }
    }
  },
  "required": ["version", "terms"]
}
```

#### Example Terminology Database

```json
{
  "version": "1.0.0",
  "terms": [
    {
      "canonical": "GitHub",
      "incorrect": ["github", "Github"],
      "category": "brand",
      "caseSensitive": true
    },
    {
      "canonical": "TypeScript",
      "incorrect": ["typescript", "Typescript"],
      "category": "technology",
      "caseSensitive": true
    },
    {
      "canonical": "API",
      "incorrect": ["api", "Api"],
      "category": "acronym",
      "caseSensitive": true,
      "contextRules": [
        "Expand on first use: 'Application Programming Interface (API)'"
      ]
    }
  ]
}
```

### 3. Progressive Disclosure Interface

#### Markdown Template Contract

Progressive disclosure elements must follow this structure:

```markdown
<!-- Standard collapsible section -->
<details>
<summary>📖 Section Title (appropriate emoji)</summary>

Content goes here. Can include:

- Lists
- Code blocks
- Additional sections

</details>

<!-- With default state -->
<details open>
<summary>🚀 Quick Start</summary>

Important content that should be visible by default.

</details>
```

#### Automation Script Interface

Scripts that generate progressive disclosure must implement:

```typescript
// scripts/docs/generate-disclosure.ts interface
interface ProgressiveDisclosureOptions {
  /** Files to process */
  files: string[];
  /** Sections to make collapsible (h2, h3, etc.) */
  collapsibleLevels: number[];
  /** Default state for sections */
  defaultState: "open" | "closed";
  /** Experience level targeting */
  experienceLevel: "beginner" | "intermediate" | "advanced" | "all";
}

interface DisclosureSection {
  title: string;
  content: string;
  level: number;
  defaultOpen: boolean;
  emoji?: string;
}
```

### 4. GitHub Actions Integration Contract

#### Workflow Input Contract

```yaml
## .github/workflows/docs-validation.yml
name: Documentation Validation
on:
  push:
    paths: ["**.md", "docs/**", "scripts/docs/**"]
  pull_request:
    paths: ["**.md", "docs/**", "scripts/docs/**"]

## Required environment variables
env:
  DOCS_CONFIG_PATH: ".docs-config.json"
  TERMINOLOGY_DB_PATH: "scripts/docs/terminology.json"
  MIN_CONSISTENCY_SCORE: "95"

## Required outputs
outputs:
  validation-status:
    description: "Overall validation result (passed/failed)"
    value: ${{ steps.validate.outputs.status }}
  consistency-score:
    description: "Calculated consistency percentage"
    value: ${{ steps.validate.outputs.score }}
  issues-count:
    description: "Total number of validation issues"
    value: ${{ steps.validate.outputs.issues }}
```

#### Step Output Contract

Each validation step must provide structured outputs:

```yaml
## Required outputs for validation steps
- name: Validate Documentation
  id: validate
  run: |
    result=$(deno run --allow-read scripts/docs/validate.ts --format json *.md)
    echo "result=$result" >> $GITHUB_OUTPUT

    score=$(echo "$result" | jq '.summary.consistencyScore')
    echo "score=$score" >> $GITHUB_OUTPUT

    status=$([ "$score" -ge "$MIN_CONSISTENCY_SCORE" ] && echo "passed" || echo "failed")
    echo "status=$status" >> $GITHUB_OUTPUT
```

### 5. Configuration Interface Contract

#### Documentation Configuration Schema

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "validation": {
      "type": "object",
      "properties": {
        "markdownlint": {
          "type": "object",
          "properties": {
            "configFile": { "type": "string" },
            "enabled": { "type": "boolean" }
          }
        },
        "terminology": {
          "type": "object",
          "properties": {
            "databasePath": { "type": "string" },
            "severity": { "enum": ["error", "warning", "info"] },
            "enabled": { "type": "boolean" }
          }
        },
        "consistency": {
          "type": "object",
          "properties": {
            "minimumScore": { "type": "number", "minimum": 0, "maximum": 100 },
            "weightings": {
              "type": "object",
              "properties": {
                "markdownLint": { "type": "number" },
                "terminology": { "type": "number" },
                "linkValidation": { "type": "number" }
              }
            }
          }
        }
      }
    },
    "progressiveDisclosure": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "collapsibleLevels": {
          "type": "array",
          "items": { "type": "number", "minimum": 1, "maximum": 6 }
        },
        "defaultState": { "enum": ["open", "closed"] }
      }
    }
  }
}
```

### 6. Metrics Interface Contract

#### Metrics Collection Interface

```typescript
// Metrics collection interface
interface DocumentationMetrics {
  timestamp: string;
  files: {
    [fileName: string]: {
      wordCount: number;
      readingTimeMinutes: number;
      lastModified: string;
      consistencyScore: number;
      validationIssues: number;
    };
  };
  overall: {
    totalFiles: number;
    averageConsistencyScore: number;
    totalIssues: number;
    averageReadingTime: number;
  };
}
```

#### Metrics Output Format

```json
{
  "timestamp": "2026-03-08T10:00:00Z",
  "files": {
    "README.md": {
      "wordCount": 1250,
      "readingTimeMinutes": 6,
      "lastModified": "2026-03-08T09:30:00Z",
      "consistencyScore": 98.5,
      "validationIssues": 1
    },
    "AGENTS.md": {
      "wordCount": 800,
      "readingTimeMinutes": 4,
      "lastModified": "2026-03-07T15:20:00Z",
      "consistencyScore": 95.2,
      "validationIssues": 0
    },
    "constitution.md": {
      "wordCount": 2100,
      "readingTimeMinutes": 11,
      "lastModified": "2026-03-07T14:10:00Z",
      "consistencyScore": 99.1,
      "validationIssues": 0
    }
  },
  "overall": {
    "totalFiles": 3,
    "averageConsistencyScore": 97.6,
    "totalIssues": 1,
    "averageReadingTime": 7
  }
}
```

### Contract Compliance

#### Breaking Changes

- Changes to command-line interfaces require major version bump
- Output format changes require minor version bump
- New optional parameters require minor version bump

#### Testing Contract

All implementing scripts must include contract compliance tests:

```typescript
// Example contract compliance test
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("validation script returns proper exit codes", async () => {
  // Test successful validation
  const success = await new Deno.Command("deno", {
    args: ["run", "--allow-read", "scripts/docs/validate.ts", "test-valid.md"],
  }).output();
  assertEquals(success.code, 0);

  // Test failed validation
  const failure = await new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "scripts/docs/validate.ts",
      "test-invalid.md",
    ],
  }).output();
  assertEquals(failure.code, 1);
});
```

This contract ensures consistent behavior across all documentation tools and
enables reliable automation workflows.
