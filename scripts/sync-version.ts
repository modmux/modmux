// sync-version.ts — reads version from deno.json and propagates to all distribution artifacts

import { join } from "@std/path";

const repoRoot = new URL("../", import.meta.url).pathname;

// Read version from deno.json
const denoJsonPath = join(repoRoot, "deno.json");
const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
const version: string = denoJson.version;

if (!version) {
  console.error("No version field found in deno.json");
  Deno.exit(1);
}

console.log(`Syncing version ${version} across all distribution artifacts...`);

// 1. Write src/version.ts
const versionTsPath = join(repoRoot, "src", "version.ts");
await Deno.writeTextFile(
  versionTsPath,
  `export const VERSION = "${version}";\n`,
);
console.log(`  ✓ src/version.ts`);

// 2. Update npm/claudio/package.json (version + optionalDependencies versions)
const mainPkgPath = join(repoRoot, "npm", "claudio", "package.json");
const mainPkg = JSON.parse(await Deno.readTextFile(mainPkgPath));
mainPkg.version = version;
if (mainPkg.optionalDependencies) {
  for (const key of Object.keys(mainPkg.optionalDependencies)) {
    mainPkg.optionalDependencies[key] = version;
  }
}
await Deno.writeTextFile(mainPkgPath, JSON.stringify(mainPkg, null, 2) + "\n");
console.log(`  ✓ npm/claudio/package.json`);

// 3. Update each platform package.json
const platforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "win32-x64",
];

for (const platform of platforms) {
  const pkgPath = join(repoRoot, "npm", "@claudio", platform, "package.json");
  const pkg = JSON.parse(await Deno.readTextFile(pkgPath));
  pkg.version = version;
  await Deno.writeTextFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ✓ npm/@claudio/${platform}/package.json`);
}

console.log(`\nAll artifacts synced to version ${version} ✅`);
