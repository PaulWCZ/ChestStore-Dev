// Do the tools' vendored packs match the studio's working copies? For each
// vendor/*.tgz of the starter and of every tool that is a studio package
// (@argentic/chest-app from app/, @argentic/chest-ui from ui/, a studio
// @argentic/chest-sdk from sdk/): the same version as the working copy and
// the same files, byte for byte, as a fresh pack of it — or say what
// differs. The official SDK (a version without "-studio") is left alone.
//
//   node scripts/check-vendor.mjs [starter tools/private/tasks …]   (all by default)
//
// Exit 1 when a pack differs from its working copy at the same version.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = { "@argentic/chest-app": "app", "@argentic/chest-ui": "ui", "@argentic/chest-sdk": "sdk" };
const targets = process.argv.length > 2 ? process.argv.slice(2) : ["starter", ...["private", "public-and-private"].flatMap(kind => readdirSync(join(root, "tools", kind)).map(name => `tools/${kind}/${name}`))];

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
function fresh(source) {
  if (packed.has(source)) return packed.get(source);
  const dir = join(root, source);
  if (!existsSync(join(dir, "node_modules"))) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir, stdio: "ignore" });
  const out = mkdtempSync(join(tmpdir(), "pack-"));
  execFileSync("npm", ["pack", "--loglevel=warn", "--pack-destination", out], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
  const tgz = join(out, readdirSync(out).find(f => f.endsWith(".tgz")));
  const result = { version: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version, files: contents(tgz) };
  rmSync(out, { recursive: true, force: true });
  packed.set(source, result);
  return result;
}

let failed = false;
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
      console.log(`${target}: ${name} ${version} — ${source}/ is ${copy.version} (re-vendor to take it)`);
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
process.exit(failed ? 1 : 0);
