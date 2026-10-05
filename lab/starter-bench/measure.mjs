// Measures starters the same way, one after the other (never two builds at
// once): install, build, output, memory at rest, cold start, the browser's
// bytes for the members' page, an axe-core audit.
//
//   node lab/starter-bench/measure.mjs <name>=<tool dir> … [--runs 5] [--starts 10] [--idle 30] [--out file.json]
//
// Each <tool dir> is a clean copy of a starter (its node_modules and build
// are removed first). Node is the one on PATH (the Chest's: 24.21). The
// tool runs as the Chest runs it: `npm start`, PORT set, a fake Chest from
// its own SDK, its database when it has migrations (chest.mjs).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";
import { memory, runTool } from "./chest.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args.splice(i, 2)[1]; };
const runs = Number(option("runs", 5)), starts = Number(option("starts", 10)), idle = Number(option("idle", 30));
const out = option("out", null);
const candidates = args.map(a => { const [name, dir] = a.split("="); return { name, dir: resolve(dir) }; });

const median = list => { const s = [...list].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const mib = kib => Math.round(kib / 102.4) / 10;
const du = path => (existsSync(path) ? Number(execFileSync("du", ["-sk", path]).toString().split("\t")[0]) : 0);
const files = path => Number(execFileSync("sh", ["-c", `find "${path}" -type f | wc -l`]).toString().trim());
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

// A command's wall time and its peak memory: the whole process tree
// sampled every 50 ms (no GNU time here) — the sum of its PSS (what a
// container's memory counts, near enough) and the largest process's RSS.
async function timed(command, cwd) {
  const started = performance.now();
  const child = spawn(command[0], command.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  let log = "", pss = 0, rss = 0;
  child.stdout.on("data", d => { log += d; });
  child.stderr.on("data", d => { log += d; });
  const sampler = setInterval(() => {
    try {
      const tree = memory(child.pid);
      pss = Math.max(pss, tree.reduce((s, p) => s + p.pss, 0));
      rss = Math.max(rss, ...tree.map(p => p.rss));
    } catch { /* a process ended while read */ }
  }, 50);
  const code = await new Promise(r => child.on("exit", r));
  clearInterval(sampler);
  if (code !== 0) throw new Error(`${command.join(" ")} failed in ${cwd}:\n${log}`);
  return { seconds: (performance.now() - started) / 1000, peak: pss, largest: rss };
}

async function browserFacts(tool, browser, paths) {
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  const bytes = { js: 0, css: 0, jsRaw: 0, cssRaw: 0, requests: 0 };
  let counting = true; // the first page's files only
  page.on("response", async response => {
    if (!counting) return;
    const type = response.request().resourceType();
    if (type !== "script" && type !== "stylesheet") return;
    const body = await response.body().catch(() => null);
    if (!body) return;
    bytes.requests++;
    const kind = type === "script" ? "js" : "css";
    bytes[kind] += gzipSync(body, { level: 9 }).length;
    bytes[`${kind}Raw`] += body.length;
  });
  const audits = {};
  for (const path of paths) {
    const response = await page.goto(`${tool.origin}${path}`, { waitUntil: "networkidle" });
    if (response.status() !== 200) { audits[path] = `status ${response.status()}`; continue; }
    if (path === paths[0]) bytes.html = gzipSync(await response.body(), { level: 9 }).length;
    await page.addScriptTag({ path: axePath });
    audits[path] = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
      return r.violations.map(v => `${v.id} (${v.nodes.length})`);
    });
    counting = false;
  }
  await context.close();
  return { bytes, audits };
}

const results = [];
const browser = await chromium.launch();
for (const { name, dir } of candidates) {
  console.error(`== ${name} (${dir})`);
  for (const d of ["node_modules", "dist", ".next"]) rmSync(resolve(dir, d), { recursive: true, force: true });
  const install = await timed(["npm", "ci", "--no-audit", "--no-fund"], dir);
  const production = { node_modules: du(resolve(dir, "node_modules")), files: files(resolve(dir, "node_modules")) };
  const builds = [];
  for (let i = 0; i < 3; i++) builds.push(await timed(["npm", "run", "build"], dir));
  const output = du(resolve(dir, existsSync(resolve(dir, ".next")) ? ".next" : "dist"));
  const manifest = JSON.parse(readFileSync(resolve(dir, "chest.json"), "utf8"));
  const publicPart = manifest.public === true;

  // Cold start: spawn → the first 200 on /chest as a member.
  const ready = [];
  for (let i = 0; i < starts; i++) {
    const tool = await runTool(dir);
    ready.push(tool.ready);
    await tool.stop();
  }

  // Memory at rest: a few requests (the page as a member, its files), idle,
  // then the process tree's RSS and PSS.
  const rests = [];
  let facts = null;
  for (let i = 0; i < runs; i++) {
    const tool = await runTool(dir);
    if (i === 0) facts = await browserFacts(tool, browser, publicPart ? ["/chest", "/"] : ["/chest"]);
    else for (let j = 0; j < 5; j++) await (await fetch(`${tool.origin}/chest`)).arrayBuffer();
    await new Promise(r => setTimeout(r, idle * 1000));
    const processes = memory(tool.pid);
    // The server: the tree's largest process (npm's child, or Next's own).
    const server = processes.reduce((a, b) => (b.rss > a.rss && !b.command.startsWith("npm") ? b : a), processes.at(-1));
    rests.push({ rss: processes.reduce((s, p) => s + p.rss, 0), pss: processes.reduce((s, p) => s + p.pss, 0), uss: processes.reduce((s, p) => s + p.uss, 0), server, processes });
    await tool.stop();
  }
  // What the Chest keeps after the build: npm prune --omit=dev.
  await timed(["npm", "prune", "--omit=dev", "--no-audit", "--no-fund"], dir);
  const runtime = du(resolve(dir, "node_modules"));
  const result = {
    name,
    install: { seconds: Math.round(install.seconds * 10) / 10, node_modules_mib: mib(production.node_modules), files: production.files, after_prune_mib: mib(runtime) },
    build: { seconds: Math.round(median(builds.map(b => b.seconds)) * 10) / 10, peak_pss_mib: mib(Math.max(...builds.map(b => b.peak))), largest_rss_mib: mib(Math.max(...builds.map(b => b.largest))), output_mib: mib(output) },
    cold_start_ms: { median: Math.round(median(ready)), min: Math.round(Math.min(...ready)), max: Math.round(Math.max(...ready)) },
    rest_mib: { server_rss: mib(median(rests.map(r => r.server.rss))), server_uss: mib(median(rests.map(r => r.server.uss))), tree_rss: mib(median(rests.map(r => r.rss))), tree_uss: mib(median(rests.map(r => r.uss))), tree_pss: mib(median(rests.map(r => r.pss))), runs: rests.map(r => mib(r.server.rss)), processes: rests[0].processes.map(p => `${p.command}: RSS ${mib(p.rss)}, USS ${mib(p.uss)}, PSS ${mib(p.pss)}`) },
    browser_kib: { js_gzip: Math.round(facts.bytes.js / 102.4) / 10, css_gzip: Math.round(facts.bytes.css / 102.4) / 10, html_gzip: Math.round((facts.bytes.html ?? 0) / 102.4) / 10, js_raw: Math.round(facts.bytes.jsRaw / 1024), css_raw: Math.round(facts.bytes.cssRaw / 1024), requests: facts.bytes.requests },
    axe: facts.audits,
  };
  console.error(JSON.stringify(result, null, 2));
  results.push(result);
}
await browser.close();
const report = { date: new Date().toISOString(), node: process.version, cpus: (await import("node:os")).cpus().length, results };
if (out) writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
