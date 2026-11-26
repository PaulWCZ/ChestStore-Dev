// The tool's process, as the Chest runs it: started with its command and
// environment, its stdout and stderr kept as its log (a file per harness run,
// a line cut at 4 KiB, the Chest's own lines beside them), restarted after a
// crash (1 s, 2 s, 4 s… 5 min at most, as the Chest's supervision), and —
// with sleepAfter — put to sleep when no request or delivery reached it for
// that long, woken by the next one.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { connect } from "node:net";
import { dirname } from "node:path";

const maxLine = 4096;

export function createTool({ cwd, argv, env, port, logFile, sleepAfter = 0, echo = true, onStop = () => {} }) {
  mkdirSync(dirname(logFile), { recursive: true });
  const file = createWriteStream(logFile, { flags: "a" });
  const recent = [];
  const write = (stream, text) => {
    const line = text.length > maxLine ? text.slice(0, maxLine) + " …[cut at 4 KiB]" : text;
    const entry = { at: new Date().toISOString(), stream, line };
    recent.push(entry);
    if (recent.length > 2000) recent.shift();
    file.write(`${entry.at} ${stream.padEnd(5)} ${line}\n`);
    if (echo) (stream === "err" ? process.stderr : process.stdout).write(stream === "chest" ? `· ${line}\n` : `${line}\n`);
  };
  const lines = (stream) => {
    let rest = "";
    return (chunk) => {
      const parts = (rest + chunk.toString()).split("\n");
      rest = parts.pop() ?? "";
      for (const part of parts) write(stream, part.replace(/\r$/u, ""));
    };
  };

  let child = null;
  let state = "asleep"; // asleep | starting | awake | stopping
  let waking = null;
  let lastUse = Date.now();
  let inFlight = 0;
  let restartDelay = 1000;
  let restartTimer = null;
  let upSince = 0;
  let generation = 0;

  const canConnect = () => new Promise((done) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => done(false));
  });

  // Start one generation; resolves when its port accepts a connection.
  function start(reason) {
    if (waking) return waking;
    clearTimeout(restartTimer);
    state = "starting";
    const mine = ++generation;
    write("chest", reason);
    const startedAt = Date.now();
    // Its own process group, so that stopping it stops everything it
    // started (a dev server's watcher, a worker), as a container's end does.
    child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    child.stdout.on("data", lines("out"));
    child.stderr.on("data", lines("err"));
    const me = child;
    me.on("exit", (code, exitSignal) => {
      if (mine !== generation) return;
      const wanted = state === "stopping";
      child = null;
      waking = null;
      if (wanted) { state = "asleep"; onStop(); return; }
      state = "asleep";
      // What it left behind goes with it, as with a container.
      signal(me.pid, "SIGKILL");
      if (Date.now() - upSince > 10 * 60e3) restartDelay = 1000;
      write("chest", `Stopped: the tool exited (${exitSignal ?? "code " + code}); started again in ${restartDelay / 1000} s`);
      restartTimer = setTimeout(() => { start("Started again after a stop").catch(() => {}); }, restartDelay);
      restartDelay = Math.min(restartDelay * 2, 5 * 60e3);
    });
    waking = (async () => {
      while (Date.now() - startedAt < 120e3) {
        if (mine !== generation || !child) throw new Error("the tool stopped while starting");
        if (await canConnect()) {
          state = "awake";
          upSince = Date.now();
          lastUse = Date.now();
          write("chest", `In service: port ${port} answers after ${Date.now() - startedAt} ms`);
          return;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error("the tool did not open its port within 120 s");
    })();
    waking.catch(() => {});
    return waking;
  }

  // Whether any process of a group is alive.
  const alive = (pgid) => { try { process.kill(-pgid, 0); return true; } catch { return false; } };
  const signal = (pgid, name) => { try { process.kill(-pgid, name); } catch { /* gone */ } };

  // Stop the generation: SIGTERM to its whole process group, what it
  // serves finished first — 30 s at most, then SIGKILL —, and wait until
  // none of its processes is left (the port free for the next one).
  async function stop(reason) {
    clearTimeout(restartTimer);
    if (!child) { state = "asleep"; return; }
    state = "stopping";
    waking = null;
    write("chest", reason);
    const pgid = child.pid;
    const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((done) => child.once("exit", done));
    signal(pgid, "SIGTERM");
    const deadline = Date.now() + 30e3;
    while (alive(pgid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (alive(pgid)) { write("chest", "Stopped: still running 30 s after SIGTERM, killed"); signal(pgid, "SIGKILL"); }
    await exited;
    while (alive(pgid)) await new Promise((r) => setTimeout(r, 50));
  }
  // The harness dying never leaves the tool behind.
  process.on("exit", () => { if (child) signal(child.pid, "SIGKILL"); });

  // The tool, awake: wakes it when asleep (the wakes of the same moment
  // wait for the same start).
  async function wake(why = "a request") {
    lastUse = Date.now();
    if (state === "awake") return;
    if (state === "stopping") await new Promise((r) => { const t = setInterval(() => { if (state !== "stopping") { clearInterval(t); r(); } }, 20); });
    if (state === "awake") return;
    await (waking ?? start(`Waking up: ${why}`));
  }

  // Use: a request or a delivery in flight keeps the tool awake.
  function begin() { inFlight++; lastUse = Date.now(); }
  function end() { inFlight = Math.max(0, inFlight - 1); lastUse = Date.now(); }

  const sleeper = sleepAfter > 0 ? setInterval(() => {
    if (state === "awake" && inFlight === 0 && Date.now() - lastUse >= sleepAfter * 1000) {
      stop(`Asleep: no visit for ${sleepAfter} s`).catch(() => {});
    }
  }, 500) : null;

  return {
    start,
    stop,
    wake,
    begin,
    end,
    log: (line) => write("chest", line),
    recent: () => recent.slice(),
    get state() { return state; },
    get pid() { return child?.pid ?? null; },
    logFile,
    async close(reason = "Stopped: the harness stops") {
      if (sleeper) clearInterval(sleeper);
      await stop(reason);
      await new Promise((r) => file.end(r));
    },
  };
}
