// Every tool of a studio tree, one at a time, then the table.
//
//   node lab/measure/all.mjs <studio root> --label <label> [--only a,b] [--skip-done] [--no-references] [measure.mjs options]
//
// The tools: <root>/tools/private/* and <root>/tools/public-and-private/*,
// then the references <root>/reference/perseus-starter and
// <root>/reference/forms (unless --no-references). --skip-done leaves out a
// tool that already has a result under the label (to resume a long run).
// Each tool is measured by its own `node measure.mjs` process, so one tool's
// fake Chest or failure never weighs on the next.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf } from "./pages.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : null;
if (!root || !label) { console.error("usage: node lab/measure/all.mjs <studio root> --label <label> [--only a,b] [--skip-done] [--no-references] [measure options]"); process.exit(2); }
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const pass = args.slice(1).filter((a, i, all) => !["--only", "--skip-done", "--no-references"].includes(a) && all[i - 1] !== "--only");

const folders = [];
for (const kind of ["private", "public-and-private"]) {
  const dir = join(root, "tools", kind);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).sort()) if (existsSync(join(dir, name, "chest.json"))) folders.push(join(dir, name));
}
if (!args.includes("--no-references")) for (const ref of ["perseus-starter", "forms"]) if (existsSync(join(root, "reference", ref, "chest.json"))) folders.push(join(root, "reference", ref));

const failed = [];
for (const folder of folders) {
  const key = keyOf(folder);
  if (only && !only.includes(key)) continue;
  if (args.includes("--skip-done") && existsSync(join(here, "results", label, `${key}.json`))) { console.log(`[${key}] done already`); continue; }
  const run = spawnSync(process.execPath, [join(here, "measure.mjs"), folder, ...pass], { stdio: "inherit" });
  if (run.status !== 0) failed.push(key);
}
spawnSync(process.execPath, [join(here, "table.mjs"), label, "--out", join(here, "results", label, "TABLE.md")], { stdio: "inherit" });
console.log(failed.length ? `failed: ${failed.join(", ")}` : "all measured");
process.exit(failed.length ? 1 : 0);
