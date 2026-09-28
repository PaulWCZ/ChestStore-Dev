// Gives a tool of this repository its own copy of the Chest SDK.
//
// The SDK 0.2.0 is not on npm yet: sdk/ holds its packed tarball. A tool must
// stay self-contained (the Chest builds a tool from its own repository, and
// each tool here will become one), so the tarball is copied into the tool and
// its package.json points at that copy. Once 0.2.0 is published, replace the
// dependency by "@argentic/chest-sdk": "^0.2.0" and delete vendor/.
//
//   node scripts/add-sdk.mjs tools/<name>
//   (then, in tools/<name>: npm install)
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/add-sdk.mjs tools/<name>");
  process.exit(1);
}
const tool = resolve(root, target);
if (dirname(tool) !== join(root, "tools") || !existsSync(join(tool, "package.json"))) {
  console.error("expected tools/<name> with a package.json");
  process.exit(1);
}

const tarballs = readdirSync(join(root, "sdk")).filter((name) => /^argentic-chest-sdk-.+\.tgz$/.test(name)).sort();
if (tarballs.length === 0) {
  console.error("no SDK tarball in sdk/");
  process.exit(1);
}
const tarball = tarballs.at(-1);
mkdirSync(join(tool, "vendor"), { recursive: true });
copyFileSync(join(root, "sdk", tarball), join(tool, "vendor", tarball));

const manifestPath = join(tool, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.dependencies = { ...manifest.dependencies, "@argentic/chest-sdk": `file:vendor/${tarball}` };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${basename(tool)}: @argentic/chest-sdk → file:vendor/${tarball} (run npm install in ${target})`);
