// Gives a tool the studio's working copy of the Chest SDK (sdk/), with the proposed
// modules the published package does not have yet.
//
// A tool that uses only what the published SDK offers depends on npm
// ("@argentic/chest-sdk": "^0.2.0") and never needs this script. A tool that
// uses a proposal of sdk/ gets a packed copy of it in its own vendor/
// (a tool stays self-contained: it will become its own repository). Run it
// again after every change to sdk/.
//
//   node scripts/add-sdk.mjs tools/private/<name>
//   node scripts/add-sdk.mjs tools/public-and-private/<name>
//   (then, in the tool: npm install)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const tool = target && resolve(root, target);
const kinds = [join(root, "tools", "private"), join(root, "tools", "public-and-private")];
if (!tool || !kinds.includes(dirname(tool)) || !existsSync(join(tool, "package.json"))) {
  console.error("usage: node scripts/add-sdk.mjs tools/private/<name> | tools/public-and-private/<name> (with a package.json)");
  process.exit(1);
}

const sdk = join(root, "sdk");
if (!existsSync(join(sdk, "node_modules"))) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: sdk, stdio: "inherit" });
const vendor = join(tool, "vendor");
rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor);
// prepack builds dist/ from the working copy's sources.
execFileSync("npm", ["pack", "--pack-destination", vendor], { cwd: sdk, stdio: ["ignore", "ignore", "inherit"] });
const tarball = readdirSync(vendor).find((name) => name.endsWith(".tgz"));

const manifestPath = join(tool, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.dependencies = { ...manifest.dependencies, "@argentic/chest-sdk": `file:vendor/${tarball}` };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${basename(tool)}: @argentic/chest-sdk → file:vendor/${tarball} (run npm install in ${target})`);
