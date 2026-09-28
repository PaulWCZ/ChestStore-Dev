// Starts a store tool from the studio's starter (lab/template): copies it,
// names it, packs the SDK and UI kit working copies into it and installs.
//
//   node scripts/new-tool.mjs private <name>
//   node scripts/new-tool.mjs public-and-private <name>
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [kind, name] = process.argv.slice(2);
if (!["private", "public-and-private"].includes(kind) || !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(name ?? "")) {
  console.error("usage: node scripts/new-tool.mjs private|public-and-private <name>");
  process.exit(1);
}
const template = join(root, "lab", "template");
const target = join(root, "tools", kind, name);
if (existsSync(target)) {
  console.error(`${relative(root, target)} exists`);
  process.exit(1);
}
const skipped = ["node_modules", ".next", "vendor", "next-env.d.ts"].map(p => join(template, p));
cpSync(template, target, { recursive: true, filter: source => !skipped.includes(source) && !source.startsWith(join(template, "docs", "screens") + "/") && source !== join(template, "chest", "preview.png") });
const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
pkg.name = "chest-" + name;
delete pkg.dependencies["@argentic/chest-sdk"];
const usesKit = "@argentic/chest-ui" in pkg.dependencies;
delete pkg.dependencies["@argentic/chest-ui"];
writeFileSync(join(target, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
const manifest = JSON.parse(readFileSync(join(target, "chest.json"), "utf8"));
manifest.name = name;
if (kind === "private") {
  delete manifest.public;
  delete manifest.csp;
}
writeFileSync(join(target, "chest.json"), JSON.stringify(manifest, null, 2) + "\n");
rmSync(join(target, "package-lock.json"), { force: true });
execFileSync("node", [join(root, "scripts", "add-sdk.mjs"), relative(root, target)], { cwd: root, stdio: "inherit" });
if (usesKit) execFileSync("node", [join(root, "scripts", "add-ui.mjs"), relative(root, target)], { cwd: root, stdio: "inherit" });
execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: target, stdio: "inherit" });
console.log(`\n${relative(root, target)} is ready: npm test, npm run build; then replace the notes with the tool.`);
