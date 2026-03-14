# Documentation Validation Interface Contract

**Purpose**: Define the interface contract for documentation validation tools and scripts
**Version**: 1.0.0
**Date**: 2026-03-08

## Overview

This contract defines the standardized interfaces for documentation validation, terminology checking, and consistency measurement tools used in the Claudio project.

## 1. Validation Script Interface

### Command Line Interface

All validation scripts must implement this CLI contract:

```bash
# Basic validation
deno run --allow-read scripts/docs/validate.ts [files...]

# Configuration
deno run --allow-read scripts/docs/validate.ts --config .docs-config.json [files...]

# Output format
deno run --allow-read scripts/docs/validate.ts --format json [files...]

# Severity filter
deno run --allow-read scripts/docs/validate.ts --severity error [files...]
```

### Exit Codes
- `0`: All validations passed
- `1`: Validation errors found (blocking)
- `2`: Validation warnings found (non-blocking)
- `3`: Configuration or script errors

### Output Format

#### JSON Output Format
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

#### Human-Readable Output Format
```text
✅ AGENTS.md - passed
⚠️  README.md - 1 warning
   Line 15: Consider expanding abbreviation 'API' on first use

❌ constitution.md - 1 error
   Line 42: Found 'typescript' should be 'TypeScript'

Summary: 1 error, 1 warning across 3 files (95.2% consistency)
```

## 2. Terminology Validation Interface

### Terminology Database Schema

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

### Example Terminology Database
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

## 3. Progressive Disclosure Interface

### Markdown Template Contract

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

### Automation Script Interface

Scripts that generate progressive disclosure must implement:

```typescript
// scripts/docs/generate-disclosure.ts interface
interface ProgressiveDisclosureOptions {
  /** Files to process */
  files: string[];
  /** Sections to make collapsible (h2, h3, etc.) */
  collapsibleLevels: number[];
  /** Default state for sections */
  defaultState: 'open' | 'closed';
  /** Experience level targeting */
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'all';
}

interface DisclosureSection {
  title: string;
  content: string;
  level: number;
  defaultOpen: boolean;
  emoji?: string;
}
```

## 4. GitHub Actions Integration Contract

### Workflow Input Contract

```yaml
# .github/workflows/docs-validation.yml
name: Documentation Validation
on:
  push:
    paths: ['**.md', 'docs/**', 'scripts/docs/**']
  pull_request:
    paths: ['**.md', 'docs/**', 'scripts/docs/**']

# Required environment variables
env:
  DOCS_CONFIG_PATH: '.docs-config.json'
  TERMINOLOGY_DB_PATH: 'scripts/docs/terminology.json'
  MIN_CONSISTENCY_SCORE: '95'

# Required outputs
outputs:
  validation-status:
    description: 'Overall validation result (passed/failed)'
    value: ${{ steps.validate.outputs.status }}
  consistency-score:
    description: 'Calculated consistency percentage'
    value: ${{ steps.validate.outputs.score }}
  issues-count:
    description: 'Total number of validation issues'
    value: ${{ steps.validate.outputs.issues }}
```

### Step Output Contract

Each validation step must provide structured outputs:

```yaml
# Required outputs for validation steps
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

## 5. Configuration Interface Contract

### Documentation Configuration Schema

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

## 6. Metrics Interface Contract

### Metrics Collection Interface

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

### Metrics Output Format

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

## Contract Compliance

### Breaking Changes
- Changes to command-line interfaces require major version bump
- Output format changes require minor version bump
- New optional parameters require minor version bump

### Testing Contract
All implementing scripts must include contract compliance tests:

```typescript
// Example contract compliance test
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("validation script returns proper exit codes", async () => {
  // Test successful validation
  const success = await new Deno.Command("deno", {
    args: ["run", "--allow-read", "scripts/docs/validate.ts", "test-valid.md"]
  }).output();
  assertEquals(success.code, 0);

  // Test failed validation
  const failure = await new Deno.Command("deno", {
    args: ["run", "--allow-read", "scripts/docs/validate.ts", "test-invalid.md"]
  }).output();
  assertEquals(failure.code, 1);
});
```

This contract ensures consistent behavior across all documentation tools and enables reliable automation workflows.