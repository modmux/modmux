# Documentation Style Guide

**Purpose**: Maintain consistency across all documentation in the Claudio
project **Scope**: README.md, AGENTS.md, constitution.md, and supporting
documentation **Last Updated**: 2026-03-08

## Content Guidelines

### Tone and Voice

- **Professional and approachable** - Technical but accessible
- **Helpful and encouraging** - Assume good intent, provide clear guidance
- **Concise and actionable** - Get to the point, provide specific steps
- **Consistent with Claudio's calm UX principles** - No excitement or hyperbole

### Writing Style

- **Second person** - Use "you" for instructions and guidance
- **Present tense** - Describe current capabilities and state
- **Active voice** - "Claudio validates" not "validation is performed"
- **Parallel structure** - Consistent formatting in lists and steps

## Formatting Standards

### Headings

```markdown
# Document Title (H1 - one per document)

## Major Section (H2)

### Subsection (H3)

#### Detail Section (H4 - rarely used)
```

### Code Examples

- Always use syntax highlighting: `typescript,`bash, ```json
- Include complete, working examples
- Add brief comments for complex code
- Test all command examples before documenting

### Lists and Structure

- Use `-` for unordered lists (not `*` or `+`)
- Use `1.` for ordered lists that represent steps
- Use `- [ ]` for checklists and task lists
- Maximum 3 levels of nesting in lists

### Links and References

- Use descriptive link text: `[GitHub Releases](url)` not `[here](url)`
- Prefer relative links for internal documents
- Always test external links
- Include protocol for external URLs: `https://example.com`

## Terminology Standards

### Canonical Terms

Use these exact spellings and capitalizations:

| Correct     | Incorrect                       |
| ----------- | ------------------------------- |
| GitHub      | github, Github                  |
| TypeScript  | typescript, Typescript          |
| Deno        | deno (except in commands)       |
| Claude Code | claude code, Claude code        |
| API         | api, Api                        |
| CLI         | cli (except in directory names) |

### Technical Terminology

- **Proxy server** (not proxy service)
- **Command-line interface** (not command line interface)
- **Configuration file** (not config file)
- **Authentication flow** (not auth flow)

## Progressive Disclosure

### When to Use

Apply progressive disclosure for:

- Advanced configuration options
- Troubleshooting sections
- Platform-specific instructions
- Optional or expert-level content

### Implementation

```markdown
<details>
<summary>📖 Section Title</summary>

Content goes here with proper markdown formatting.

</details>
```

### Emoji Usage

Use contextually appropriate emojis in progressive disclosure summaries:

- 🚀 Quick Start
- 📦 Installation
- 🔧 Configuration
- 🆘 Troubleshooting
- 📖 Examples/Documentation

## File-Specific Guidelines

### README.md

- **Purpose**: User onboarding and project overview
- **Target audience**: End users discovering and installing Claudio
- **Reading time target**: 5-10 minutes
- **Structure**: Title → Features → Installation → Usage → Development
- **Progressive disclosure**: Use for advanced config, troubleshooting

### AGENTS.md

- **Purpose**: Developer guidelines and contribution instructions
- **Target audience**: Contributors and development team
- **Reading time target**: 6-8 minutes
- **Structure**: Overview → Technology → Structure → Guidelines → Commands
- **Progressive disclosure**: Generally avoid - developers need full access

### Constitution

- **Purpose**: Project governance and decision-making principles
- **Target audience**: Maintainers and contributors
- **Reading time target**: 7-10 minutes
- **Structure**: Purpose → Principles → Scope → Standards → Governance
- **Progressive disclosure**: Avoid - constitutional principles must be visible

## Validation and Quality

### Automated Checks

All documentation must pass:

- Markdown linting (markdownlint-cli2)
- Terminology validation (custom Deno script)
- Link validation (internal links only)
- Consistency scoring (≥95% required)

### Manual Review Checklist

Before publishing documentation changes:

- [ ] Follows tone and voice guidelines
- [ ] Uses canonical terminology
- [ ] Includes working code examples
- [ ] Links are functional and descriptive
- [ ] Progressive disclosure applied appropriately
- [ ] Passes automated validation
- [ ] Reading time is appropriate for audience

### Consistency Scoring

Score calculation: `100 - (violations / max_possible_violations * 100)`

- **Markdown lint errors**: -5 points each
- **Terminology inconsistencies**: -3 points each
- **Broken internal links**: -2 points each
- **Formatting violations**: -1 point each

## Maintenance

### Regular Tasks

- Monthly link validation check
- Quarterly terminology database review
- Version updates in response to feature changes
- Style guide updates as project evolves

### Update Process

1. Make changes following this style guide
2. Run automated validation: `deno run -A scripts/docs/validate.ts [files]`
3. Review for consistency and tone
4. Test all examples and links
5. Commit with clear documentation change message
