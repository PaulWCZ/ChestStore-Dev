// The studio's `chest dev`: runs one tool as a Chest would, on this machine.
//
//   node lab/chest-dev/dev.mjs tools/private/<name> [--port 4000] [--prod] [--seed] [--reset]
//
// - a fake Chest (the SDK working copy's fakeChest: members, groups, files,
//   notifications, events, and every proposal it fakes), with a cast of
//   sample members given the tool's roles;
// - the tool's database on the local PostgreSQL, as the Chest makes it
//   (role and database t_<tool>, migrations run as the tool in name order,
//   recorded in chest_migrations); --reset starts it empty, --seed loads
//   seed/sample.sql (also on a fresh database);
// - the tool itself (`npm run dev`, or `npm start` after `npm run build`
//   with --prod) on a port of its own, with the Chest's environment;
// - in front, http://localhost:<port>: /chest… carries the Chest-Member
//   assertion of the member chosen on /_dev (in the language chosen there),
//   the rest is the public host (no member), /_chest/… is the fake Chest's
//   front (uploads, file links, photos), /_dev is the harness: who you are,
//   the bell, badges, files, and buttons that play the Chest (member
//   lifecycle events, proposals such as scheduled tasks or the outbox).
//
// Environment: DEV_DATABASE_URL (a PostgreSQL superuser URL, default
// postgres://postgres:postgres@127.0.0.1:5432/postgres).
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";
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
  console.error("usage: node lab/chest-dev/dev.mjs <tool folder> [--port 4000] [--prod] [--seed] [--reset]");
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
  if ((fresh || flag("seed")) && existsSync(join(tool, "seed", "sample.sql"))) {
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
  capabilities: [...capabilities.filter(c => c !== "database"), ...(proposals.mail ? ["mail"] : [])],
  mail: { domain: "atelier-martin.test", mailboxes: proposals.mail?.mailboxes ?? [] },
  receives: manifest.receives ?? [],
  origin,
  schedules: proposals.schedules ?? [],
  timeZone: process.env["CHEST_TIMEZONE"] ?? "Europe/Paris",
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
          if (gone >= 0) chest.members.splice(gone, 1);
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
      if (path === "/_dev/receive") {
        const status = await chest.receive({ mailbox: form.get("mailbox"), from: form.get("from"), fromName: form.get("fromName") || undefined, subject: form.get("subject"), text: form.get("text") }, `http://127.0.0.1:${inner}`);
        console.log(`mail to ${form.get("mailbox")} → ${status}`);
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
    const html = devPage({ manifest, proposals, chest, me: current(request), origin, schedulesApi: testing.schedulesApi });
    return void response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html);
  }
  if (path.startsWith("/_chest/")) return relay(request, response, { port: Number(new URL(chest.api).port) }, request.headers);
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
