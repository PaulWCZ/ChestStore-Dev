// The Chest around one tool for the bench: its database (migrated and
// seeded once, as the Chest makes it), a fake Chest (the tool's own
// vendored SDK's `testing` module — the fake that matches its SDK), the
// members who sign in, and the environment the Chest gives the server.
//
// Everything here runs in the bench's process: none of it is counted in
// the tool's memory.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { cast, castFor } from "../../chest-dev/cast.mjs";

const zone = "Europe/Paris";

export function manifestOf(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "chest.json"), "utf8"));
  const proposals = existsSync(join(dir, "chest.proposals.json")) ? JSON.parse(readFileSync(join(dir, "chest.proposals.json"), "utf8")) : {};
  return { manifest, proposals };
}

// The database t_bench_<key> (a role and a database of the same name, the
// shape the SDK's databaseUrl() accepts), new, its sessions in the Chest's
// zone, the migrations run as the tool in name order (recorded in
// chest_migrations, as the Chest does), then seed/sample.sql. Its own name,
// so the bench never touches the harness's t_<tool> databases that other
// work may be using.
export async function prepareDatabase(dir, key, adminUrl) {
  const role = "t_bench_" + key.replace(/[^a-z0-9]/gu, "_");
  const password = "bench";
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${role} with (force)`);
  const [hasRole] = await admin`select 1 as x from pg_roles where rolname = ${role}`;
  if (!hasRole) await admin.unsafe(`create role ${role} login password '${password}'`);
  await admin.unsafe(`create database ${role} owner ${role} template template0 encoding 'UTF8'`);
  await admin.unsafe(`alter database ${role} set timezone to '${zone}'`);
  await admin.end();
  const url = `postgres://${role}:${password}@127.0.0.1:5432/${role}?sslmode=disable`;
  const sql = postgres(url.replace("?sslmode=disable", ""), { max: 1, onnotice: () => {} });
  await sql`create table if not exists chest_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`;
  const files = existsSync(join(dir, "migrations")) ? readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort() : [];
  for (const file of files) {
    const text = readFileSync(join(dir, "migrations", file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text).simple();
      await tx`insert into chest_migrations (name, sha256) values (${file}, ${createHash("sha256").update(text).digest("hex")})`;
    });
  }
  let seeded = false;
  if (existsSync(join(dir, "seed", "sample.sql"))) {
    await sql.unsafe(readFileSync(join(dir, "seed", "sample.sql"), "utf8")).simple();
    seeded = true;
  }
  await sql.end();
  return { url, role, migrations: files.length, seeded, async drop() {
    const again = postgres(adminUrl, { max: 1, onnotice: () => {} });
    await again.unsafe(`drop database if exists ${role} with (force)`);
    await again.end();
  } };
}

// The fake Chest of the tool's own SDK (node_modules/@argentic/chest-sdk,
// after `npm ci`), told what dev.mjs tells it — the options a version does
// not know are ignored by it.
export async function startFakeChest(dir, port) {
  const { manifest, proposals } = manifestOf(dir);
  const sdk = join(dir, "node_modules", "@argentic", "chest-sdk");
  const pkg = JSON.parse(readFileSync(join(sdk, "package.json"), "utf8"));
  const entry = pkg.exports?.["./testing"]?.default ?? pkg.exports?.["./testing"]?.import ?? pkg.exports?.["./testing"];
  if (typeof entry !== "string") throw new Error(`the tool's SDK (${pkg.version}) has no ./testing export`);
  const testing = await import(pathToFileURL(join(sdk, entry)).href);
  const capabilities = manifest.capabilities ?? [];
  const members = castFor(manifest, dir, { zone });
  const origin = `http://127.0.0.1:${port}`;
  process.env["CHEST_TOOL"] = manifest.name;
  const chest = await testing.fakeChest({
    members,
    former: [{ id: "mbr_" + "paul" + "a".repeat(22), name: "Paul Lefèvre", leftAt: new Date(Date.now() - 21 * 864e5).toISOString() }],
    // As dev.mjs: the groups exist, none gives the tool (a tool open to
    // everyone): the assertion carries no group.
    groups: cast.groups.map((g) => ({ ...g, members: members.filter((m) => m.groups.includes(g.id)).map((m) => m.id), grants: false })),
    capabilities: [...capabilities.filter((c) => c !== "database"), ...(proposals.mail ? ["mail"] : []), ...(proposals.calendar === true ? ["calendar"] : []), ...(proposals.groups === "read" || manifest.groups === "read" ? ["groups"] : [])],
    mail: { domain: "atelier-martin.test", mailboxes: proposals.mail?.mailboxes ?? [], perDay: 500 },
    calendar: { domain: "atelier-martin.test", toolTitle: manifest.title ?? manifest.name, company: "Atelier Martin" },
    emits: proposals.emits ?? [],
    storage: { publicUploads: proposals.files?.publicUploads === true, publicFiles: proposals.files?.publicFiles === true },
    receives: manifest.receives ?? [],
    tools: {},
    origin,
    schedules: manifest.schedules ?? proposals.schedules ?? [],
    ...(proposals.checks ? { checks: proposals.checks } : {}),
    ...(proposals.webhooks ? { webhooks: { max: proposals.webhooks.max, to: origin } } : {}),
    chest: { organization: "Atelier Martin", timeZone: zone, language: "en", currency: "EUR", teamUrl: origin, ...(manifest.public ? { publicUrl: origin } : {}) },
    theme: {},
  });
  // The Chest's variables the fake wrote in this process's environment.
  const names = ["CHEST_ORGANIZATION", "CHEST_TIME_ZONE", "CHEST_LANGUAGE", "CHEST_CURRENCY", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL", "CHEST_TOOL_URLS"];
  const chestEnv = Object.fromEntries(names.filter((n) => process.env[n] !== undefined).map((n) => [n, process.env[n]]));
  // A Chest gives these whatever the SDK version (0.4): set them when an
  // older fake does not.
  chestEnv.CHEST_ORGANIZATION ??= "Atelier Martin";
  chestEnv.CHEST_TIME_ZONE ??= zone;
  chestEnv.CHEST_LANGUAGE ??= "en";
  chestEnv.CHEST_CURRENCY ??= "EUR";
  chestEnv.CHEST_TEAM_URL ??= origin;
  if (manifest.public) chestEnv.CHEST_PUBLIC_URL ??= origin;
  const idOf = (key) => "mbr_" + key + "a".repeat(26 - key.length);
  const byKey = new Map(cast.people.map((p) => [p.key, members.find((m) => m.id === idOf(p.key))]));
  return {
    sdkVersion: pkg.version,
    env: { CHEST_API: chest.api, CHEST_TOKEN: chest.token, CHEST_TOOL: manifest.name, ...chestEnv },
    // The Chest-Member assertion of a cast member (by key: "camille"),
    // in the language given (theirs otherwise), signed now.
    assertion(key, language) {
      const member = byKey.get(key) ?? members[0];
      return testing.signAssertion({ ...member, groups: [], ...(language ? { language } : {}) });
    },
    close: () => chest.close(),
  };
}
