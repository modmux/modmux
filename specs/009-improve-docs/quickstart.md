## Quickstart

**Purpose**: Quick implementation guide for documentation improvements **Target
Audience**: Developers implementing the documentation changes **Estimated
Time**: 2-4 hours for complete implementation

### Overview

This quickstart guide provides step-by-step instructions for implementing the
documentation improvements defined in the specification. Follow these steps to
enhance README.md, AGENTS.md, and constitution documentation with automated
validation and maintenance.

### Phase 1: Setup Validation Infrastructure (30 minutes)

#### Step 1: Create Documentation Configuration

```bash
## Create documentation configuration file
cat > .docs-config.json << 'EOF'
{
  "validation": {
    "markdownlint": {
      "configFile": ".markdownlint.jsonc",
      "enabled": true
    },
    "terminology": {
      "databasePath": "scripts/docs/terminology.json",
      "severity": "error",
      "enabled": true
    },
    "consistency": {
      "minimumScore": 95,
      "weightings": {
        "markdownLint": 40,
        "terminology": 40,
        "linkValidation": 20
      }
    }
  },
  "progressiveDisclosure": {
    "enabled": true,
    "collapsibleLevels": [3, 4, 5, 6],
    "defaultState": "closed"
  }
}
EOF
```

#### Step 2: Setup Markdown Linting

```bash
## Create markdownlint configuration
cat > .markdownlint.jsonc << 'EOF'
{
  "extends": "markdownlint/style/prettier",
  "MD013": false,
  "MD033": {
    "allowed_elements": ["details", "summary", "br", "kbd"]
  },
  "MD041": false,
  "no-hard-tabs": false,
  "whitespace": false
}
EOF
```

#### Step 3: Create Validation Scripts Directory

```bash
## Create scripts directory structure
mkdir -p scripts/docs
cd scripts/docs
```

#### Step 4: Create Terminology Database

```bash
## Create terminology validation database
cat > terminology.json << 'EOF'
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
      "canonical": "Deno",
      "incorrect": ["deno"],
      "category": "technology",
      "caseSensitive": true
    },
    {
      "canonical": "Claude Code",
      "incorrect": ["claude code", "Claude code"],
      "category": "brand",
      "caseSensitive": true
    },
    {
      "canonical": "API",
      "incorrect": ["api", "Api"],
      "category": "acronym",
      "caseSensitive": true
    },
    {
      "canonical": "CLI",
      "incorrect": ["cli", "Cli"],
      "category": "acronym",
      "caseSensitive": true
    }
  ]
}
EOF
```

### Phase 2: Create Validation Scripts (45 minutes)

#### Step 1: Main Validation Script

```typescript
// scripts/docs/validate.ts
import { parse } from "https://deno.land/std@0.208.0/flags/mod.ts";

interface ValidationResult {
  version: string;
  timestamp: string;
  summary: {
    filesProcessed: number;
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    consistencyScore: number;
  };
  files: FileResult[];
}

interface FileResult {
  path: string;
  status: "passed" | "warning" | "error";
  issues: Issue[];
  metrics: {
    wordCount: number;
    readingTime: number;
    lastModified: string;
  };
}

interface Issue {
  rule: string;
  severity: "error" | "warning" | "info";
  line?: number;
  column?: number;
  message: string;
  suggestion?: string;
}

async function validateFile(filePath: string): Promise<FileResult> {
  const content = await Deno.readTextFile(filePath);
  const issues: Issue[] = [];

  // Basic metrics
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);
  const stat = await Deno.stat(filePath);

  // Terminology validation
  const terminologyIssues = await validateTerminology(content, filePath);
  issues.push(...terminologyIssues);

  // Basic markdown validation
  const markdownIssues = await validateMarkdown(content, filePath);
  issues.push(...markdownIssues);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    path: filePath,
    status: errorCount > 0
      ? "error"
      : (warningCount > 0 ? "warning" : "passed"),
    issues,
    metrics: {
      wordCount,
      readingTime,
      lastModified: stat.mtime?.toISOString() || new Date().toISOString(),
    },
  };
}

async function validateTerminology(
  content: string,
  filePath: string,
): Promise<Issue[]> {
  try {
    const terminologyDB = JSON.parse(
      await Deno.readTextFile("scripts/docs/terminology.json"),
    );

    const issues: Issue[] = [];

    for (const term of terminologyDB.terms) {
      for (const incorrect of term.incorrect) {
        const regex = new RegExp(`\\b${incorrect}\\b`, "g");
        let match;
        let lineNumber = 1;
        let currentPos = 0;

        while ((match = regex.exec(content)) !== null) {
          // Calculate line number
          const beforeMatch = content.substring(currentPos, match.index);
          lineNumber += (beforeMatch.match(/\n/g) || []).length;

          issues.push({
            rule: "terminology-consistency",
            severity: "error",
            line: lineNumber,
            column: match.index - content.lastIndexOf("\n", match.index),
            message: `Found '${incorrect}' should be '${term.canonical}'`,
            suggestion: term.canonical,
          });
        }
      }
    }

    return issues;
  } catch (error) {
    console.warn(`Could not validate terminology: ${error.message}`);
    return [];
  }
}

async function validateMarkdown(
  content: string,
  filePath: string,
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for broken links (basic implementation)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const [, , url] = match;

    // Skip external URLs for now, focus on internal links
    if (url.startsWith("http") || url.startsWith("mailto:")) {
      continue;
    }

    // Check if internal file exists
    try {
      if (
        url.startsWith("./") || url.startsWith("../") || !url.startsWith("/")
      ) {
        const resolvedPath =
          new URL(url, `file://${Deno.cwd()}/${filePath}`).pathname;
        await Deno.stat(resolvedPath);
      }
    } catch {
      issues.push({
        rule: "link-validation",
        severity: "warning",
        message: `Broken internal link: ${url}`,
      });
    }
  }

  return issues;
}

async function main() {
  const flags = parse(Deno.args, {
    boolean: ["help", "json"],
    string: ["format", "config", "severity"],
    default: {
      format: "human",
      severity: "all",
    },
  });

  if (flags.help) {
    console.log(`
Documentation Validation Tool

Usage: deno run --allow-read validate.ts [options] [files...]

Options:
  --format json|human    Output format (default: human)
  --config FILE         Configuration file path
  --severity error|warning|all  Filter by severity
  --help                Show this help
    `);
    Deno.exit(0);
  }

  const files = flags._ as string[];
  if (files.length === 0) {
    console.error("No files specified");
    Deno.exit(1);
  }

  const results: FileResult[] = [];

  for (const file of files) {
    try {
      const result = await validateFile(file);
      results.push(result);
    } catch (error) {
      console.error(`Error processing ${file}: ${error.message}`);
    }
  }

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const errorCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.severity === "error").length,
    0,
  );
  const warningCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.severity === "warning").length,
    0,
  );

  // Calculate consistency score
  const maxPossibleIssues = results.length * 10; // Assume 10 possible issues per file
  const consistencyScore = Math.max(
    0,
    100 - (totalIssues / maxPossibleIssues) * 100,
  );

  const validationResult: ValidationResult = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    summary: {
      filesProcessed: results.length,
      totalIssues,
      errorCount,
      warningCount,
      consistencyScore: Math.round(consistencyScore * 10) / 10,
    },
    files: results,
  };

  if (flags.format === "json") {
    console.log(JSON.stringify(validationResult, null, 2));
  } else {
    // Human-readable output
    for (const file of results) {
      const status = file.status === "passed"
        ? "✅"
        : file.status === "warning"
        ? "⚠️"
        : "❌";
      console.log(`${status} ${file.path} - ${file.status}`);

      for (const issue of file.issues) {
        if (flags.severity !== "all" && issue.severity !== flags.severity) {
          continue;
        }

        const location = issue.line ? ` Line ${issue.line}:` : "";
        console.log(`  ${location} ${issue.message}`);
      }
    }

    console.log(
      `\nSummary: ${errorCount} errors, ${warningCount} warnings across ${results.length} files (${validationResult.summary.consistencyScore}% consistency)`,
    );
  }

  // Exit with error if there are blocking issues
  Deno.exit(errorCount > 0 ? 1 : (warningCount > 0 ? 2 : 0));
}

if (import.meta.main) {
  await main();
}
```

#### Step 2: Progressive Disclosure Generator

```typescript
// scripts/docs/generate-disclosure.ts
interface DisclosureSection {
  title: string;
  content: string;
  level: number;
  defaultOpen: boolean;
  emoji: string;
}

const SECTION_EMOJIS: Record<string, string> = {
  "quick": "🚀",
  "start": "🚀",
  "install": "📦",
  "config": "🔧",
  "advanced": "🔧",
  "troubleshoot": "🆘",
  "help": "❓",
  "example": "📖",
  "api": "📚",
  "reference": "📚",
};

function getEmojiForSection(title: string): string {
  const lowerTitle = title.toLowerCase();
  for (const [key, emoji] of Object.entries(SECTION_EMOJIS)) {
    if (lowerTitle.includes(key)) {
      return emoji;
    }
  }
  return "📖";
}

function generateProgressiveDisclosure(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let currentSection: string[] = [];
  let currentLevel = 0;
  let currentTitle = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#+)\s+(.+)$/);

    if (headerMatch) {
      const [, hashes, title] = headerMatch;
      const level = hashes.length;

      // Process previous section if it exists
      if (currentSection.length > 0 && currentLevel >= 3) {
        const emoji = getEmojiForSection(currentTitle);
        result.push(`<details>`);
        result.push(`<summary>${emoji} ${currentTitle}</summary>`);
        result.push("");
        result.push(...currentSection);
        result.push("</details>");
        result.push("");
      } else if (currentSection.length > 0) {
        result.push(...currentSection);
      }

      // Start new section
      currentSection = [line];
      currentLevel = level;
      currentTitle = title;
    } else {
      currentSection.push(line);
    }
  }

  // Process final section
  if (currentSection.length > 0 && currentLevel >= 3) {
    const emoji = getEmojiForSection(currentTitle);
    result.push(`<details>`);
    result.push(`<summary>${emoji} ${currentTitle}</summary>`);
    result.push("");
    result.push(...currentSection.slice(1)); // Skip the header
    result.push("</details>");
  } else if (currentSection.length > 0) {
    result.push(...currentSection);
  }

  return result.join("\n");
}

async function processFile(filePath: string) {
  console.log(`Processing ${filePath}...`);

  const content = await Deno.readTextFile(filePath);
  const processed = generateProgressiveDisclosure(content);

  await Deno.writeTextFile(filePath, processed);
  console.log(`✅ Updated ${filePath} with progressive disclosure`);
}

async function main() {
  const files = Deno.args;

  if (files.length === 0) {
    console.log(
      "Usage: deno run --allow-read --allow-write generate-disclosure.ts [files...]",
    );
    Deno.exit(1);
  }

  for (const file of files) {
    try {
      await processFile(file);
    } catch (error) {
      console.error(`Error processing ${file}: ${error.message}`);
    }
  }
}

if (import.meta.main) {
  await main();
}
```

### Phase 3: Setup GitHub Actions (30 minutes)

#### Step 1: Create Documentation Validation Workflow

```bash
## Create GitHub Actions workflow directory
mkdir -p .github/workflows

## Create documentation validation workflow
cat > .github/workflows/docs-validation.yml << 'EOF'
name: Documentation Validation
on:
  push:
    paths: ['**.md', 'docs/**', 'scripts/docs/**']
  pull_request:
    paths: ['**.md', 'docs/**', 'scripts/docs/**']

env:
  MIN_CONSISTENCY_SCORE: '95'

jobs:
  docs-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x

      - name: Validate Documentation
        id: validate
        run: |
          echo "Running documentation validation..."

          # Run validation and capture output
          if deno run --allow-read scripts/docs/validate.ts --format json README.md AGENTS.md constitution.md > validation-result.json 2>&1; then
            echo "Validation completed successfully"
          else
            echo "Validation found issues"
          fi

          # Extract metrics
          if [ -f validation-result.json ]; then
            score=$(cat validation-result.json | grep -o '"consistencyScore":[0-9.]*' | cut -d: -f2)
            echo "score=${score:-0}" >> $GITHUB_OUTPUT

            errors=$(cat validation-result.json | grep -o '"errorCount":[0-9]*' | cut -d: -f2)
            echo "errors=${errors:-0}" >> $GITHUB_OUTPUT

            warnings=$(cat validation-result.json | grep -o '"warningCount":[0-9]*' | cut -d: -f2)
            echo "warnings=${warnings:-0}" >> $GITHUB_OUTPUT
          else
            echo "score=0" >> $GITHUB_OUTPUT
            echo "errors=1" >> $GITHUB_OUTPUT
            echo "warnings=0" >> $GITHUB_OUTPUT
          fi

      - name: Check Consistency Score
        run: |
          SCORE="${{ steps.validate.outputs.score }}"
          echo "Consistency Score: ${SCORE}%"
          echo "Minimum Required: ${MIN_CONSISTENCY_SCORE}%"

          if (( $(echo "${SCORE} >= ${MIN_CONSISTENCY_SCORE}" | bc -l) )); then
            echo "✅ Consistency score meets minimum requirement"
          else
            echo "❌ Consistency score below minimum requirement"
            exit 1
          fi

      - name: Generate Documentation Report
        if: always()
        run: |
          echo "## Documentation Validation Report" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Consistency Score | ${{ steps.validate.outputs.score }}% |" >> $GITHUB_STEP_SUMMARY
          echo "| Errors | ${{ steps.validate.outputs.errors }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Warnings | ${{ steps.validate.outputs.warnings }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Minimum Required | ${MIN_CONSISTENCY_SCORE}% |" >> $GITHUB_STEP_SUMMARY

          # Add detailed results if validation file exists
          if [ -f validation-result.json ]; then
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "### Detailed Results" >> $GITHUB_STEP_SUMMARY
            echo "\`\`\`json" >> $GITHUB_STEP_SUMMARY
            cat validation-result.json >> $GITHUB_STEP_SUMMARY
            echo "\`\`\`" >> $GITHUB_STEP_SUMMARY
          fi

  progressive-disclosure:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x

      - name: Generate Progressive Disclosure
        run: |
          deno run --allow-read --allow-write scripts/docs/generate-disclosure.ts README.md

      - name: Commit Changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add README.md

          if ! git diff --cached --exit-code; then
            git commit -m "docs: auto-update progressive disclosure formatting"
            git push
          else
            echo "No changes to commit"
          fi
EOF
```

### Phase 4: Improve Documentation Content (60+ minutes)

#### Step 1: Enhance README.md

Apply progressive disclosure and consistency improvements:

```bash
## Run validation to identify current issues
deno run --allow-read scripts/docs/validate.ts README.md

## Apply progressive disclosure formatting
deno run --allow-read --allow-write scripts/docs/generate-disclosure.ts README.md
```

#### Step 2: Update AGENTS.md

```bash
## Validate current state
deno run --allow-read scripts/docs/validate.ts AGENTS.md

## Update technology stack information manually
## Ensure all terminology is consistent
## Add clear contribution guidelines
```

#### Step 3: Review Constitution

```bash
## Validate constitution
deno run --allow-read scripts/docs/validate.ts constitution.md

## Ensure principles are clearly numbered and actionable
## Verify scope boundaries are explicit
## Check that success criteria are measurable
```

### Phase 5: Test and Validate (30 minutes)

#### Step 1: Run Full Validation

```bash
## Test all documentation files
deno run --allow-read scripts/docs/validate.ts README.md AGENTS.md constitution.md

## Verify consistency score meets 95% target
## Fix any terminology issues found
## Resolve any broken links
```

#### Step 2: Test GitHub Actions

```bash
## Commit changes and push to trigger workflow
git add .
git commit -m "feat: implement documentation validation and improvements"
git push origin 009-improve-docs

## Monitor GitHub Actions workflow
## Verify validation passes
## Check that consistency score meets requirements
```

#### Step 3: Manual Validation

1. **User Experience Test**: Have a new user follow README for installation
2. **Contributor Test**: Have a developer use AGENTS.md to set up environment
3. **Maintainer Test**: Use constitution to evaluate a mock feature request

### Success Criteria Checklist

- [ ] **SC-001**: New users complete installation in <10 minutes using README
- [ ] **SC-002**: 95% of questions answered in documentation (test with FAQ
      analysis)
- [ ] **SC-003**: Contributors understand standards in <15 minutes using
      AGENTS.md
- [ ] **SC-004**: Maintainers make decisions in <5 minutes using constitution
- [ ] **SC-005**: Documentation consistency score ≥95%
- [ ] **SC-006**: Automated validation prevents inconsistency
- [ ] **SC-007**: Time to first contribution measurably improved

### Maintenance

#### Daily

- Monitor GitHub Actions for validation failures
- Review and merge automated formatting updates

#### Weekly

- Review metrics and consistency scores
- Update terminology database as needed

#### Monthly

- Analyze user feedback for documentation gaps
- Update success criteria measurements
- Review and update validation rules

### Troubleshooting

#### Common Issues

1. **Validation script fails**: Check Deno permissions and file paths
2. **GitHub Actions timeout**: Reduce file set or optimize validation logic
3. **Terminology conflicts**: Update terminology.json with new canonical forms
4. **Progressive disclosure breaks**: Check HTML syntax in generated sections

#### Getting Help

- Check `CONTRACTS.md` for interface requirements
- Review research.md for implementation rationale
- Consult DATA_MODEL.md for entity relationships
- Reference GitHub Actions logs for detailed error information

This quickstart provides a complete implementation path for the documentation
improvement initiative.
