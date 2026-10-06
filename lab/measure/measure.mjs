// The measuring bench: one tool's image, cold start and memory at rest,
// measured the same way for every tool (lab/measure/README.md).
//
//   node lab/measure/measure.mjs <tool folder> --label <label> [options]
//
// Options: --key <name> (the result's name; the folder's, "ref-" before a
// reference), --starts 10 (cold starts), --rests 5 (memory runs), --idle 30
// (seconds of rest), --port 4700, --build-memory 512 --build-cpus 1 (the
// Chest-like build's limits), --no-limited-build, --skip-image (reuse the
// work copy of a previous --keep run), --keep (keep the work copy),
// --work <dir> (default $TMPDIR/chest-measure).
//
// Run it with Node 24.21 first in PATH (export PATH=/opt/node24/bin:$PATH):
// the tool is installed, built and started with the `node` and `npm` found
// in PATH, as the Chest's pinned image would.
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDatabase, startFakeChest, manifestOf } from "./lib/chest.mjs";
import { MiB, busiest, du, group, loadavg, machine, memoryOfAll, tree } from "./lib/system.mjs";
import { keyOf, pagesFor } from "./pages.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valued = new Set(["label", "key", "starts", "rests", "idle", "port", "build-memory", "build-cpus", "work"]);
const folder = args.find((a, i) => !a.startsWith("--") && !(i > 0 && valued.has(args[i - 1].slice(2))));
const option = (name, fallback) => (args.includes("--" + name) ? args[args.indexOf("--" + name) + 1] : fallback);
const flag = (name) => args.includes("--" + name);
const label = option("label", null);
if (!folder || !label || !existsSync(join(folder, "chest.json")) || !/^[a-z0-9][a-z0-9._-]*$/u.test(label)) {
  console.error("usage: node lab/measure/measure.mjs <tool folder> --label <label> [--key k] [--starts 10] [--rests 5] [--idle 30] [--port 4700] [--build-memory 512] [--build-cpus 1] [--no-limited-build] [--skip-image] [--keep] [--work dir]");
  process.exit(2);
}
const source = resolve(folder);
const key = option("key", keyOf(source));
const starts = Number(option("starts", "10"));
const rests = Number(option("rests", "5"));
const idle = Number(option("idle", "30"));
const port = Number(option("port", "4700"));
const buildMemory = Number(option("build-memory", "512"));
const buildCpus = Number(option("build-cpus", "1"));
const work = join(option("work", join(tmpdir(), "chest-measure")), key);
const adminUrl = process.env["DEV_DATABASE_URL"] ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const log = (...a) => console.log(`[${key}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // ms
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

// The environment of an install or a build: what a container has, the
// proxy this machine needs for npm, nothing of the shell (NODE_OPTIONS
// above all: a shell here sets --max-old-space-size=8192).
const nodeBin = dirname(execFileSync("sh", ["-c", "command -v node"], { encoding: "utf8" }).trim());
const home = join(work, "..", ".home");
const baseEnv = {
  PATH: `${nodeBin}:/usr/local/bin:/usr/bin:/bin`,
  HOME: home,
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
  NPM_CONFIG_FUND: "false",
  npm_config_cache: process.env["npm_config_cache"] ?? join(process.env["HOME"] ?? "/root", ".npm"),
  ...Object.fromEntries(["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "npm_config_https_proxy", "npm_config_noproxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"].filter((n) => process.env[n]).map((n) => [n, process.env[n]])),
};

const result = {
  tool: key,
  label,
  source: source,
  date: new Date().toISOString(),
  machine: machine(),
  node: execFileSync(join(nodeBin, "node"), ["-v"], { encoding: "utf8" }).trim(),
  npm: execFileSync(join(nodeBin, "npm"), ["-v"], { encoding: "utf8", env: baseEnv }).trim(),
  commit: (() => { try { return execFileSync("git", ["-C", source, "log", "-1", "--format=%h %cs", "--", "."], { encoding: "utf8" }).trim() + (execFileSync("git", ["-C", source, "status", "--porcelain", "--", "."], { encoding: "utf8" }).trim() ? " (with uncommitted changes)" : ""); } catch { return null; } })(),
  load: { atStart: loadavg(), busiestAtStart: busiest() },
  notes: [],
};

// ── run a command, in a cgroup, sampling its tree's memory ─────────────
function run(argv, { cwd, env, limits = {}, timeoutMs = 15 * 60e3, every = 250 }) {
  return new Promise((done) => {
    const g = group(limits);
    const started = now();
    const child = spawn(g.prefix[0] ?? argv[0], [...g.prefix.slice(1), ...(g.prefix.length ? argv : argv.slice(1))], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (chunk) => { output = (output + chunk.toString()).slice(-16384); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const peak = { rss: 0, pss: 0, processes: 0 };
    const loads = [];
    const sample = () => {
      const pids = g.kind === "v1" ? g.pids() : tree(child.pid);
      const m = memoryOfAll(pids);
      peak.rss = Math.max(peak.rss, m.rss);
      peak.pss = Math.max(peak.pss, m.pss);
      peak.processes = Math.max(peak.processes, m.processes);
    };
    const timer = setInterval(sample, every);
    const loadTimer = setInterval(() => loads.push(loadavg().one), 5000);
    const killer = setTimeout(() => { output += "\n[bench] timeout: killed"; for (const pid of g.kind === "v1" ? g.pids() : tree(child.pid)) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } } }, timeoutMs);
    child.on("exit", async (code, signal) => {
      const ms = now() - started;
      clearInterval(timer);
      clearInterval(loadTimer);
      clearTimeout(killer);
      const cg = g.stats();
      // Wait for every process of the group (a worker that outlives npm).
      for (let i = 0; i < 100 && g.pids().length; i++) await sleep(100);
      g.remove();
      done({ code, signal, ms: Math.round(ms), peakRssMiB: +(peak.rss / MiB).toFixed(1), peakPssMiB: +(peak.pss / MiB).toFixed(1), processes: peak.processes, cgroup: cg && { peakMiB: +(cg.peak / MiB).toFixed(1), failcnt: cg.failcnt, oomKills: cg.oomKills }, limits, load: loads.length ? { mean: +(loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(2), max: Math.max(...loads) } : loadavg(), tail: code === 0 ? undefined : output.slice(-4000) });
    });
  });
}

const sizeOf = (path) => { const d = du(path); return { diskMiB: +(d.disk / MiB).toFixed(1), apparentMiB: +(d.apparent / MiB).toFixed(1), files: d.files }; };

// ── 1. the image ────────────────────────────────────────────────────────
const { manifest } = manifestOf(source);
const build = manifest.build ?? {};
const scriptOf = (command) => {
  if (command === "npm start") return ["npm", "start"];
  const m = /^npm run ([a-z0-9][a-z0-9:_-]{0,63})$/u.exec(command ?? "");
  if (!m) throw new Error(`unknown command ${command}`);
  return ["npm", "run", m[1]];
};

if (!flag("skip-image")) {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(home, { recursive: true });
  // The repository as the Chest receives it: the files Git tracks or would
  // add (a folder outside Git: all of it but node_modules and builds).
  let files;
  try {
    files = execFileSync("git", ["-C", source, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { maxBuffer: 256 << 20 }).toString().split("\0").filter(Boolean).filter((f) => existsSync(join(source, f)));
  } catch { files = null; }
  if (files) for (const f of files) { mkdirSync(dirname(join(work, f)), { recursive: true }); cpSync(join(source, f), join(work, f)); }
  else cpSync(source, work, { recursive: true, filter: (p) => !/\/(node_modules|\.next|dist)(\/|$)/u.test(p) });
  // A reference whose vendored SDK is not copied (reference/perseus-starter:
  // "use npm install @argentic/chest-sdk@0.4.1"): the same tarball from npm.
  const pkg = JSON.parse(readFileSync(join(work, "package.json"), "utf8"));
  for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const tgz = /^file:(vendor\/.+\.tgz)$/u.exec(String(spec))?.[1];
    if (!tgz || existsSync(join(work, tgz))) continue;
    const version = /-(\d+\.\d+\.\d+[^/]*)\.tgz$/u.exec(tgz)?.[1];
    mkdirSync(join(work, "vendor"), { recursive: true });
    const packed = execFileSync("npm", ["pack", `${name}@${version}`, "--pack-destination", join(work, "vendor")], { cwd: work, env: baseEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").at(-1);
    if (join(work, "vendor", packed) !== join(work, tgz)) cpSync(join(work, "vendor", packed), join(work, tgz));
    result.notes.push(`${tgz} is not in the source: packed ${name}@${version} from npm into vendor/`);
  }
  result.repository = sizeOf(work);
  const before = new Set(readdirSync(work));
  log("npm ci");
  result.install = await run(["npm", "ci", "--no-audit", "--no-fund"], { cwd: work, env: baseEnv, limits: { memoryMiB: buildMemory, cpus: buildCpus }, timeoutMs: 10 * 60e3 });
  result.install.fits = result.install.code === 0 && !(result.install.cgroup?.oomKills > 0);
  if (result.install.code !== 0) {
    log(`npm ci failed under ${buildMemory} MiB, ${buildCpus} CPU (${result.install.signal ?? "exit " + result.install.code}${result.install.cgroup?.oomKills ? ", OOM" : ""}): again without limits`);
    result.notes.push(`npm ci did not finish under ${buildMemory} MiB and ${buildCpus} CPU (${result.install.signal ?? "exit " + result.install.code}${result.install.cgroup?.oomKills ? ", killed for memory" : ""}); installed again without limits`);
    result.installFree = await run(["npm", "ci", "--no-audit", "--no-fund"], { cwd: work, env: baseEnv, timeoutMs: 10 * 60e3 });
    if (result.installFree.code !== 0) throw new Error("npm ci failed:\n" + result.installFree.tail);
  }
  result.nodeModules = { installed: sizeOf(join(work, "node_modules")) };
  before.add("node_modules");
  const outputs = () => readdirSync(work).filter((e) => !before.has(e));
  const clean = () => {
    for (const e of outputs()) rmSync(join(work, e), { recursive: true, force: true });
    for (const cache of [".cache", ".vite"]) rmSync(join(work, "node_modules", cache), { recursive: true, force: true });
  };
  if (build.command) {
    const argv = scriptOf(build.command);
    result.build = {};
    if (!flag("no-limited-build")) {
      clean();
      log(`${build.command} (limited: ${buildMemory} MiB, ${buildCpus} CPU)`);
      result.build.limited = await run(argv, { cwd: work, env: baseEnv, limits: { memoryMiB: buildMemory, cpus: buildCpus } });
      result.build.limited.fits = result.build.limited.code === 0 && !(result.build.limited.cgroup?.oomKills > 0);
      log(`  → ${result.build.limited.fits ? "fits" : "does not fit"} (${result.build.limited.ms} ms, exit ${result.build.limited.code}${result.build.limited.signal ? " " + result.build.limited.signal : ""})`);
    }
    clean();
    log(`${build.command} (free: ${result.machine.cpus} CPUs, no memory limit)`);
    result.build.free = await run(argv, { cwd: work, env: baseEnv });
    if (result.build.free.code !== 0) throw new Error("the build failed:\n" + result.build.free.tail);
    log(`  → ${result.build.free.ms} ms, peak ${result.build.free.peakPssMiB} MiB PSS / ${result.build.free.peakRssMiB} MiB RSS (tree), cgroup ${result.build.free.cgroup?.peakMiB} MiB`);
    // What the build left: every top-level entry that was not there after
    // npm ci (.next, dist, …), and the part of it that is a build cache.
    const total = outputs().reduce((t, e) => { const s = du(join(work, e)); return { disk: t.disk + s.disk, apparent: t.apparent + s.apparent, files: t.files + s.files }; }, { disk: 0, apparent: 0, files: 0 });
    result.buildOutput = { entries: outputs(), diskMiB: +(total.disk / MiB).toFixed(1), apparentMiB: +(total.apparent / MiB).toFixed(1), files: total.files, cacheMiB: +(du(join(work, ".next", "cache")).disk / MiB).toFixed(1) };
  }
  // The image keeps the production dependencies only (npm prune --omit=dev).
  const prune = await run(["npm", "prune", "--omit=dev", "--no-audit", "--no-fund"], { cwd: work, env: baseEnv });
  if (prune.code !== 0) result.notes.push("npm prune --omit=dev failed: " + prune.tail);
  result.nodeModules.pruned = sizeOf(join(work, "node_modules"));
  result.image = { diskMiB: +(result.repository.diskMiB + result.nodeModules.pruned.diskMiB + (result.buildOutput?.diskMiB ?? 0)).toFixed(1) };
  log(`image: repository ${result.repository.diskMiB} + node_modules ${result.nodeModules.pruned.diskMiB} (installed ${result.nodeModules.installed.diskMiB}) + build ${result.buildOutput?.diskMiB ?? 0} = ${result.image.diskMiB} MiB`);
} else {
  const previous = join(here, "results", label, `${key}.json`);
  if (existsSync(previous)) {
    const old = JSON.parse(readFileSync(previous, "utf8"));
    for (const k of ["repository", "install", "nodeModules", "build", "buildOutput", "image"]) if (old[k]) result[k] = old[k];
    result.notes.push("image measured by an earlier run (--skip-image)");
  }
}

// ── 2 & 3. the server ───────────────────────────────────────────────────
const database = (manifest.capabilities ?? []).includes("database") ? await prepareDatabase(work, key, adminUrl) : null;
if (database) log(`database ${database.role}: ${database.migrations} migrations${database.seeded ? ", seeded" : ""}`);
const chest = await startFakeChest(work, port);
result.sdk = chest.sdkVersion;
const { pages, source: pagesSource } = pagesFor(source, key);
result.pages = { source: pagesSource, list: pages };
const main = pages.find((p) => !p.public) ?? pages[0];
const serverEnv = {
  PATH: baseEnv.PATH,
  HOME: home,
  NODE_ENV: "production",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
  NPM_CONFIG_CACHE: join(home, "npm-run-cache"),
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(port),
  ...chest.env,
  ...(database ? { DATABASE_URL: database.url } : {}),
};
const startArgv = scriptOf(build.start ?? "npm start");

function get(page) {
  return new Promise((done) => {
    const started = now();
    const headers = { Host: `127.0.0.1:${port}`, "X-Forwarded-Host": `127.0.0.1:${port}`, "X-Forwarded-Proto": "http", Accept: "text/html,application/xhtml+xml", "Accept-Language": page.language === "fr" ? "fr-FR,fr;q=0.9" : "en-GB,en;q=0.9", Connection: "close" };
    if (!page.public) headers["Chest-Member"] = chest.assertion(page.member ?? "camille", page.language);
    const req = request({ host: "127.0.0.1", port, path: page.path, method: "GET", headers, agent: false }, (res) => {
      let bytes = 0;
      res.on("data", (c) => { bytes += c.length; });
      res.on("end", () => done({ status: res.statusCode, bytes, ms: +(now() - started).toFixed(1) }));
      res.on("error", () => done({ status: 0, bytes, ms: now() - started }));
    });
    req.on("error", (e) => done({ status: 0, error: e.code ?? String(e), ms: now() - started }));
    req.setTimeout(60e3, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

function canConnect() {
  return new Promise((done) => {
    const s = connect({ host: "127.0.0.1", port });
    s.once("connect", () => { s.destroy(); done(true); });
    s.once("error", () => done(false));
  });
}

async function portFree() {
  for (let i = 0; i < 100; i++) { if (!(await canConnect())) return; await sleep(100); }
  throw new Error(`port ${port} is taken: another server answers there`);
}

// Start the server as the Chest does (build.start, its environment, its
// own cgroup), and wait for the port, then for a 200 of the main page.
async function startServer() {
  await portFree();
  const g = group({});
  const t0 = now();
  const child = spawn(g.prefix[0] ?? startArgv[0], [...g.prefix.slice(1), ...(g.prefix.length ? startArgv : startArgv.slice(1))], { cwd: work, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const keep = (c) => { output = (output + c.toString()).slice(-8192); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  let exited = null;
  child.on("exit", (code, signal) => { exited = { code, signal }; });
  const pids = () => (g.kind === "v1" ? g.pids() : tree(child.pid));
  let portMs = null;
  while (!exited && now() - t0 < 60e3) {
    if (await canConnect()) { portMs = now() - t0; break; }
    await sleep(5);
  }
  if (portMs === null) throw new Error(`the server did not open port ${port}${exited ? ` (exit ${exited.code})` : ""}:\n${output}`);
  let first = null;
  const statuses = [];
  while (!exited && now() - t0 < 90e3) {
    const answer = await get(main);
    if (answer.status) statuses.push(answer.status);
    if (answer.status === 200) { first = now() - t0; break; }
    if (answer.status >= 400) break;
    await sleep(10);
  }
  return {
    child, g, pids, output: () => output, portMs: +portMs.toFixed(1), firstMs: first === null ? null : +first.toFixed(1), statuses,
    async stop() {
      try { process.kill(child.pid, "SIGTERM"); } catch { /* gone */ }
      for (let i = 0; i < 100 && pids().length; i++) await sleep(100);
      for (const pid of pids()) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
      for (let i = 0; i < 50 && pids().length; i++) await sleep(100);
      g.remove();
    },
  };
}

try {
  result.coldStart = { main: main.path, runs: [] };
  for (let i = 0; i < starts; i++) {
    const s = await startServer();
    result.coldStart.runs.push({ portMs: s.portMs, firstMs: s.firstMs, statuses: s.statuses, load: loadavg().one });
    if (s.firstMs === null) result.notes.push(`cold start ${i + 1}: no 200 on ${main.path} (${s.statuses.join(",")}): ${s.output().slice(-1500)}`);
    await s.stop();
    log(`cold start ${i + 1}/${starts}: port ${s.portMs} ms, 200 at ${s.firstMs} ms`);
  }
  const firsts = result.coldStart.runs.map((r) => r.firstMs).filter((x) => x !== null);
  result.coldStart.port = { median: median(result.coldStart.runs.map((r) => r.portMs)), min: Math.min(...result.coldStart.runs.map((r) => r.portMs)), max: Math.max(...result.coldStart.runs.map((r) => r.portMs)) };
  result.coldStart.first200 = firsts.length ? { median: median(firsts), min: Math.min(...firsts), max: Math.max(...firsts) } : null;

  result.memory = { idleSeconds: idle, runs: [] };
  for (let i = 0; i < rests; i++) {
    const s = await startServer();
    const afterStart = memoryOfAll(s.pids());
    s.g.resetPeak();
    const peak = { rss: afterStart.rss, pss: afterStart.pss };
    const sampler = setInterval(() => { const m = memoryOfAll(s.pids()); peak.rss = Math.max(peak.rss, m.rss); peak.pss = Math.max(peak.pss, m.pss); }, 50);
    const answers = [];
    for (const page of pages) answers.push({ path: page.path, ...(await get(page)) });
    clearInterval(sampler);
    const atPeak = s.g.stats();
    const afterRequests = memoryOfAll(s.pids());
    peak.rss = Math.max(peak.rss, afterRequests.rss);
    peak.pss = Math.max(peak.pss, afterRequests.pss);
    const loads = [];
    for (let t = 0; t < idle; t += 5) { await sleep(Math.min(5, idle - t) * 1000); loads.push(loadavg().one); }
    const rest = memoryOfAll(s.pids());
    const cg = s.g.stats();
    result.memory.runs.push({
      afterStartMiB: { rss: +(afterStart.rss / MiB).toFixed(1), pss: +(afterStart.pss / MiB).toFixed(1) },
      peakMiB: { rss: +(peak.rss / MiB).toFixed(1), pss: +(peak.pss / MiB).toFixed(1), cgroup: atPeak ? +(atPeak.peak / MiB).toFixed(1) : null },
      afterRequestsMiB: { rss: +(afterRequests.rss / MiB).toFixed(1), pss: +(afterRequests.pss / MiB).toFixed(1) },
      restMiB: { rss: +(rest.rss / MiB).toFixed(1), pss: +(rest.pss / MiB).toFixed(1), pssAnon: +(rest.pssAnon / MiB).toFixed(1), pssFile: +(rest.pssFile / MiB).toFixed(1), cgroupAnon: cg ? +(cg.anon / MiB).toFixed(1) : null, cgroupCache: cg ? +(cg.cache / MiB).toFixed(1) : null },
      processes: rest.each.map((p) => ({ command: p.command, rssMiB: +(p.rss / MiB).toFixed(1), pssMiB: +(p.pss / MiB).toFixed(1) })),
      pages: answers,
      load: { mean: +(loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(2), max: Math.max(...loads) },
    });
    const bad = answers.filter((a) => a.status !== 200);
    if (bad.length && i === 0) result.notes.push(`pages not 200: ${bad.map((a) => `${a.path} → ${a.status}${a.error ? " " + a.error : ""}`).join(", ")}`);
    log(`rest ${i + 1}/${rests}: ${rest.processes} processes, RSS ${(rest.rss / MiB).toFixed(1)} MiB, PSS ${(rest.pss / MiB).toFixed(1)} MiB (peak PSS ${(peak.pss / MiB).toFixed(1)}); ${answers.length - bad.length}/${answers.length} pages 200`);
    await s.stop();
  }
  const stat = (pick) => { const xs = result.memory.runs.map(pick); return { median: median(xs), min: Math.min(...xs), max: Math.max(...xs) }; };
  result.memory.rest = { rss: stat((r) => r.restMiB.rss), pss: stat((r) => r.restMiB.pss) };
  result.memory.peak = { rss: stat((r) => r.peakMiB.rss), pss: stat((r) => r.peakMiB.pss) };
  // The same tree without npm itself (the server alone, as a tool started
  // with "node …" directly would weigh).
  // PSS splits the pages npm and the server share (the node binary): with
  // npm gone the server's own PSS would grow by part of it, so the server
  // alone is given by its RSS too (an upper bound).
  const serverOnly = (r) => r.processes.filter((p) => !/(^|\/)npm(-cli\.js)?( |$)/u.test(p.command));
  result.memory.restWithoutNpm = { rss: stat((r) => +serverOnly(r).reduce((t, p) => t + p.rssMiB, 0).toFixed(1)), pss: stat((r) => +serverOnly(r).reduce((t, p) => t + p.pssMiB, 0).toFixed(1)) };
} finally {
  await chest.close();
  if (database) await database.drop();
  result.load.atEnd = loadavg();
  result.load.busiestAtEnd = busiest();
  mkdirSync(join(here, "results", label), { recursive: true });
  writeFileSync(join(here, "results", label, `${key}.json`), JSON.stringify(result, null, 1) + "\n");
  log(`→ lab/measure/results/${label}/${key}.json`);
  if (!flag("keep")) rmSync(work, { recursive: true, force: true });
}
