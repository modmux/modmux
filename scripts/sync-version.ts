// sync-version.ts — reads version from deno.json and propagates to all distribution artifacts

import { fromFileUrl, join } from "@std/path";

const repoRoot = fromFileUrl(new URL("../", import.meta.url));

// Read version from deno.json
const denoJsonPath = join(repoRoot, "deno.json");
const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
const version: string = denoJson.version;

if (!version) {
  console.error("No version field found in deno.json");
  Deno.exit(1);
}

console.log(`Syncing version ${version} across all distribution artifacts...`);

// 1. Write cli/src/version.ts
const versionTsPath = join(repoRoot, "cli", "src", "version.ts");
await Deno.writeTextFile(
  versionTsPath,
  `export const VERSION = "${version}";\n`,
);
console.log(`  ✓ cli/src/version.ts`);

// 2. Update cli/deno.json version
const cliDenoJsonPath = join(repoRoot, "cli", "deno.json");
const cliDenoJson = JSON.parse(await Deno.readTextFile(cliDenoJsonPath));
cliDenoJson.version = version;
await Deno.writeTextFile(
  cliDenoJsonPath,
  JSON.stringify(cliDenoJson, null, 2) + "\n",
);
console.log(`  ✓ cli/deno.json`);

console.log(`\nAll artifacts synced to version ${version} ✅`);
