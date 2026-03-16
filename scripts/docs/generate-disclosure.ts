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
        result.push(...currentSection.slice(1)); // Skip the header line
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
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${file}: ${message}`);
    }
  }
}

if (import.meta.main) {
  await main();
}
