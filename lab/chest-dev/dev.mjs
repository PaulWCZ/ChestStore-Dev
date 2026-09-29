// The studio's `chest dev`: runs one tool as a Chest would, on this machine.
//
//   node lab/chest-dev/dev.mjs tools/private/<name> [--port 4000] [--prod] [--seed] [--reset] [--empty]
//
// - a fake Chest (the SDK working copy's fakeChest: members, groups, files,
//   notifications, events, and every proposal it fakes), with a cast of
//   sample members given the tool's roles;
// - the tool's database on the local PostgreSQL, as the Chest makes it
//   (role and database t_<tool>, migrations run as the tool in name order,
//   recorded in chest_migrations); --reset drops it and starts again, --seed
//   loads seed/sample.sql (also on a fresh database), --empty never loads it
//   (a new company's first visit: with --reset, an empty tool);
// - the tool itself (`npm run dev`, or `npm start` after `npm run build`
//   with --prod) on a port of its own, with the Chest's environment;
// - in front, http://localhost:<port>: /chest… carries the Chest-Member
//   assertion of the member chosen on /_dev (in the language chosen there),
//   the rest is the public host (no member), /_chest/… is the fake Chest's
//   front (uploads, file links, photos), /_dev is the harness: who you are,
//   the bell, badges, files, and buttons that play the Chest (member
//   lifecycle events, proposals such as scheduled tasks, the outbox and
//   received mail, the calendar feeds, the Chest's groups).
//
// Environment: DEV_DATABASE_URL (a PostgreSQL superuser URL, default
// postgres://postgres:postgres@127.0.0.1:5432/postgres).
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";
import { sampleBrand, sampleBrands } from "./brand/sample.mjs";
import { cast, castFor } from "./cast.mjs";
import { devPage } from "./page.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith("--") && !/^\d+$/u.test(a));
const flag = name => args.includes("--" + name);
const option = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!folder || !existsSync(join(folder, "chest.json"))) {
  console.error("usage: node lab/chest-dev/dev.mjs <tool folder> [--port 4000] [--prod] [--seed] [--reset] [--empty]");
  process.exit(1);
}
const tool = resolve(folder);
const manifest = JSON.parse(readFileSync(join(tool, "chest.json"), "utf8"));
// Manifest keys of the SDK working copy's proposals, which a Chest does not
// accept yet: kept apart so the tool stays installable today.
const proposals = existsSync(join(tool, "chest.proposals.json")) ? JSON.parse(readFileSync(join(tool, "chest.proposals.json"), "utf8")) : {};
const port = Number(option("port", "4000"));
const inner = port + 1;
const origin = `http://localhost:${port}`;

// The SDK working copy, built.
const sdk = join(root, "sdk");
if (!existsSync(join(sdk, "dist", "src", "testing.js"))) {
  if (!existsSync(join(sdk, "node_modules"))) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: sdk, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: sdk, stdio: "inherit" });
}
const testing = { ...(await import(pathToFileURL(join(sdk, "dist", "src", "testing.js")).href)), schedulesApi: await import(pathToFileURL(join(sdk, "dist", "src", "schedules.js")).href) };

// The UI kit working copy, built: the theme catalogue for the switcher,
// and its fonts, which the fake Chest's front serves at /_chest/theme/fonts/
// as a Chest would (Proposal (studio): the theme).
const ui = join(root, "ui");
if (!existsSync(join(ui, "dist", "themes.js"))) {
  if (!existsSync(join(ui, "node_modules"))) execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: ui, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: ui, stdio: "inherit" });
}
const { catalogue } = await import(pathToFileURL(join(ui, "dist", "themes.js")).href);
const themeFiles = {
  "brand/logo.svg": { data: readFileSync(join(root, "lab", "chest-dev", "brand", "atelier-martin.svg")), type: "image/svg+xml" },
  "brand/logo-dark.svg": { data: readFileSync(join(root, "lab", "chest-dev", "brand", "atelier-martin-dark.svg")), type: "image/svg+xml" },
  "brand/port-logo.svg": { data: readFileSync(join(root, "lab", "chest-dev", "brand", "cafe-du-port.svg")), type: "image/svg+xml" },
  "brand/port-logo-dark.svg": { data: readFileSync(join(root, "lab", "chest-dev", "brand", "cafe-du-port-dark.svg")), type: "image/svg+xml" },
};
for (const file of existsSync(join(ui, "fonts")) ? readdirSync(join(ui, "fonts")) : []) {
  themeFiles[`fonts/${file}`] = { data: readFileSync(join(ui, "fonts", file)), type: file.endsWith(".woff2") ? "font/woff2" : "text/plain; charset=utf-8" };
}
// A choice of the switcher: "own", "catalogue:<id>", "brand:sample",
// "brand:port" (the second sample brand, brand/sample.mjs).
function choiceOf(value) {
  if (value === "own") return { mode: "own" };
  const brandKey = /^brand:([a-z]+)$/u.exec(value ?? "")?.[1];
  if (brandKey && Object.hasOwn(sampleBrands, brandKey)) return { mode: "brand", brand: sampleBrands[brandKey] };
  const id = /^catalogue:([a-z][a-z0-9-]{1,39})$/u.exec(value ?? "")?.[1];
  return id && catalogue.some(t => t.id === id) ? { mode: "catalogue", theme: id } : null;
}

// The database, as the Chest makes it.
const capabilities = manifest.capabilities ?? [];
let databaseUrl = null;
if (capabilities.includes("database")) {
  const admin = postgres(process.env["DEV_DATABASE_URL"] ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres", { max: 1, onnotice: () => {} });
  const role = "t_" + manifest.name.replace(/-/gu, "_");
  const password = "dev";
  const [exists] = await admin`select 1 as x from pg_database where datname = ${role}`;
  if (flag("reset") && exists) await admin.unsafe(`drop database ${role} with (force)`);
  const [hasRole] = await admin`select 1 as x from pg_roles where rolname = ${role}`;
  if (!hasRole) await admin.unsafe(`create role ${role} login password '${password}'`);
  const fresh = flag("reset") || !exists;
  if (fresh) await admin.unsafe(`create database ${role} owner ${role} template template0 encoding 'UTF8'`);
  await admin.end();
  databaseUrl = `postgres://${role}:${password}@127.0.0.1:5432/${role}?sslmode=disable`;
  const sql = postgres(databaseUrl.replace("?sslmode=disable", ""), { max: 1, onnotice: () => {} });
  await sql`create table if not exists chest_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`;
  const migrations = existsSync(join(tool, "migrations")) ? readdirSync(join(tool, "migrations")).filter(f => f.endsWith(".sql")).sort() : [];
  for (const file of migrations) {
    const text = readFileSync(join(tool, "migrations", file), "utf8");
    const sha = createHash("sha256").update(text).digest("hex");
    const [done] = await sql`select sha256 from chest_migrations where name = ${file}`;
    if (done) {
      if (done.sha256 !== sha) console.warn(`! migration ${file} changed since it ran: a Chest would refuse this version (run with --reset)`);
      continue;
    }
    await sql.begin(async tx => {
      await tx.unsafe(text).simple();
      await tx`insert into chest_migrations (name, sha256) values (${file}, ${sha})`;
    });
    console.log(`migration ${file} run`);
  }
  if ((fresh || flag("seed")) && !flag("empty") && existsSync(join(tool, "seed", "sample.sql"))) {
    await sql.unsafe(readFileSync(join(tool, "seed", "sample.sql"), "utf8")).simple();
    console.log("seed/sample.sql loaded");
  }
  await sql.end();
}

// The fake Chest, with the cast given the tool's roles.
process.env["CHEST_TOOL"] = manifest.name;
const members = castFor(manifest, tool);
const chest = await testing.fakeChest({
  members,
  former: [{ id: "mbr_" + "paul" + "a".repeat(22), name: "Paul Lefèvre" }],
  groups: cast.groups.map(g => ({ ...g, members: members.filter(m => m.groups.includes(g.id)).map(m => m.id) })),
  capabilities: [...capabilities.filter(c => c !== "database"), ...(proposals.mail ? ["mail"] : []), ...(proposals.calendar === true ? ["calendar"] : []), ...(proposals.groups === "read" ? ["groups"] : [])],
  mail: { domain: "atelier-martin.test", mailboxes: proposals.mail?.mailboxes ?? [] },
  // The calendar bridge (Proposal (studio)): each member's feed at
  // http://localhost:<port>/_chest/calendar/<secret>.ics — a calendar app
  // on this machine may subscribe to it.
  calendar: { domain: "atelier-martin.test", toolTitle: manifest.title ?? manifest.name, company: "Atelier Martin" },
  emits: proposals.emits ?? [],
  storage: { publicUploads: proposals.files?.publicUploads === true, publicFiles: proposals.files?.publicFiles === true },
  receives: manifest.receives ?? [],
  origin,
  schedules: proposals.schedules ?? [],
  ...(proposals.checks ? { checks: proposals.checks } : {}),
  timeZone: process.env["CHEST_TIMEZONE"] ?? "Europe/Paris",
  // The Chest's settings (Proposal (studio): the chest module): the cast's
  // company; both hosts are this harness's one origin.
  settings: { company: "Atelier Martin", currency: "EUR", locale: "en", ...(manifest.public ? { publicUrl: origin } : {}) },
  // The company's look (Proposal (studio)): its own identity for every tool
  // until the switcher on /_dev says otherwise.
  theme: {},
  themeFiles,
});

// The tool, with the Chest's environment.
const env = {
  ...process.env,
  PORT: String(inner),
  CHEST_API: chest.api,
  CHEST_TOKEN: chest.token,
  CHEST_TOOL: manifest.name,
  NODE_ENV: flag("prod") ? "production" : "development",
  NEXT_TELEMETRY_DISABLED: "1",
  ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
};
delete env["DEV_DATABASE_URL"];
// --prod serves the last `npm run build`: say so loudly when the sources are
// newer, so a flow or a screenshot never checks yesterday's code by mistake.
if (flag("prod")) {
  const built = join(tool, ".next", "BUILD_ID");
  if (!existsSync(built)) {
    console.error("✗ no build: run `npm run build` in the tool first (--prod serves the last build)");
    process.exit(1);
  }
  const at = statSync(built).mtimeMs;
  const newer = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", "docs", "test", "seed"].includes(entry.name) || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(tsx?|css|json|mjs|sql)$/u.test(entry.name) && statSync(path).mtimeMs > at) newer.push(path.slice(tool.length + 1));
    }
  };
  walk(tool);
  if (newer.length && !flag("stale-ok")) {
    console.error(`✗ the build is older than ${newer.length} source file(s) (e.g. ${newer.slice(0, 3).join(", ")}): run \`npm run build\` again (or pass --stale-ok)`);
    process.exit(1);
  }
}
const child = spawn("npm", flag("prod") ? ["start"] : ["run", "dev"], { cwd: tool, env, stdio: ["ignore", "inherit", "inherit"] });
child.on("exit", code => {
  console.log(`the tool stopped (${code})`);
  process.exit(code ?? 1);
});

// Who is signed in on /chest, and in which language: cookies of the harness.
function cookies(request) {
  return Object.fromEntries((request.headers.cookie ?? "").split(/;\s*/u).filter(Boolean).map(c => {
    const i = c.indexOf("=");
    return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
  }));
}
function current(request) {
  const jar = cookies(request);
  const chosen = chest.members.find(m => m.id === jar["dev_member"]) ?? chest.members[0];
  const locale = jar["dev_locale"];
  return locale ? { ...chosen, locale } : chosen;
}

function relay(request, response, target, headers) {
  const upstream = httpRequest({ host: "127.0.0.1", port: target.port, path: request.url, method: request.method, headers }, answer => {
    response.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "text/plain" }).end("The tool is not answering yet (starting, or stopped): see the terminal.");
    else response.destroy();
  });
  request.pipe(upstream);
}

async function readForm(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

const front = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", origin);
  const path = url.pathname;
  if (path === "/_dev" || path.startsWith("/_dev/")) {
    if (request.method === "POST") {
      const form = await readForm(request);
      const back = { Location: form.get("back") && /^\/(?!\/)/u.test(form.get("back")) ? form.get("back") : "/_dev" };
      if (path === "/_dev/as") {
        const set = [`dev_member=${encodeURIComponent(form.get("member") ?? "")}; Path=/; SameSite=Lax`];
        set.push(form.get("locale") ? `dev_locale=${form.get("locale")}; Path=/; SameSite=Lax` : "dev_locale=; Path=/; Max-Age=0");
        return void response.writeHead(303, { ...back, "Set-Cookie": set }).end();
      }
      if (path === "/_dev/event") {
        const type = form.get("type");
        const id = form.get("member");
        const data = type === "member.erased" ? { id, erasure: "era_" + Array.from({ length: 26 }, () => "abcdefghijklmnopqrstuvwxyz234567"[Math.floor(Math.random() * 32)]).join(""), deadline: new Date(Date.now() + 30 * 864e5).toISOString() } : type === "member.updated" ? { id, changed: ["name"] } : { id };
        if (type === "member.removed" || type === "member.erased") {
          const gone = chest.members.findIndex(m => m.id === id);
          // As a real Chest: whoever left is "former", with their name,
          // or with none once erased.
          if (gone >= 0) {
            const [who] = chest.members.splice(gone, 1);
            chest.former.push(type === "member.erased" ? { id, erased: true } : { id, name: who.name });
          } else if (type === "member.erased") {
            const known = chest.former.find(f => f.id === id);
            if (known) { delete known.name; known.erased = true; }
          }
        }
        const status = await chest.emit({ type, data }, `http://127.0.0.1:${inner}`);
        console.log(`event ${type} for ${id} → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/schedule") {
        const status = await chest.run(form.get("name"), `http://127.0.0.1:${inner}`);
        console.log(`schedule ${form.get("name")} run → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/check") {
        const ok = form.get("ok") === "1";
        const status = await chest.check(form.get("name"), `http://127.0.0.1:${inner}`, ok ? {} : { ok: false, status: 503, ms: 870, error: "status" });
        console.log(`check ${form.get("name")} ${ok ? "ok" : "failed"} → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/receive") {
        // Proposal (studio): a new message, or a reply to one the tool sent
        // (to its thread address when it had one, In-Reply-To its id).
        const replied = chest.outbox.find(m => m.id === form.get("reply"));
        const mailbox = form.get("mailbox");
        const message = { mailbox, from: form.get("from"), fromName: form.get("fromName") || undefined, subject: form.get("subject"), text: form.get("text"), ...(form.get("html") ? { html: form.get("html") } : {}), auto: form.get("auto") === "1", authenticated: form.get("forged") !== "1" };
        if (replied) {
          message.subject = /^re:/iu.test(replied.subject) ? replied.subject : `Re: ${replied.subject}`;
          message.inReplyTo = replied.messageId;
          message.references = [...(replied.references ?? []), replied.messageId];
          if (replied.replyTo && replied.replyTo.startsWith(mailbox + "+")) message.deliveredTo = replied.replyTo;
        }
        const status = await chest.receive(message, `http://127.0.0.1:${inner}`);
        console.log(`mail to ${message.deliveredTo ?? mailbox} → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/bounce") {
        const status = await chest.bounce(form.get("message"), `http://127.0.0.1:${inner}`, { permanent: form.get("permanent") !== "0" });
        console.log(`bounce of ${form.get("message")} → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/feed") {
        chest.newFeedUrl(form.get("member"));
        console.log(`new calendar address for ${form.get("member")}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/group") {
        // Proposal (studio): the admin moves someone in or out of a group;
        // the Chest tells the tool (member.updated, and group.changed to a
        // tool that receives "group.*").
        const group = chest.groups.find(g => g.id === form.get("group"));
        const who = chest.members.find(m => m.id === form.get("member"));
        if (group && who) {
          const adding = form.get("action") === "add";
          if (adding && !group.members.includes(who.id)) { group.members.push(who.id); who.groups.push(group.id); }
          if (!adding) { group.members = group.members.filter(id => id !== who.id); who.groups = who.groups.filter(id => id !== group.id); }
          const to = `http://127.0.0.1:${inner}`;
          if ((manifest.receives ?? []).includes("member.*")) console.log(`event member.updated (groups) → ${await chest.emit({ type: "member.updated", data: { id: who.id, changed: ["groups"] } }, to)}`);
          if ((proposals.receives ?? []).includes("group.*")) console.log(`event group.changed (members) → ${await chest.emit({ type: "group.changed", data: { id: group.id, changed: ["members"] } }, to)}`);
        }
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/deliver") {
        let data = {};
        try { data = JSON.parse(form.get("data") || "{}"); } catch { data = {}; }
        const status = await chest.deliver({ type: form.get("type"), data }, `http://127.0.0.1:${inner}`);
        console.log(`event ${form.get("type")} delivered → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/theme") {
        // The owner's two levels: all tools, and this tool.
        const level = form.get("level") === "tool" ? "tool" : "all";
        const value = form.get("choice");
        if (level === "all") chest.theme.all = value === "own" ? null : choiceOf(value);
        else if (value === "inherit") delete chest.theme.tools[manifest.name];
        else chest.theme.tools[manifest.name] = choiceOf(value);
        console.log(`look ${level === "all" ? "for all tools" : "for this tool"}: ${value}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/clear") {
        chest.notifications.splice(0);
        return void response.writeHead(303, back).end();
      }
      // A proposal's own control (scheduled task, outbox…), when the fake
      // Chest offers it: chest.dev?.[name](form).
      const control = path.slice("/_dev/".length);
      if (typeof chest.dev?.[control] === "function") {
        await chest.dev[control](Object.fromEntries(form), `http://127.0.0.1:${inner}`);
        return void response.writeHead(303, back).end();
      }
      return void response.writeHead(404).end();
    }
    const html = devPage({ manifest, proposals, chest, me: current(request), origin, schedulesApi: testing.schedulesApi, catalogue, sampleBrand });
    return void response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html);
  }
  if (path.startsWith("/_chest/")) {
    // The Chest's own page for a member's calendar (Proposal (studio)) is
    // shown to the member signed in, as /chest is.
    const headers = { ...request.headers };
    delete headers["chest-member"];
    if (path === "/_chest/calendar" || path === "/_chest/calendar/new") headers["chest-member"] = testing.signAssertion(current(request));
    return relay(request, response, { port: Number(new URL(chest.api).port) }, headers);
  }
  if (path === "/chest-events" || path === "/chest-mail" || path.startsWith("/chest-jobs/")) return void response.writeHead(404).end();
  const headers = { ...request.headers, "x-forwarded-host": `localhost:${port}`, "x-forwarded-proto": "http" };
  delete headers["chest-member"];
  const first = path.split("/")[1]?.toLowerCase();
  if (first === "chest") headers["chest-member"] = testing.signAssertion(current(request));
  relay(request, response, { port: inner }, headers);
});
front.listen(port, "127.0.0.1", () => {
  console.log(`\n${manifest.title ?? manifest.name}: ${origin}/chest  (members' part)  ·  ${origin}/  (public)  ·  ${origin}/_dev  (the harness)\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  child.kill("SIGTERM");
  await chest.close();
  process.exit(0);
});
