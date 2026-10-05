// The harness end to end, against a tiny tool written here (plain node:http,
// no framework, no dependency): the Chest's environment and nothing else,
// the routing of both hosts, the CSP, cookies, a schedule's run, sleep and
// waking, the log. Runs dev.mjs as an agent would.
//   node --test lab/chest-dev/test/harness.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const port = 4870;
const team = `http://localhost:${port}`;
const publicHost = `http://localhost:${port + 2}`;
const sdkVersion = JSON.parse(readFileSync(join(root, "sdk", "package.json"), "utf8")).version;
const official04 = !/^0\.[0-3]\./u.test(sdkVersion);

// The tool: answers what it was given, keeps the schedule runs it received
// in memory (lost when it sleeps, as they should be), and starts slowly when
// told to (SLOW_START_MS, a variable it declares in chest.json).
const server = `
import { createServer } from "node:http";
const runs = [];
const json = (res, status, value, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(value)); };
const app = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/chest-schedules") {
    let body = ""; for await (const c of req) body += c;
    runs.push({ header: Boolean(req.headers["chest-schedule"]), body: JSON.parse(body) });
    res.writeHead(204); return res.end();
  }
  if (url.pathname === "/chest/env") return json(res, 200, { member: Boolean(req.headers["chest-member"]), env: process.env });
  if (url.pathname === "/chest/runs") return json(res, 200, runs);
  if (url.pathname === "/chest/cookies") return json(res, 200, {}, { "Set-Cookie": ["good=1; Path=/; HttpOnly", "wide=1; Domain=localhost; Path=/", "__Host-chest=stolen; Path=/; Secure"] });
  if (url.pathname === "/chest/own-policy") return json(res, 200, {}, { "Content-Security-Policy": "default-src 'self'" });
  if (url.pathname.startsWith("/assets/")) { res.writeHead(200, { "Content-Type": "text/css", "X-Had-Member": String(Boolean(req.headers["chest-member"])) }); return res.end("body{}"); }
  if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<h1>Public</h1>"); }
  json(res, 404, { error: "not_found" });
});
setTimeout(() => app.listen(Number(process.env.PORT), "127.0.0.1", () => console.log("listening on " + process.env.PORT)), Number(process.env.SLOW_START_MS ?? 0));
process.on("SIGTERM", () => { console.log("bye"); app.close(); process.exit(0); });
`;

let folder, harness, output = "";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url, init = {}) => fetch(url, { redirect: "manual", ...init, headers: { cookie: "dev_member=mbr_hugoaaaaaaaaaaaaaaaaaaaaaa", ...(init.headers ?? {}) } });
const portOpen = (p) => new Promise((done) => { const s = connect({ host: "127.0.0.1", port: p }); s.once("connect", () => { s.destroy(); done(true); }); s.once("error", () => done(false)); });

before(async () => {
  folder = mkdtempSync(join(tmpdir(), "chest-dev-fixture-"));
  writeFileSync(join(folder, "server.mjs"), server);
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module", scripts: { start: "node server.mjs" } }));
  writeFileSync(join(folder, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3, requires: true, packages: { "": { name: "fixture" } } }));
  writeFileSync(join(folder, "chest.json"), JSON.stringify({ chest: "0.4", name: "fixture", title: "Fixture", description: "A tool of the harness's test.", public: true, env: ["SLOW_START_MS"], schedules: [{ name: "nightly", cron: "0 3 * * *" }], build: { runtime: "node", install: "npm ci", start: "npm start", port: 3000, static: ["/assets/"] } }));
  mkdirSync(join(folder, "node_modules"));
  harness = spawn(process.execPath, [join(root, "lab", "chest-dev", "dev.mjs"), folder, "--prod", "--port", String(port), "--sleep-after", "2"], { env: { ...process.env, SLOW_START_MS: "2600", NODE_OPTIONS: "--max-old-space-size=64" }, stdio: ["ignore", "pipe", "pipe"] });
  harness.stdout.on("data", (c) => { output += c; });
  harness.stderr.on("data", (c) => { output += c; });
  for (let i = 0; i < 600 && !(await portOpen(port)); i++) await pause(100);
  assert.ok(await portOpen(port), "the harness listens:\n" + output);
});

after(async () => {
  harness.kill("SIGTERM");
  await new Promise((r) => harness.once("exit", r));
  assert.equal(await portOpen(port + 1), false, "the tool stops with the harness");
  rmSync(folder, { recursive: true, force: true });
});

test("the Chest's environment, and nothing of the shell's", async () => {
  const { member, env } = await (await get(`${team}/chest/env`)).json();
  assert.equal(member, true);
  assert.equal(env.PORT, String(port + 1));
  assert.equal(env.CHEST_TEAM_URL, team);
  assert.equal(env.CHEST_PUBLIC_URL, publicHost);
  assert.equal(env.CHEST_CURRENCY, "EUR");
  assert.equal(env.CHEST_ORGANIZATION, "Atelier Martin");
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.SLOW_START_MS, "2600", "a variable the tool declares (env) comes from the shell");
  assert.equal(env.NODE_OPTIONS, undefined, "the shell's NODE_OPTIONS never reaches the tool");
  assert.ok(env.CHEST_API && env.CHEST_TOKEN && env.CHEST_TOOL === "fixture");
});

test("the team host: static files without a member, the rest to the public host", async () => {
  const css = await get(`${team}/assets/app.css`);
  assert.equal(css.status, 200);
  assert.equal(css.headers.get("x-had-member"), "false");
  assert.equal(css.headers.get("content-security-policy"), "frame-ancestors 'none'");
  const home = await get(`${team}/?a=1`);
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), `${publicHost}/?a=1`);
  assert.equal((await get(`${team}/chest/env`, { method: "POST" })).status, 403, "a write without fetch metadata");
  assert.equal((await get(`${team}/chest/own-policy`)).headers.get("content-security-policy"), "default-src 'self'", "the tool's own policy is its own");
});

test("the public host: its pages with the Chest's policy, /chest sent back", async () => {
  const page = await get(`${publicHost}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/u);
  const back = await get(`${publicHost}/chest/env`);
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("location"), `${team}/chest/env`);
  assert.equal((await get(`${publicHost}/a/../chest`)).status, 302, "fetch normalizes ..; a raw one is tested in routing.test.mjs");
});

test("cookies: only the tool's own, on its host", async () => {
  const answer = await get(`${team}/chest/cookies`);
  assert.deepEqual(answer.headers.getSetCookie(), ["good=1; Path=/; HttpOnly"]);
});

test("a schedule's run, signed, to POST /chest-schedules", { skip: official04 ? false : `the SDK working copy is ${sdkVersion}: runs go to /chest-jobs` }, async () => {
  const run = await fetch(`${team}/_dev/schedule`, { method: "POST", body: new URLSearchParams({ name: "nightly" }), redirect: "manual" });
  assert.equal(run.status, 303);
  const runs = await (await get(`${team}/chest/runs`)).json();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].header, true);
  assert.equal(runs[0].body.name, "nightly");
  assert.match(runs[0].body.id, /^run_/u);
  assert.equal(runs[0].body.attempt, 1);
  const unknown = await fetch(`${team}/_dev/schedule`, { method: "POST", body: new URLSearchParams({ name: "nope" }), redirect: "manual" });
  assert.equal(unknown.status, 400);
});

test("asleep after 2 s idle; a request waits for the wake; memory is gone", async () => {
  await get(`${team}/chest/env`);
  await pause(3500);
  assert.equal(await portOpen(port + 1), false, "asleep: the tool's process is gone");
  const started = Date.now();
  const runs = await get(`${team}/chest/runs`, { headers: { accept: "application/json", "sec-fetch-mode": "cors" } });
  assert.equal(runs.status, 200);
  assert.ok(Date.now() - started > 2000, "held while the tool woke");
  assert.deepEqual(await runs.json(), [], "nothing kept across a sleep");
});

test("a browser opening a page while the tool wakes gets 'Waking up…' after 2 s", async () => {
  const slept = await fetch(`${team}/_dev/sleep`, { method: "POST", redirect: "manual" });
  assert.equal(slept.status, 303);
  // fetch() sends Sec-Fetch-Mode: cors whatever it is told: a browser's
  // navigation is played with node:http.
  const started = Date.now();
  const page = await new Promise((done, fail) => {
    request(`${team}/chest/env`, { headers: { "sec-fetch-mode": "navigate", accept: "text/html", cookie: "dev_member=mbr_hugoaaaaaaaaaaaaaaaaaaaaaa" } }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => done({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", fail).end();
  });
  const took = Date.now() - started;
  assert.equal(page.status, 503);
  assert.equal(page.headers["retry-after"], "2");
  assert.match(page.body, /Waking up Fixture…/u);
  assert.match(page.body, /http-equiv="refresh" content="2"/u);
  assert.ok(took >= 1900 && took < 2600, `answered after ${took} ms`);
  for (let i = 0; i < 50 && !(await portOpen(port + 1)); i++) await pause(100);
  assert.equal((await get(`${team}/chest/env`)).status, 200, "awake again");
});

test("the log: the tool's output and the Chest's lines, in a file and on /_dev/logs", async () => {
  const text = await (await fetch(`${team}/_dev/logs.txt`)).text();
  assert.match(text, / out {3}listening on/u);
  assert.match(text, / chest Asleep: no visit for 2 s/u);
  assert.match(text, / chest Waking up: GET \/chest\/runs/u);
  assert.match(text, / chest front \(team host\): POST \/chest\/env → 403/u);
  const page = await fetch(`${team}/_dev/logs`);
  assert.equal(page.status, 200);
  const file = /logs: (lab\/chest-dev\/logs\/fixture\/[^\s]+\.log)/u.exec(output)?.[1];
  assert.ok(file, "the harness names its log file");
  assert.match(readFileSync(join(root, file), "utf8"), /listening on/u);
  rmSync(join(root, file));
});
