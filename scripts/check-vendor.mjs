// Do the tools' vendored packs match the studio's working copies? For each
// vendor/*.tgz of the starter and of every tool that is a studio package
// (@argentic/chest-app from app/, @argentic/chest-ui from ui/, a studio
// @argentic/chest-sdk from sdk/): the same version as the working copy and
// the same files, byte for byte, as a fresh pack of it — or say what
// differs. The official SDK (a version without "-studio") is left alone.
//
//   node scripts/check-vendor.mjs [--stale-fails] [starter tools/private/tasks …]   (all by default)
//
// A pack is "same" (the working copy's bytes), "stale" (an older version:
// re-vendor with scripts/add-app.mjs, add-ui.mjs, add-sdk.mjs) or
// "DIFFERS" (the working copy changed under the same version: bump it).
// The last lines list, per tool, its stale packs.
// Exit 1 when a pack differs (or, with --stale-fails, is stale); exit 2
// when a working copy cannot be packed (the reason printed, no trace).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = { "@argentic/chest-app": "app", "@argentic/chest-ui": "ui", "@argentic/chest-sdk": "sdk" };
const args = process.argv.slice(2);
const staleFails = args.includes("--stale-fails");
const named = args.filter(a => !a.startsWith("--"));
const targets = named.length > 0 ? named : ["starter", ...["private", "public-and-private"].flatMap(kind => readdirSync(join(root, "tools", kind)).map(name => `tools/${kind}/${name}`))];

// The files of a tarball: path → sha256.
function contents(tgz) {
  const dir = mkdtempSync(join(tmpdir(), "vendor-"));
  try {
    execFileSync("tar", ["xzf", tgz, "-C", dir]);
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    return new Map(walk(dir).map(f => [f.slice(dir.length + 1), createHash("sha256").update(readFileSync(f)).digest("hex")]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const manifestOf = tgz => JSON.parse(execFileSync("tar", ["xzOf", tgz, "package/package.json"]).toString());

const packed = new Map(); // source dir → { version, files }
class Unpackable extends Error {}
// A command in a working copy; its failure said in a few lines, and exit 2.
function run(dir, command, argv) {
  try {
    execFileSync(command, argv, { cwd: dir, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  } catch (error) {
    const said = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
    throw new Unpackable(`check-vendor: \`${command} ${argv[0]}\` failed in ${dir.slice(root.length + 1)}/ (exit ${error.status ?? error.code}). Its last lines:\n${said}\nFix that working copy (npm ci; npm run build), then run this again.`);
  }
}
function fresh(source) {
  if (packed.has(source)) return packed.get(source);
  const dir = join(root, source);
  if (!existsSync(join(dir, "node_modules"))) run(dir, "npm", ["ci", "--no-audit", "--no-fund"]);
  const out = mkdtempSync(join(tmpdir(), "pack-"));
  try {
    run(dir, "npm", ["pack", "--loglevel=warn", "--pack-destination", out]);
    const tgz = join(out, readdirSync(out).find(f => f.endsWith(".tgz")));
    const result = { version: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version, files: contents(tgz) };
    packed.set(source, result);
    return result;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

let failed = false;
const stale = new Map(); // tool → ["name old → new"]
try {
  for (const target of targets) {
    const vendor = join(root, target, "vendor");
    if (!existsSync(vendor)) continue;
    for (const file of readdirSync(vendor).filter(f => f.endsWith(".tgz"))) {
      const tgz = join(vendor, file);
      const { name, version } = manifestOf(tgz);
      const source = sources[name];
      if (!source || (name === "@argentic/chest-sdk" && !version.includes("-studio"))) continue;
      const copy = fresh(source);
      if (version !== copy.version) {
        console.log(`${target}: ${name} ${version} — stale: ${source}/ is ${copy.version}`);
        stale.set(target, [...(stale.get(target) ?? []), `${name} ${version} → ${copy.version}`]);
        continue;
      }
      const files = contents(tgz);
      const differ = [...new Set([...files.keys(), ...copy.files.keys()])].filter(path => files.get(path) !== copy.files.get(path));
      if (differ.length === 0) console.log(`${target}: ${name} ${version} — same as ${source}/`);
      else {
        failed = true;
        console.log(`${target}: ${name} ${version} — DIFFERS from ${source}/ at the same version: ${differ.slice(0, 8).join(", ")}${differ.length > 8 ? ` (+${differ.length - 8})` : ""}`);
      }
    }
  }
} catch (error) {
  if (!(error instanceof Unpackable)) throw error;
  console.error(error.message);
  process.exit(2);
}
if (stale.size > 0) {
  console.log(`\nStale packs (re-vendor: node scripts/add-app.mjs | add-ui.mjs | add-sdk.mjs <tool>):`);
  for (const [target, packs] of stale) console.log(`  ${target}: ${packs.join("; ")}`);
}
if (failed) console.log("\nA pack DIFFERS from its working copy at the same version: re-vendor that tool while the version is still in the making; once a version was merged, bump the working copy's version instead.");
process.exit(failed || (staleFails && stale.size > 0) ? 1 : 0);
