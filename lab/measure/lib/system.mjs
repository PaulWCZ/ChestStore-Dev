// What the bench reads from Linux: the machine, the load, a process tree's
// memory (/proc/<pid>/smaps_rollup), disk usage, and cgroups (v1) to hold a
// build or a server apart, limit it like the Chest's container and read its
// peak.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem, hostname } from "node:os";
import { join } from "node:path";

export const MiB = 1024 * 1024;

export function machine() {
  const read = (file) => { try { return readFileSync(file, "utf8"); } catch { return ""; } };
  const memTotal = Number(/MemTotal:\s+(\d+)/u.exec(read("/proc/meminfo"))?.[1] ?? 0) * 1024 || totalmem();
  return {
    host: hostname(),
    cpu: cpus()[0]?.model ?? "unknown",
    cpus: cpus().length,
    memTotalMiB: Math.round(memTotal / MiB),
    kernel: read("/proc/sys/kernel/osrelease").trim(),
    cgroups: cgroupMode(),
  };
}

export function loadavg() {
  const [one, five, fifteen] = readFileSync("/proc/loadavg", "utf8").split(" ").map(Number);
  return { one, five, fifteen };
}

// The busiest processes of the machine at a moment: other agents' builds
// show here, so a noisy number can be explained afterwards.
export function busiest(n = 5) {
  try {
    return execFileSync("ps", ["-eo", "pcpu,rss,comm", "--sort=-pcpu"], { encoding: "utf8" }).trim().split("\n").slice(1, n + 1).map((line) => {
      const [pcpu, rss, ...comm] = line.trim().split(/\s+/u);
      return { cpu: Number(pcpu), rssMiB: Math.round(Number(rss) / 1024), command: comm.join(" ") };
    });
  } catch { return []; }
}

// du of a path: disk usage (blocks, what `du -sk` says) and apparent size
// (the bytes of the files), in bytes. A missing path is 0.
export function du(path) {
  if (!existsSync(path)) return { disk: 0, apparent: 0, files: 0 };
  const disk = Number(execFileSync("du", ["-sk", path], { encoding: "utf8" }).split("\t")[0]) * 1024;
  const apparent = Number(execFileSync("du", ["-sb", path], { encoding: "utf8" }).split("\t")[0]);
  const files = Number(execFileSync("sh", ["-c", 'find "$1" -type f | wc -l', "sh", path], { encoding: "utf8" }).trim());
  return { disk, apparent, files };
}

// ── processes ───────────────────────────────────────────────────────────
function ppidOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  } catch { return null; }
}

// Every live descendant of root, root included.
export function tree(root) {
  const children = new Map();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/u.test(entry)) continue;
    const parent = ppidOf(Number(entry));
    if (parent === null) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(Number(entry));
  }
  const out = [];
  const walk = (pid) => {
    if (!existsSync(`/proc/${pid}`)) return;
    out.push(pid);
    for (const child of children.get(pid) ?? []) walk(child);
  };
  walk(root);
  return out;
}

const commandOf = (pid) => {
  try { return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ").slice(0, 160); } catch { return "?"; }
};

// The memory of one process (kB from smaps_rollup → bytes): resident,
// proportional (shared pages divided among the processes sharing them),
// and the proportional anonymous and file-backed parts.
export function memoryOf(pid) {
  let text;
  try { text = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"); } catch { return null; }
  const field = (name) => Number(new RegExp(`^${name}:\\s+(\\d+) kB`, "mu").exec(text)?.[1] ?? 0) * 1024;
  return { pid, command: commandOf(pid), rss: field("Rss"), pss: field("Pss"), pssAnon: field("Pss_Anon"), pssFile: field("Pss_File"), privateDirty: field("Private_Dirty"), swap: field("Swap") };
}

// The memory of a set of processes, summed, with each one.
export function memoryOfAll(pids) {
  const each = pids.map(memoryOf).filter(Boolean);
  const sum = (key) => each.reduce((total, p) => total + p[key], 0);
  return { processes: each.length, rss: sum("rss"), pss: sum("pss"), pssAnon: sum("pssAnon"), pssFile: sum("pssFile"), each };
}

// ── cgroups (v1: memory and cpu controllers) ───────────────────────────
// The bench creates its groups under the memory and cpu groups this process
// is in. Without writable cgroups it falls back to taskset (one CPU) and
// sampling (no memory limit): the result says which.
function ownGroup(controller) {
  const line = readFileSync("/proc/self/cgroup", "utf8").split("\n").find((l) => l.split(":")[1]?.split(",").includes(controller));
  if (!line) return null;
  const dir = join("/sys/fs/cgroup", controller, line.split(":")[2]);
  return existsSync(join(dir, "cgroup.procs")) ? dir : null;
}

let mode;
export function cgroupMode() {
  if (mode !== undefined) return mode;
  mode = "none";
  try {
    const memory = ownGroup("memory");
    const cpu = ownGroup("cpu");
    if (memory && cpu) {
      const probe = join(memory, `chest-measure-probe-${process.pid}`);
      mkdirSync(probe);
      rmdirSync(probe);
      const probeCpu = join(cpu, `chest-measure-probe-${process.pid}`);
      mkdirSync(probeCpu);
      rmdirSync(probeCpu);
      mode = "v1";
    }
  } catch { mode = "none"; }
  return mode;
}

let serial = 0;
// A new group: memory limited to memoryMiB (none when null), CPU to cpus
// (none when null). join is the shell prefix that puts a command in it.
export function group({ memoryMiB = null, cpus: cpuCount = null } = {}) {
  if (cgroupMode() !== "v1") {
    return {
      kind: "none",
      prefix: cpuCount ? ["taskset", "-c", Array.from({ length: cpuCount }, (_, i) => i).join(",")] : [],
      pids: () => [],
      stats: () => null,
      resetPeak() {},
      remove() {},
    };
  }
  const name = `chest-measure-${process.pid}-${++serial}`;
  const memory = join(ownGroup("memory"), name);
  const cpu = join(ownGroup("cpu"), name);
  mkdirSync(memory);
  mkdirSync(cpu);
  if (memoryMiB) {
    writeFileSync(join(memory, "memory.limit_in_bytes"), String(memoryMiB * MiB));
    try { writeFileSync(join(memory, "memory.memsw.limit_in_bytes"), String(memoryMiB * MiB)); } catch { /* no swap accounting */ }
  }
  if (cpuCount) {
    writeFileSync(join(cpu, "cpu.cfs_period_us"), "100000");
    writeFileSync(join(cpu, "cpu.cfs_quota_us"), String(100000 * cpuCount));
  }
  const read = (file) => { try { return readFileSync(join(memory, file), "utf8"); } catch { return ""; } };
  return {
    kind: "v1",
    memory,
    cpu,
    // sh writes its own pid in both groups, then becomes the command.
    prefix: ["sh", "-c", `echo $$ > '${memory}/cgroup.procs' && echo $$ > '${cpu}/cgroup.procs' && exec "$@"`, "sh"],
    pids: () => read("cgroup.procs").split("\n").filter(Boolean).map(Number),
    stats() {
      const stat = Object.fromEntries(read("memory.stat").trim().split("\n").map((l) => l.split(" ")).map(([k, v]) => [k, Number(v)]));
      return {
        usage: Number(read("memory.usage_in_bytes")),
        peak: Number(read("memory.max_usage_in_bytes")),
        failcnt: Number(read("memory.failcnt")),
        oomKills: Number(/oom_kill (\d+)/u.exec(read("memory.oom_control"))?.[1] ?? 0),
        anon: stat.rss ?? 0,
        cache: stat.cache ?? 0,
      };
    },
    resetPeak() { try { writeFileSync(join(memory, "memory.max_usage_in_bytes"), "0"); } catch { /* not resettable */ } },
    remove() {
      for (const dir of [memory, cpu]) {
        for (let i = 0; i < 50; i++) {
          try { rmdirSync(dir); break; } catch { execFileSync("sleep", ["0.1"]); }
        }
      }
    },
  };
}
