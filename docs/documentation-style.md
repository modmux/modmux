# Documentation Style

Use this file to keep Modmux docs short, direct, and consistent.

## Surface roles

- **README.md** — what Modmux is, why to use it, how to install it, and where to
  go next
- **docs/getting-started.md** — shortest path from install to first working
  request
- **docs/troubleshooting.md** — fix-oriented commands and common recovery steps
- **docs/api/*.md** — endpoint reference, request and response details,
  practical examples
- **CONTRIBUTING.md** — contributor workflow, project structure, and code style

If a section does not fit the job of its file, move it instead of repeating it.

## Writing rules

- Lead with the answer.
- Prefer short sentences.
- Keep one purpose per section.
- Use concrete headings.
- Do not repeat the heading in the first paragraph.
- Prefer commands and examples over narration.
- Avoid promotional language.
- Link to deeper docs instead of restating them.

## Before you merge doc changes

- Check that the README still explains Modmux quickly.
- Check that getting-started is still the fastest setup path.
- Check that troubleshooting starts with diagnostics and fixes.
- Check that API docs stay reference-focused.
- Check that terms and endpoint names match the current codebase.
