// Cold start and memory at rest, candidates interleaved round by round
// (A, B, C, A, B, C…) so the machine's load falls on all of them alike.
//
//   node lab/starter-bench/interleaved.mjs <name>=<built tool dir> … [--rounds 15] [--rests 5] [--idle 30]
//
// Each start runs the tool's start script without npm (`node <flags>
// <file>`, as parsed from package.json) and through `npm start`; cold
// start is spawn → first 200 on /chest as a member (and on / when the
// tool serves it). At rest: /chest loaded 5 times, idle, then the server
// process's RSS, USS and PSS.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { memory, runTool } from "./chest.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : Number(args.splice(i, 2)[1]); };
const rounds = option("rounds", 15), rests = option("rests", 5), idle = option("idle", 30);
const candidates = args.map(a => { const [name, dir] = a.split("="); const d = resolve(dir); const start = JSON.parse(readFileSync(resolve(d, "package.json"), "utf8")).scripts.start.split(" "); return { name, dir: d, node: start }; });
const median = l => { const s = [...l].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const mib = kib => Math.round(kib / 102.4) / 10;
const results = Object.fromEntries(candidates.map(c => [c.name, { node: [], npm: [], rest: [] }]));

for (let r = 0; r < rounds; r++) {
  for (const c of candidates) {
    const direct = await runTool(c.dir, { command: c.node });
    results[c.name].node.push(direct.ready);
    await direct.stop();
    const npm = await runTool(c.dir);
    results[c.name].npm.push(npm.ready);
    await npm.stop();
  }
}
for (let r = 0; r < rests; r++) {
  for (const c of candidates) {
    const tool = await runTool(c.dir);
    for (let i = 0; i < 5; i++) await (await fetch(`${tool.origin}/chest`)).arrayBuffer();
    await new Promise(done => setTimeout(done, idle * 1000));
    const server = memory(tool.pid).filter(p => !p.command.startsWith("npm") && !p.command.startsWith("sh ")).sort((a, b) => b.rss - a.rss)[0];
    results[c.name].rest.push(server);
    await tool.stop();
  }
}
const summary = candidates.map(({ name }) => {
  const { node, npm, rest } = results[name];
  return {
    name,
    cold_ms_node: { median: Math.round(median(node)), min: Math.round(Math.min(...node)), max: Math.round(Math.max(...node)) },
    cold_ms_npm: { median: Math.round(median(npm)), min: Math.round(Math.min(...npm)), max: Math.round(Math.max(...npm)) },
    rest_mib: { rss: mib(median(rest.map(p => p.rss))), uss: mib(median(rest.map(p => p.uss))), pss: mib(median(rest.map(p => p.pss))), runs: rest.map(p => mib(p.rss)) },
  };
});
console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, rounds, rests, idle, summary }, null, 2));
