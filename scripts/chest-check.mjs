#!/usr/bin/env node
// chest check for a tool of this monorepo, as the Chest would receive it.
//
// The official checker (`@argentic/chest-check`, reference/sdk/check) reads
// the Git repository a folder belongs to — here the whole studio. A tool is
// meant to become its own repository, so this script copies the files Git
// tracks or would add under the tool's folder into a fresh repository and
// runs the official checker there, unchanged.
//
//   node scripts/chest-check.mjs tools/private/tasks [--json]
//   node scripts/chest-check.mjs --all [--json]
//
// The checker is built once from a copy of reference/sdk (read-only) in
// ~/.cache/chest-sdk-<version>: `npm ci` there builds check/.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reference = join(root, "reference", "sdk");
const version = JSON.parse(readFileSync(join(reference, "package.json"), "utf8")).version;
const cache = join(homedir(), ".cache", `chest-sdk-${version}`);
const cli = join(cache, "check", "dist", "cli.js");

function ensureChecker() {
  if (existsSync(cli)) return;
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(dirname(cache), { recursive: true });
  cpSync(reference, cache, { recursive: true, filter: (path) => !path.includes("node_modules") });
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: cache, stdio: ["ignore", "ignore", "inherit"] });
  if (!existsSync(cli)) throw new Error(`chest check was not built in ${cache}`);
}

function check(tool, json) {
  const dir = resolve(tool);
  const files = execFileSync("git", ["-C", dir, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { maxBuffer: 256 << 20 })
    .toString().split("\0").filter(Boolean)
    .filter((file) => existsSync(join(dir, file)));
  const work = mkdtempSync(join(tmpdir(), "chest-check-tool-"));
  try {
    for (const file of files) {
      mkdirSync(dirname(join(work, file)), { recursive: true });
      cpSync(join(dir, file), join(work, file), { verbatimSymlinks: true });
    }
    execFileSync("git", ["init", "-q"], { cwd: work });
    // The Chest's pinned image is Node 24.21 (reference/contract,
    // "runtime/base-image"). Under Node 22 the checker's WASI run crashes
    // with a segmentation fault on archives of a few megabytes (reproduced
    // on 5 October 2026 with Node 22.22; reports/03-sdk-report.md): run it
    // with Node 24 — CHEST_NODE, or /opt/node24 when present.
    const node = process.env.CHEST_NODE ?? (existsSync("/opt/node24/bin/node") ? "/opt/node24/bin/node" : process.execPath);
    const result = spawnSync(node, [cli, "check", work, ...(json ? ["--json"] : [])], { encoding: "utf8" });
    return { status: result.status ?? 2, output: (result.stdout + result.stderr).trim() };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const targets = args.includes("--all")
  ? ["private", "public-and-private"].flatMap((kind) => readdirSync(join(root, "tools", kind), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(root, "tools", kind, entry.name)))
  : args.filter((arg) => !arg.startsWith("--"));
if (targets.length === 0) {
  console.error("usage: node scripts/chest-check.mjs <tool folder>… | --all [--json]");
  process.exit(2);
}
ensureChecker();
let worst = 0;
for (const target of targets) {
  const { status, output } = check(target, json);
  worst = Math.max(worst, status);
  console.log(json ? JSON.stringify({ tool: target.replace(root + "/", ""), status, result: safeParse(output) }) : `== ${target.replace(root + "/", "")}\n${output}`);
}
process.exit(worst);

function safeParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}
