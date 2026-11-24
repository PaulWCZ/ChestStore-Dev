// A local Chest for one built tool, as the Chest runs it: its own fakeChest
// (the tool's own @argentic/chest-sdk/testing, so any SDK version works),
// a PostgreSQL database in the Chest's shape when the tool has migrations,
// the tool started with `npm start` (as build.start says) on its PORT, and
// a front on another port that routes like the Chest's team host and adds
// a fresh Chest-Member assertion to every /chest request.
//
//   import { runTool } from "./chest.mjs";
//   const tool = await runTool("/path/to/tool", { front: 4100 });
//   // http://127.0.0.1:4100/chest as Camille; tool.pid; await tool.stop();
//
// Needs the local PostgreSQL (postgres:postgres@127.0.0.1:5432).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const camille = { id: "mbr_camillemartincamillemartin", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" };

// reference/sdk/contract/README.md, "Content-Security-Policy".
const publicPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const psql = (args, input) => execFileSync("psql", ["-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", ...args], { env: { ...process.env, PGPASSWORD: "postgres" }, input, stdio: ["pipe", "pipe", "pipe"] });

// A fresh database t_<name> owned by its own role, the migrations played.
function database(dir, name) {
  const role = `t_${name.replace(/[^a-z0-9]/gu, "_")}`;
  psql(["-c", `drop database if exists ${role} with (force)`]);
  psql(["-c", `drop role if exists ${role}`]);
  psql(["-c", `create role ${role} login password 'bench'`]);
  psql(["-c", `create database ${role} owner ${role}`]);
  for (const file of readdirSync(join(dir, "migrations")).filter(f => f.endsWith(".sql")).sort()) {
    execFileSync("psql", ["-h", "127.0.0.1", "-U", role, "-d", role, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(dir, "migrations", file)], { env: { ...process.env, PGPASSWORD: "bench" } });
  }
  return `postgres://${role}:bench@127.0.0.1:5432/${role}?sslmode=disable`;
}

const free = () => new Promise(resolve => { const s = createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

export async function runTool(dir, { front = 0, member = camille, command = ["npm", "start"], quiet = true } = {}) {
  const testing = await import(pathToFileURL(join(dir, "node_modules/@argentic/chest-sdk/dist/src/testing.js")).href);
  const manifest = JSON.parse(readFileSync(join(dir, "chest.json"), "utf8"));
  process.env.CHEST_TOOL = manifest.name;
  // realtime: the tool's channels and feeds, as the Chest reads chest.json
  // (a test commits a feed's row with tool.chest.realtime.commit).
  const live = (manifest.capabilities ?? []).includes("realtime");
  const chest = await testing.fakeChest({ members: [member], capabilities: ["members", "files", "notifications", "ai", ...(live ? ["realtime"] : [])], ...(live ? { realtime: manifest.realtime ?? {} } : {}) });
  const env = { ...process.env, NODE_ENV: "production" };
  if (existsSync(join(dir, "migrations"))) env.DATABASE_URL = database(dir, manifest.name);
  const port = await free();
  const started = performance.now();
  const child = spawn(command[0], command.slice(1), { cwd: dir, env: { ...env, PORT: String(port) }, stdio: ["ignore", quiet ? "ignore" : "inherit", quiet ? "ignore" : "inherit"] });
  const assertion = () => testing.signAssertion(member);
  // The front: /chest… with the member, everything else as it is.
  // fail(status, { method, type, times }): the next request of that method
  // (GET by default; not a file) answers that status, as the Chest's front
  // would (403 "Access removed", 502, 503 "Waking up…") — for browser tests;
  // `times` of them (an action's refresh and the realtime's re-read of the
  // same change race: both must fail for the error to stay on screen).
  let failNext = null;
  // seen: every request the front relayed ("GET /chest/notes.csv"), for
  // tests that count them.
  const seen = [];
  const proxy = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (failNext && failNext.method === req.method && !req.url.startsWith("/assets/")) {
      const { status, type } = failNext;
      failNext = failNext.times > 1 ? { ...failNext, times: failNext.times - 1 } : null;
      res.writeHead(status, { "content-type": type });
      return res.end(type.startsWith("text/html") ? `<!doctype html><title>${status}</title><body><h1>The Chest's page ${status}</h1></body>` : `${status}`);
    }
    // The page's realtime probe goes to the Chest (the fake), as the member.
    if (live && req.url.split("?")[0] === "/_chest/realtime") {
      const target = new URL(chest.realtime.url(member.id).replace(/^ws/u, "http"));
      const out = httpRequest({ host: target.hostname, port: target.port, method: req.method, path: target.pathname + target.search }, answer => {
        res.writeHead(answer.statusCode, answer.headers);
        answer.pipe(res);
      });
      out.on("error", () => { res.writeHead(502); res.end(); });
      return void req.pipe(out);
    }
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !k.startsWith("chest-")));
    if (req.url.split("/")[1]?.split("?")[0].toLowerCase() === "chest") headers["chest-member"] = assertion();
    headers["x-forwarded-proto"] = "https";
    const members = headers["chest-member"] !== undefined;
    const out = httpRequest({ host: "127.0.0.1", port, method: req.method, path: req.url, headers }, answer => {
      // The public host adds the Chest's default policy to every answer
      // (two policies: both apply); the team host only frame-ancestors
      // to an answer without one.
      const own = answer.headers["content-security-policy"];
      if (!members) answer.headers["content-security-policy"] = [...(own ? [own] : []), publicPolicy];
      else if (!own) answer.headers["content-security-policy"] = "frame-ancestors 'none'";
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    out.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(out);
  });
  // The page's realtime socket: relayed to the Chest (the fake) as the
  // member — the Chest's team host holds it, never the tool.
  proxy.on("upgrade", (req, socket, head) => {
    if (!live || req.url.split("?")[0] !== "/_chest/realtime") return void socket.end("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
    seen.push(`UPGRADE ${req.url}`);
    const target = new URL(chest.realtime.url(member.id).replace(/^ws/u, "http"));
    const out = httpRequest({ host: target.hostname, port: target.port, method: "GET", path: target.pathname + target.search, headers: req.headers });
    out.on("upgrade", (answer, upstream, upstreamHead) => {
      socket.write(`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}\r\n${Object.entries(answer.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length > 0) socket.write(upstreamHead);
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket).pipe(upstream);
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
    });
    out.on("response", answer => { socket.end(`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}\r\nContent-Length: 0\r\n\r\n`); });
    out.on("error", () => socket.destroy());
    out.end();
  });
  await new Promise(resolve => proxy.listen(front, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  // Ready: the first 200 on /chest as the member.
  let ready = null;
  for (let i = 0; i < 600 && ready === null; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/chest`, { headers: { "chest-member": assertion() } });
      await r.arrayBuffer();
      if (r.status === 200) ready = performance.now() - started;
    } catch { /* not listening yet */ }
    if (ready === null) await new Promise(r => setTimeout(r, 10));
  }
  if (ready === null) throw new Error(`${dir}: no 200 on /chest after 6 s`);
  return {
    // sql(text): a statement on the tool's database, as another person's
    // write would land (tests of a page left open).
    sql: text => execFileSync("psql", ["-h", "127.0.0.1", "-U", `t_${manifest.name.replace(/[^a-z0-9]/gu, "_")}`, "-d", `t_${manifest.name.replace(/[^a-z0-9]/gu, "_")}`, "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-c", text], { env: { ...process.env, PGPASSWORD: "bench" } }).toString(),
    seen,
    // The fake Chest: chest.realtime.commit("notes", "insert", { id }) tells
    // the open pages a row was written (the database is the bench's own).
    chest,
    origin,
    port,
    pid: child.pid,
    ready,
    assertion,
    fail(status, { method = "GET", type = "text/html; charset=utf-8", times = 1 } = {}) { failNext = { status, method, type, times }; },
    async stop() {
      // npm does not pass SIGTERM on to its script: stop the whole tree.
      const all = tree(child.pid);
      for (const p of all.reverse()) try { process.kill(p, "SIGTERM"); } catch { /* gone */ }
      await new Promise(r => (child.exitCode !== null ? r() : child.once("exit", r)));
      for (let i = 0; i < 100 && all.some(p => { try { process.kill(p, 0); return true; } catch { return false; } }); i++) await new Promise(r => setTimeout(r, 20));
      await new Promise(r => proxy.close(r));
      await chest.close();
    },
  };
}

// The tool's process tree (npm, sh, node…): pid and its descendants.
export function tree(pid) {
  const parents = new Map();
  for (const p of readdirSync("/proc").filter(d => /^\d+$/u.test(d))) {
    try { parents.set(Number(p), Number(readFileSync(`/proc/${p}/stat`, "utf8").split(") ")[1].split(" ")[1])); } catch { /* gone */ }
  }
  const all = [pid];
  for (let i = 0; i < all.length; i++) for (const [child, parent] of parents) if (parent === all[i]) all.push(child);
  return all;
}

// Resident, proportional and private (USS) memory, in KiB, of each process
// of the tree.
export function memory(pid) {
  return tree(pid).flatMap(p => {
    let rollup, command;
    try {
      rollup = readFileSync(`/proc/${p}/smaps_rollup`, "utf8");
      command = readFileSync(`/proc/${p}/cmdline`, "utf8").split("\0").filter(Boolean).slice(0, 3).join(" ");
    } catch {
      return []; // ended meanwhile
    }
    const kib = name => Number(new RegExp(`^${name}:\\s+(\\d+) kB`, "mu").exec(rollup)?.[1] ?? 0);
    return [{ pid: p, command, rss: kib("Rss"), pss: kib("Pss"), uss: kib("Private_Clean") + kib("Private_Dirty") }];
  });
}
