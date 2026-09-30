// The studio's `chest dev`: runs one tool as a Chest would, on this machine.
//
//   node lab/chest-dev/dev.mjs tools/private/<name> [--port 4000] [--prod] [--stale-ok] [--seed] [--reset] [--empty] [--tools crm,helpdesk] [--linked] [--elsewhere] [--granting-groups]
//
// SDK 0.3.1-studio.1 (lab/chest-dev/README.md): the Chest is "Atelier
// Martin", in CHEST_TIME_ZONE (Europe/Paris unless set), speaking English,
// paying in euros; the tool's database sessions are in that zone.
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
//   received mail, the calendar feeds, the Chest's groups, webhooks);
// - the tools whose events it receives, installed beside it (CHEST_TOOL_URLS),
//   and those named by --tools (a sender that checks its receivers are
//   installed: Forms asks for Clients and Support); with --linked, an
//   admin linked them to this tool for the events they receive.
//
// Environment: DEV_DATABASE_URL (a PostgreSQL superuser URL, default
// postgres://postgres:postgres@127.0.0.1:5432/postgres); CHEST_TIME_ZONE
// (the Chest's zone, default Europe/Paris).
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
  console.error("usage: node lab/chest-dev/dev.mjs <tool folder> [--port 4000] [--prod] [--stale-ok] [--seed] [--reset] [--empty] [--tools a,b] [--linked] [--elsewhere] [--granting-groups]");
  process.exit(1);
}
// The Chest's zone (CHEST_TIME_ZONE): the tool's chest.timeZone, the zone of
// its database sessions, and every cast member's unless docs/dev.json or
// --elsewhere says otherwise. Checked before anything starts: PostgreSQL and
// the SDK must both know it.
const zone = process.env["CHEST_TIME_ZONE"] ?? "Europe/Paris";
try {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/u.test(zone)) throw new Error("shape");
  new Intl.DateTimeFormat("en", { timeZone: zone });
} catch {
  console.error(`✗ CHEST_TIME_ZONE=${JSON.stringify(zone)} is not an IANA time zone (Europe/Paris, America/Montreal, UTC…)`);
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
  // The Chest makes its zone the TimeZone of the tool's database sessions
  // (SDK 0.3.0, the chest module): current_date and now()::date are the
  // Chest's day. Set on the database at every start (the zone may have
  // changed since), before any session of the tool opens — migrations and
  // seed/sample.sql included.
  await admin.unsafe(`alter database ${role} set timezone to '${zone}'`);
  await admin.end();
  databaseUrl = `postgres://${role}:${password}@127.0.0.1:5432/${role}?sslmode=disable`;
  const sql = postgres(databaseUrl.replace("?sslmode=disable", ""), { max: 1, onnotice: () => {} });
  const [session] = await sql`select current_setting('TimeZone') as zone, current_date::text as today`;
  if (session.zone !== zone) console.warn(`! the database's sessions are in ${session.zone}, not ${zone}: a role setting overrides it (alter role ${role} reset timezone)`);
  console.log(`database ${role}: sessions in ${session.zone}, current_date ${session.today}`);
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
// The mail options stay this harness's: /_dev/delivery "quota" sets perDay
// to 0 (the day's messages used), which the fake reads at each call.
const mailOptions = { domain: "atelier-martin.test", mailboxes: proposals.mail?.mailboxes ?? [], perDay: 500 };
const members = castFor(manifest, tool, { zone, elsewhere: flag("elsewhere") });
// Paul Lefèvre left the company three weeks ago (FormerMember.leftAt,
// Proposal (studio.15)): the seeds' "former member".
const paulLeft = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 21, 16, 0, 0)).toISOString();
const chest = await testing.fakeChest({
  members,
  former: [{ id: "mbr_" + "paul" + "a".repeat(22), name: "Paul Lefèvre", leftAt: paulLeft }],
  // Every cast member has the tool without a group giving it (a tool open
  // to everyone, the usual case): as on a Chest, member.groups and
  // members.*.groups are then [], and a member's groups are asked with
  // members.groups.of (a tool with "groups": "read"). --granting-groups:
  // the three groups give the tool (a tool the owner gave to groups).
  groups: cast.groups.map(g => ({ ...g, members: members.filter(m => m.groups.includes(g.id)).map(m => m.id), grants: flag("granting-groups") })),
  capabilities: [...capabilities.filter(c => c !== "database"), ...(proposals.mail ? ["mail"] : []), ...(proposals.calendar === true ? ["calendar"] : []), ...(proposals.groups === "read" ? ["groups"] : [])],
  mail: mailOptions,
  // The calendar bridge (Proposal (studio)): each member's feed at
  // http://localhost:<port>/_chest/calendar/<secret>.ics — a calendar app
  // on this machine may subscribe to it.
  calendar: { domain: "atelier-martin.test", toolTitle: manifest.title ?? manifest.name, company: "Atelier Martin" },
  emits: proposals.emits ?? [],
  storage: { publicUploads: proposals.files?.publicUploads === true, publicFiles: proposals.files?.publicFiles === true },
  receives: manifest.receives ?? [],
  // The other tools installed beside this one (Proposal (studio):
  // chest.toolUrl, CHEST_TOOL_URLS): those whose events it receives
  // ("forms.request" → forms), at the fake's team host
  // https://<name>-chest.chest.test — never reached, but a link back to
  // them shows as on a Chest. This tool is always there, at the origin.
  tools: Object.fromEntries([...(proposals.receives ?? []).map(type => String(type).split(".")[0]), ...option("tools", "").split(",").filter(Boolean)].filter(name => /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(name) && name.length <= 63 && name !== manifest.name && !["member", "group"].includes(name)).map(name => [name, true])),
  origin,
  schedules: proposals.schedules ?? [],
  ...(proposals.checks ? { checks: proposals.checks } : {}),
  // Webhooks (Proposal (studio)): the Chest delivers to the addresses the
  // tool adds — simulated here (no request leaves this machine); /_dev
  // makes a target fail and plays the retries; webhook.disabled goes to
  // the tool's POST /chest-webhooks.
  ...(proposals.webhooks ? { webhooks: { max: proposals.webhooks.max, to: `http://127.0.0.1:${inner}` } } : {}),
  // The Chest (SDK 0.3.0: CHEST_ORGANIZATION, CHEST_TIME_ZONE,
  // CHEST_LANGUAGE; Proposal (studio): CHEST_CURRENCY, and the public host
  // CHEST_PUBLIC_URL of a tool with a public part — both hosts are this
  // harness's one origin, CHEST_TEAM_URL too).
  chest: { organization: "Atelier Martin", timeZone: zone, language: "en", currency: "EUR", ...(manifest.public ? { publicUrl: origin } : {}) },
  // The company's look (Proposal (studio)): its own identity for every tool
  // until the switcher on /_dev says otherwise.
  theme: {},
  themeFiles,
});
// --linked (opt-in; Proposal (studio.16): events.receivers): an admin
// linked each tool installed beside this one to it, for every type this
// tool emits that the other declares in its `receives` (read from its
// manifests in tools/). Without it, nothing is linked: receivers answers
// [] and publish counts `receivers` (0), as on a Chest where no admin
// linked the tools yet.
if (flag("linked")) {
  const receivesOf = name => {
    for (const kind of ["private", "public-and-private"]) {
      const dir = join(root, "tools", kind, name);
      if (!existsSync(join(dir, "chest.json"))) continue;
      const read = file => (existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), "utf8")).receives ?? [] : []);
      return [...read("chest.json"), ...read("chest.proposals.json")];
    }
    return [];
  };
  for (const type of proposals.emits ?? []) chest.linked[type] = Object.keys(chest.tools).filter(name => name !== manifest.name && receivesOf(name).includes(type)).sort();
}

// The tool, with the Chest's environment.
// The fake Chest wrote the Chest's variables in this process's environment
// (fakeChest sets them, as the Chest sets the tool's): they are passed on
// by name, those it leaves unset (CHEST_PUBLIC_URL for a tool without a
// public part) left out. The names before SDK 0.3.0 never reach the tool.
const chestEnv = Object.fromEntries(["CHEST_ORGANIZATION", "CHEST_TIME_ZONE", "CHEST_LANGUAGE", "CHEST_CURRENCY", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL", "CHEST_TOOL_URLS"].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
const env = {
  ...process.env,
  PORT: String(inner),
  CHEST_API: chest.api,
  CHEST_TOKEN: chest.token,
  CHEST_TOOL: manifest.name,
  ...chestEnv,
  NODE_ENV: flag("prod") ? "production" : "development",
  NEXT_TELEMETRY_DISABLED: "1",
  ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
};
delete env["DEV_DATABASE_URL"];
for (const old of ["CHEST_COMPANY", "CHEST_TIMEZONE", "CHEST_LOCALE"]) delete env[old];
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
// The member signed in, as the Chest asserts them: their language, or the
// one chosen on /_dev (the cookie keeps its name, dev_locale: flows set
// it), and only the groups that give the tool (0.3.0: the assertion
// carries no other).
const languages = new Set(["en", "fr"]);
function current(request) {
  const jar = cookies(request);
  const chosen = chest.members.find(m => m.id === jar["dev_member"]) ?? chest.members[0];
  const language = languages.has(jar["dev_locale"]) ? jar["dev_locale"] : null;
  const granting = new Set(chest.groups.filter(g => g.grants !== false).map(g => g.id));
  return { ...chosen, groups: chosen.groups.filter(g => granting.has(g)), ...(language ? { language } : {}) };
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
        const language = form.get("language") ?? form.get("locale");
        set.push(languages.has(language) ? `dev_locale=${language}; Path=/; SameSite=Lax` : "dev_locale=; Path=/; Max-Age=0");
        return void response.writeHead(303, { ...back, "Set-Cookie": set }).end();
      }
      if (path === "/_dev/event") {
        const type = form.get("type");
        const id = form.get("member");
        const data = type === "member.erased" ? { id, erasure: "era_" + Array.from({ length: 26 }, () => "abcdefghijklmnopqrstuvwxyz234567"[Math.floor(Math.random() * 32)]).join(""), deadline: new Date(Date.now() + 30 * 864e5).toISOString() } : type === "member.updated" ? { id, changed: ["name"] } : { id };
        if (type === "member.removed" || type === "member.erased") {
          const gone = chest.members.findIndex(m => m.id === id);
          // As a real Chest: whoever left is "former", with their name
          // and when they left (leftAt, Proposal (studio.15)), or with
          // none once erased (the date kept: it names nobody).
          const leftAt = new Date().toISOString();
          if (gone >= 0) {
            const [who] = chest.members.splice(gone, 1);
            chest.former.push(type === "member.erased" ? { id, erased: true, leftAt } : { id, name: who.name, leftAt });
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
      if (path === "/_dev/webhook") {
        // Proposal (studio): a target answers 503 (or times out) from now
        // on, or 200 again; "retry" plays the time of every pending retry.
        const action = form.get("action");
        if (action === "retry") console.log(`webhooks: ${await chest.webhooks.retry()} retried`);
        else if (form.get("target")) {
          chest.webhooks.respond(form.get("target"), action === "fail" ? 503 : action === "timeout" ? "timeout" : 200);
          console.log(`webhook ${form.get("target")} now answers ${action === "fail" ? "503" : action === "timeout" ? "nothing (timeout)" : "200"}`);
        }
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
        // An event of another tool: its data (JSON), and optionally when it
        // happened (occurredAt, an ISO 8601 instant: an event delivered
        // late or out of order), the tool it comes from (source: the type's
        // first part by default) and its id (evt_…: the same event twice).
        let data = {};
        try { data = JSON.parse(form.get("data") || "{}"); } catch { data = {}; }
        const occurredAt = form.get("occurredAt") ? new Date(form.get("occurredAt")) : null;
        if (occurredAt && Number.isNaN(occurredAt.getTime())) return void response.writeHead(400, { "Content-Type": "text/plain" }).end("occurredAt: an ISO 8601 instant (2026-09-30T08:00:00Z)");
        const event = { type: form.get("type"), data, ...(occurredAt ? { occurredAt: occurredAt.toISOString() } : {}), ...(form.get("source") ? { source: form.get("source") } : {}), ...(form.get("id") ? { id: form.get("id") } : {}) };
        const status = await chest.deliver(event, `http://127.0.0.1:${inner}`);
        console.log(`event ${event.type}${event.source ? ` from ${event.source}` : ""}${event.occurredAt ? ` (occurred ${event.occurredAt})` : ""} delivered → ${status}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/member") {
        // What a member chose in the Chest (their profile): how they want
        // email (mailPreference, Proposal (studio.15): all, digest, none —
        // read by members.get/list/lookup, applied by mail.send) and the
        // zone they work in (member.timeZone). No event tells the tool: the
        // next request's assertion, and the members API, say it.
        const who = chest.members.find(m => m.id === form.get("member"));
        if (!who) return void response.writeHead(404, { "Content-Type": "text/plain" }).end("no such member");
        const preference = form.get("mailPreference");
        if (preference !== null && !["all", "digest", "none", ""].includes(preference)) return void response.writeHead(400, { "Content-Type": "text/plain" }).end("mailPreference: all, digest or none");
        if (preference === "all" || preference === "") delete who.mailPreference;
        else if (preference) who.mailPreference = preference;
        const place = form.get("timeZone");
        if (place) {
          try { new Intl.DateTimeFormat("en", { timeZone: place }); } catch { return void response.writeHead(400, { "Content-Type": "text/plain" }).end("timeZone: an IANA zone"); }
          who.timeZone = place;
        }
        chest.clearCaches();
        console.log(`${who.name}: email ${who.mailPreference ?? "all"}, zone ${who.timeZone}`);
        return void response.writeHead(303, back).end();
      }
      if (path === "/_dev/delivery") {
        // Whether the Chest delivers (Proposal (studio.16)): mail ready,
        // not_connected (the owner has not connected the company's mail),
        // suspended (the Chest stopped sending), quota (the day's messages
        // are used); webhooks ready or suspended (the owner paused them).
        const mail = form.get("mail"), hooks = form.get("webhooks");
        if (mail) {
          if (!["ready", "not_connected", "suspended", "quota"].includes(mail)) return void response.writeHead(400, { "Content-Type": "text/plain" }).end("mail: ready, not_connected, suspended or quota");
          chest.delivery.mail = mail === "quota" ? "ready" : mail;
          mailOptions.perDay = mail === "quota" ? 0 : 500;
        }
        if (hooks) {
          if (!["ready", "suspended"].includes(hooks)) return void response.writeHead(400, { "Content-Type": "text/plain" }).end("webhooks: ready or suspended");
          chest.delivery.webhooks = hooks;
        }
        console.log(`delivery: mail ${mailOptions.perDay === 0 ? "quota" : chest.delivery.mail}, webhooks ${chest.delivery.webhooks}`);
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
    const html = devPage({ manifest, proposals, chest, me: current(request), origin, zone, mailQuota: mailOptions.perDay === 0, schedulesApi: testing.schedulesApi, catalogue, sampleBrand });
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
  if (path === "/chest-events" || path === "/chest-mail" || path === "/chest-checks" || path === "/chest-webhooks" || path.startsWith("/chest-jobs/")) return void response.writeHead(404).end();
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
