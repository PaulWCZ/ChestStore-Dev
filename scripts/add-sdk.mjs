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
//   (it installs the copy in the tool when its node_modules exists)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const tool = target && resolve(root, target);
const kinds = [join(root, "tools", "private"), join(root, "tools", "public-and-private")];
if (!tool || !(kinds.includes(dirname(tool)) || tool === join(root, "lab", "template")) || !existsSync(join(tool, "package.json"))) {
  console.error("usage: node scripts/add-sdk.mjs tools/private/<name> | tools/public-and-private/<name> (with a package.json)");
  process.exit(1);
}

const sdk = join(root, "sdk");
if (!existsSync(join(sdk, "node_modules"))) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: sdk, stdio: "inherit" });
const vendor = join(tool, "vendor");
mkdirSync(vendor, { recursive: true });
// Only the SDK's previous copies go: the UI kit's copy (scripts/add-ui.mjs)
// may live beside it.
for (const old of readdirSync(vendor).filter((name) => name.startsWith("argentic-chest-sdk-") && name.endsWith(".tgz"))) rmSync(join(vendor, old));
// prepack builds dist/ from the working copy's sources.
// Packing rebuilds dist/: two packs at once give an incomplete copy, so
// one pack at a time (a lock folder; one older than 10 minutes is stale).
const lock = join(sdk, ".pack-lock");
for (const start = Date.now(); ;) {
  try { mkdirSync(lock); break; } catch {
    const age = (() => { try { return Date.now() - statSync(lock).mtimeMs; } catch { return 0; } })();
    if (age > 600_000) { rmSync(lock, { recursive: true, force: true }); continue; }
    if (Date.now() - start > 900_000) { console.error(`another pack holds ${lock}`); process.exit(1); }
    execFileSync("sleep", ["1"]);
  }
}
// A pack must hold the built files: check it, pack once more if not, then refuse.
const PREFIX = "argentic-chest-sdk-";
const built = ["package/dist/index.js"];
const whole = () => {
  const file = readdirSync(vendor).find(name => name.startsWith(PREFIX) && name.endsWith(".tgz"));
  if (!file) return false;
  const listed = new Set(execFileSync("tar", ["tzf", join(vendor, file)], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n"));
  return built.every(path => listed.has(path));
};
try {
  for (let attempt = 1; ; attempt++) {
    execFileSync("npm", ["pack", "--pack-destination", vendor], { cwd: sdk, stdio: ["ignore", "ignore", "inherit"] });
    if (whole()) break;
    if (attempt === 2) { console.error(`the packed copy in ${vendor} lacks its built files (${built.join(", ")}): not installed`); process.exit(1); }
  }
} finally {
  rmSync(lock, { recursive: true, force: true });
}
const tarball = readdirSync(vendor).find((name) => name.startsWith("argentic-chest-sdk-") && name.endsWith(".tgz"));

const manifestPath = join(tool, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.dependencies = { ...manifest.dependencies, "@argentic/chest-sdk": `file:vendor/${tarball}` };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// The same version packed again has another integrity: npm would keep the
// copy it installed. Forget it in the lockfile and in node_modules, then
// install, so the tool runs what sdk/ holds now.
const lockPath = join(tool, "package-lock.json");
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lock.packages) delete lock.packages["node_modules/@argentic/chest-sdk"];
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}
rmSync(join(tool, "node_modules", "@argentic", "chest-sdk"), { recursive: true, force: true });
if (existsSync(join(tool, "node_modules"))) execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: tool, stdio: ["ignore", "ignore", "inherit"] });
console.log(`${basename(tool)}: @argentic/chest-sdk → file:vendor/${tarball}${existsSync(join(tool, "node_modules")) ? " (installed)" : " (run npm install in " + target + ")"}`);
