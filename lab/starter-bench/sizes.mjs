// The starter's and the package's sizes, as the report quotes them (run it
// before quoting: three reviews in a row found the report's figures stale).
//   node lab/starter-bench/sizes.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tracked = dir => execFileSync("git", ["ls-files", dir], { cwd: root }).toString().split("\n").filter(f => f && !/(package-lock\.json|\.tgz|\.png)$/u.test(f));
const lines = files => files.reduce((n, f) => n + readFileSync(join(root, f), "utf8").split("\n").length - 1, 0);
const template = tracked("starter");
const figures = {
  "starter: files (no lock, no tgz)": template.length,
  "starter: lines": lines(template),
  "starter/AGENTS.md: lines": lines(["starter/AGENTS.md"]),
  "app/src: lines": lines(tracked("app/src")),
  "app/test: lines": lines(tracked("app/test")),
  "app/AGENTS.md: lines": lines(["app/AGENTS.md"]),
  "reference/perseus-starter: files": tracked("reference/perseus-starter").length,
  "reference/perseus-starter: lines": lines(tracked("reference/perseus-starter")),
};
for (const [name, value] of Object.entries(figures)) console.log(`${name.padEnd(40)} ${value}`);
