// Markdown tables of the bench's results: one section per label (image and
// build, then the server), and a comparison when two labels are given.
//
//   node lab/measure/table.mjs <label> [<label2>] [--out file.md]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const labels = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (!labels.length) { console.error("usage: node lab/measure/table.mjs <label> [<label2>] [--out file.md]"); process.exit(2); }

const load = (label) => {
  const dir = join(here, "results", label);
  if (!existsSync(dir)) throw new Error(`no results for ${label}`);
  // References last, the tools in name order.
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .sort((a, b) => (a.tool.startsWith("ref-") - b.tool.startsWith("ref-")) || a.tool.localeCompare(b.tool));
};
const n = (x, digits = 0) => (x === null || x === undefined || Number.isNaN(x) ? "–" : Number(x).toFixed(digits));
const range = (s, digits = 0) => (s ? `${n(s.median, digits)} (${n(s.min, digits)}–${n(s.max, digits)})` : "–");
const s = (ms) => (ms === undefined || ms === null ? "–" : (ms / 1000).toFixed(1));

const lines = [];
for (const label of labels) {
  const rows = load(label);
  if (!rows.length) continue;
  const first = rows[0];
  const dates = rows.map((r) => r.date).sort();
  const loads = rows.flatMap((r) => (r.memory?.runs ?? []).map((m) => m.load.mean));
  lines.push(`## ${label}`, "");
  lines.push(`Machine: ${first.machine.cpu}, ${first.machine.cpus} CPUs, ${first.machine.memTotalMiB} MiB, Linux ${first.machine.kernel}, cgroups ${first.machine.cgroups}; Node ${first.node}, npm ${first.npm}. Measured ${dates[0].slice(0, 16)}Z → ${dates.at(-1).slice(0, 16)}Z, one tool at a time; load average (1 min) during the rests: ${loads.length ? `${Math.min(...loads).toFixed(2)}–${Math.max(...loads).toFixed(2)}` : "–"}.`, "");
  lines.push("### Image and build", "");
  lines.push("Sizes in MiB (disk usage, `du -sk`). *node_modules*: after `npm ci` → after `npm prune --omit=dev` (what the image keeps). *Build*: what `build.command` left (of which a build cache). *npm ci*: run in a cgroup limited to 512 MiB and one CPU (with the npm cache of this machine warm): its time and cgroup peak, or **no** when the kernel killed it (then installed again without limit). Build peak: the process tree's PSS, sampled every 250 ms, on 4 CPUs without limit. *512 MiB, 1 CPU*: the same build in a cgroup limited to 512 MiB and one CPU — whether it finished, in how long, and its cgroup peak.", "");
  lines.push("| Tool | Repository | node_modules | Build output | Image | npm ci (512 MiB, 1 CPU) | Build (4 CPUs) | Build peak PSS / RSS | 512 MiB, 1 CPU |");
  lines.push("|---|--:|--:|--:|--:|--:|--:|--:|---|");
  for (const r of rows) {
    const nm = r.nodeModules ? `${n(r.nodeModules.installed?.diskMiB)} → ${n(r.nodeModules.pruned?.diskMiB)}` : "–";
    const out = r.buildOutput ? `${n(r.buildOutput.diskMiB)}${r.buildOutput.cacheMiB ? ` (cache ${n(r.buildOutput.cacheMiB)})` : ""}` : "–";
    const free = r.build?.free;
    const lim = r.build?.limited;
    const limited = lim ? `${lim.fits ? "fits" : `**no** (${lim.signal ?? "exit " + lim.code}${lim.cgroup?.oomKills ? ", OOM" : ""})`}, ${s(lim.ms)} s, peak ${n(lim.cgroup?.peakMiB)}` : "–";
    lines.push(`| ${r.tool} | ${n(r.repository?.diskMiB, 1)} | ${nm} | ${out} | ${n(r.image?.diskMiB)} | ${r.install ? (r.install.fits === false || r.install.code !== 0 ? `**no** (${r.install.cgroup?.oomKills ? "OOM" : r.install.signal ?? "exit " + r.install.code} at ${n(r.install.limits?.memoryMiB)} MiB); ${s(r.installFree?.ms)} s free` : `${s(r.install.ms)} s, peak ${n(r.install.cgroup?.peakMiB)}`) : "–"} | ${s(free?.ms)} s | ${n(free?.peakPssMiB)} / ${n(free?.peakRssMiB)} | ${limited} |`);
  }
  lines.push("", "### The server", "");
  lines.push("Started as the Chest starts it (`build.start`, i.e. `npm start`, with the Chest's environment), the database migrated and seeded. *Cold start*: ms from spawn until the port accepts a connection, and until the first 200 of the main members' page (signed member) — median (min–max) of the cold starts. *At rest*: after one request to each page of the frozen list, then the idle time; RSS and PSS summed over the server's whole process tree (npm included) — median (min–max) of the rests. *Peak*: the tree's PSS during the requests (sampled every 50 ms). *Server alone*: the same without the `npm` process (PSS, and RSS as an upper bound).", "");
  lines.push("| Tool | SDK | Pages (200) | Port open (ms) | First 200 (ms) | RSS at rest (MiB) | PSS at rest (MiB) | Peak PSS (MiB) | Server alone PSS / RSS | Processes |");
  lines.push("|---|---|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const r of rows) {
    const runs = r.memory?.runs ?? [];
    const ok = runs[0] ? `${runs[0].pages.filter((p) => p.status === 200).length}/${runs[0].pages.length}` : "–";
    lines.push(`| ${r.tool} | ${r.sdk ?? "–"} | ${ok} | ${range(r.coldStart?.port)} | ${range(r.coldStart?.first200)} | ${range(r.memory?.rest?.rss, 1)} | ${range(r.memory?.rest?.pss, 1)} | ${n(r.memory?.peak?.pss?.median, 1)} | ${n(r.memory?.restWithoutNpm?.pss?.median, 1)} / ${n(r.memory?.restWithoutNpm?.rss?.median, 1)} | ${runs[0]?.processes.length ?? "–"} |`);
  }
  const notes = rows.filter((r) => r.notes?.length);
  if (notes.length) {
    lines.push("", "Notes:", "");
    for (const r of notes) for (const note of r.notes) lines.push(`- ${r.tool}: ${note.split("\n")[0].slice(0, 300)}`);
  }
  lines.push("");
}

if (labels.length === 2) {
  const [a, b] = labels.map(load);
  const byTool = new Map(b.map((r) => [r.tool, r]));
  lines.push(`## ${labels[0]} → ${labels[1]}`, "");
  lines.push("Medians. PSS at rest and peak in MiB, first 200 in ms, image in MiB.", "");
  lines.push("| Tool | PSS at rest | Peak PSS | First 200 | Image | Build fits 512 MiB |");
  lines.push("|---|--:|--:|--:|--:|---|");
  const arrow = (x, y, d = 0) => `${n(x, d)} → ${n(y, d)}${x && y ? ` (${y < x ? "−" : "+"}${Math.abs(Math.round((1 - y / x) * 100))} %)` : ""}`;
  for (const r of a) {
    const o = byTool.get(r.tool);
    if (!o) continue;
    lines.push(`| ${r.tool} | ${arrow(r.memory?.rest?.pss?.median, o.memory?.rest?.pss?.median, 1)} | ${arrow(r.memory?.peak?.pss?.median, o.memory?.peak?.pss?.median, 1)} | ${arrow(r.coldStart?.first200?.median, o.coldStart?.first200?.median)} | ${arrow(r.image?.diskMiB, o.image?.diskMiB)} | ${r.build?.limited?.fits ? "yes" : "no"} → ${o.build?.limited?.fits ? "yes" : "no"} |`);
  }
  lines.push("");
}

const text = lines.join("\n");
if (out) writeFileSync(out, text + "\n");
else console.log(text);
