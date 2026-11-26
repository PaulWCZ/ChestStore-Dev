// Gives a tool the studio's app package (app/, @argentic/chest-app): its
// server, actions, islands, refresh, words and formats, tests helpers. The
// package is not published: a tool gets a packed copy in its own vendor/
// (a tool stays self-contained: it will become its own repository). Run it
// again after every change to app/.
//
//   node scripts/add-app.mjs starter
//   node scripts/add-app.mjs tools/private/<name>
//   node scripts/add-app.mjs tools/public-and-private/<name>
//   (it installs the copy in the tool when its node_modules exists)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const tool = target && resolve(root, target);
const kinds = [join(root, "tools", "private"), join(root, "tools", "public-and-private")];
if (!tool || !(kinds.includes(dirname(tool)) || tool === join(root, "starter")) || !existsSync(join(tool, "package.json"))) {
  console.error("usage: node scripts/add-app.mjs starter | tools/private/<name> | tools/public-and-private/<name> (with a package.json)");
  process.exit(1);
}

const app = join(root, "app");
if (!existsSync(join(app, "node_modules"))) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit" });
const vendor = join(tool, "vendor");
mkdirSync(vendor, { recursive: true });
const PREFIX = "argentic-chest-app-";
for (const old of readdirSync(vendor).filter(name => name.startsWith(PREFIX) && name.endsWith(".tgz"))) rmSync(join(vendor, old));

// Packing rebuilds dist/ (prepack): one pack at a time (a lock folder; one
// older than 10 minutes is stale), and a pack must hold the built files.
const lock = join(app, ".pack-lock");
for (const start = Date.now(); ;) {
  try { mkdirSync(lock); break; } catch {
    const age = (() => { try { return Date.now() - statSync(lock).mtimeMs; } catch { return 0; } })();
    if (age > 600_000) { rmSync(lock, { recursive: true, force: true }); continue; }
    if (Date.now() - start > 900_000) { console.error(`another pack holds ${lock}`); process.exit(1); }
    execFileSync("sleep", ["1"]);
  }
}
const built = ["package/dist/index.js", "package/dist/client.js", "package/dist/browser.js", "package/dist/testing.js"];
try {
  execFileSync("npm", ["pack", "--loglevel=warn", "--pack-destination", vendor], { cwd: app, stdio: ["ignore", "ignore", "inherit"] });
} finally {
  rmSync(lock, { recursive: true, force: true });
}
const tarball = readdirSync(vendor).find(name => name.startsWith(PREFIX) && name.endsWith(".tgz"));
const listed = new Set(execFileSync("tar", ["tzf", join(vendor, tarball)], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n"));
if (!built.every(path => listed.has(path))) { console.error(`${tarball} lacks its built files`); process.exit(1); }

const manifestPath = join(tool, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.dependencies = { ...manifest.dependencies, "@argentic/chest-app": `file:vendor/${tarball}` };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// The same version packed again has another integrity: forget the old one
// in the lockfile and node_modules, then install (or only lock).
const lockPath = join(tool, "package-lock.json");
if (existsSync(lockPath)) {
  const lockfile = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lockfile.packages) delete lockfile.packages["node_modules/@argentic/chest-app"];
  writeFileSync(lockPath, JSON.stringify(lockfile, null, 2) + "\n");
}
rmSync(join(tool, "node_modules", "@argentic", "chest-app"), { recursive: true, force: true });
const installed = existsSync(join(tool, "node_modules"));
execFileSync("npm", installed ? ["install", "--no-audit", "--no-fund"] : ["install", "--package-lock-only", "--no-audit", "--no-fund"], { cwd: tool, stdio: ["ignore", "ignore", "inherit"] });
console.log(`${basename(tool)}: @argentic/chest-app → file:vendor/${tarball}${installed ? " (installed)" : " (lockfile updated; npm ci installs it)"}`);
