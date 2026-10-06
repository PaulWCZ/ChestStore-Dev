// The memory of a starter in Perseus's workbench (1 GiB on Starter): its
// dev server running (npm run dev, after its first build, idle) and its
// tests (npm test) run beside it. The whole process tree sampled every
// 50 ms: peak of the summed RSS and PSS, and the dev server at rest.
//
//   node lab/starter-bench/workbench.mjs <name>=<built tool dir> …
//
// The tool dir must have node_modules. Set TEST_DATABASE_URL to measure
// npm test against a PostgreSQL server instead of PGlite.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { memory } from "./chest.mjs";

const mib = kib => Math.round(kib / 102.4) / 10;

function sample(child) {
  let rss = 0, pss = 0;
  const timer = setInterval(() => {
    try {
      const tree = memory(child.pid);
      rss = Math.max(rss, tree.reduce((s, p) => s + p.rss, 0));
      pss = Math.max(pss, tree.reduce((s, p) => s + p.pss, 0));
    } catch { /* ended meanwhile */ }
  }, 50);
  return { stop: () => { clearInterval(timer); return { rss: mib(rss), pss: mib(pss) }; } };
}

// npm test runs as in the Perseus workbench: NODE_ENV=development.
async function run(command, cwd, env = { NODE_ENV: "development" }) {
  const started = performance.now();
  const child = spawn(command[0], command.slice(1), { cwd, stdio: "ignore", env: { ...process.env, ...env } });
  const s = sample(child);
  const code = await new Promise(r => child.on("exit", r));
  return { code, seconds: Math.round((performance.now() - started) / 100) / 10, ...s.stop() };
}

for (const arg of process.argv.slice(2)) {
  const [name, dir] = arg.split("=");
  const cwd = resolve(dir);
  const test = await run(["npm", "test"], cwd);
  // The dev server: first build, then 20 s idle; its tree at rest.
  const dev = spawn("npm", ["run", "dev"], { cwd, stdio: "ignore", env: { ...process.env, NODE_ENV: "development", PORT: "39123" }, detached: true });
  const devPeak = sample(dev);
  await new Promise(r => setTimeout(r, 25_000));
  const rest = memory(dev.pid);
  const devResult = { peak: devPeak.stop(), rest: { rss: mib(rest.reduce((s, p) => s + p.rss, 0)), pss: mib(rest.reduce((s, p) => s + p.pss, 0)) } };
  // Tests again, beside the running dev server: the workbench's worst case.
  const together = sample(dev);
  const both = await run(["npm", "test"], cwd);
  const togetherPeak = together.stop();
  process.kill(-dev.pid, "SIGTERM");
  console.log(JSON.stringify({ name, test, dev: devResult, testBesideDev: { test: both, peak: togetherPeak } }));
}
