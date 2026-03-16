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
  const wordCount =
    content.split(/\s+/).filter((word) => word.length > 0).length;
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

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineMatch = line.match(new RegExp(`\\b${incorrect}\\b`, "g"));
          if (lineMatch) {
            issues.push({
              rule: "terminology-consistency",
              severity: "error",
              line: i + 1,
              column: line.indexOf(incorrect) + 1,
              message: `Found '${incorrect}' should be '${term.canonical}'`,
              suggestion: term.canonical,
            });
          }
        }
      }
    }

    return issues;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not validate terminology: ${message}`);
    return [];
  }
}

async function validateMarkdown(
  content: string,
  filePath: string,
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for broken internal links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const [, , url] = match;

    // Skip external URLs
    if (url.startsWith("http") || url.startsWith("mailto:")) {
      continue;
    }

    // Check if internal file exists
    try {
      if (
        url.startsWith("./") || url.startsWith("../") || !url.startsWith("/")
      ) {
        // Simple path resolution for internal links
        const baseDir = filePath.includes("/")
          ? filePath.substring(0, filePath.lastIndexOf("/"))
          : ".";
        const resolvedPath = url.startsWith("./")
          ? `${baseDir}/${url.substring(2)}`
          : url.startsWith("../")
          ? url
          : `${baseDir}/${url}`;

        // Remove anchor fragments for file existence check
        const pathWithoutAnchor = resolvedPath.split("#")[0];
        await Deno.stat(pathWithoutAnchor);
      }
    } catch {
      issues.push({
        rule: "link-validation",
        severity: "warning",
        message: `Broken internal link: ${url}`,
      });
    }
  }

  // Check for common markdown issues
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for inconsistent heading styles
    if (line.match(/^#{1,6}\s/)) {
      if (!line.match(/^#+\s+\S/)) {
        issues.push({
          rule: "heading-format",
          severity: "warning",
          line: i + 1,
          message: "Heading should have space after # and content",
        });
      }
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
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${file}: ${message}`);
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

  // Calculate consistency score based on formula from FR-014
  const maxPossibleViolations = results.length * 10; // Assume 10 possible violations per file
  const totalViolations = totalIssues;
  const consistencyScore = Math.max(
    0,
    100 - (totalViolations / maxPossibleViolations) * 100,
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
