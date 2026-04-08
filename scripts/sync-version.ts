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

// 2. Update npm/modmux package.json (version + optionalDependencies)
for (const pkgName of ["modmux"]) {
  const mainPkgPath = join(repoRoot, "npm", pkgName, "package.json");
  const mainPkg = JSON.parse(await Deno.readTextFile(mainPkgPath));
  mainPkg.version = version;
  if (mainPkg.optionalDependencies) {
    for (const key of Object.keys(mainPkg.optionalDependencies)) {
      mainPkg.optionalDependencies[key] = version;
    }
  }
  await Deno.writeTextFile(
    mainPkgPath,
    JSON.stringify(mainPkg, null, 2) + "\n",
  );
  console.log(`  ✓ npm/${pkgName}/package.json`);
}

// 3. Update each @modmux platform package.json
const platforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "win32-x64",
];

for (const platform of platforms) {
  const pkgPath = join(repoRoot, "npm", "@modmux", platform, "package.json");
  const pkg = JSON.parse(await Deno.readTextFile(pkgPath));
  pkg.version = version;
  await Deno.writeTextFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ✓ npm/@modmux/${platform}/package.json`);
}

console.log(`\nAll artifacts synced to version ${version} ✅`);
