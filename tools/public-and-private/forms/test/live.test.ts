import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import * as events from "@argentic/chest-sdk/events";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { seen } from "@argentic/chest-app/db";
import * as answers from "../src/lib/answers.ts";
import * as forms from "../src/lib/forms.ts";
import { handlers } from "../src/lib/lifecycle.ts";
import { admit } from "../src/lib/live.ts";
import { homeVersion } from "../src/lib/versions.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, tom } from "./support/members.ts";

// A form's rows (its own, its answers) are fed on "form:<id>", joined only
// by who may open the form, through the table form_live (chest.json's
// "join", src/lib/live.ts); what a home shows besides is told on lanes
// without an id.

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
// Who is in form_live, as the Chest reads it at each join (a snapshot the
// tests take after the tool wrote it: the fake's check is synchronous).
let tickets = new Set<string>();
const snapshot = async () => {
  tickets = new Set((await database.sql<{ form_id: string; member_id: string }[]>`select form_id, member_id from form_live`).map(r => `${r.form_id}|${r.member_id}`));
};
const membership = (table: string, key: string, member: string) => table === "form_live" && tickets.has(`${key}|${member}`);

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications", "realtime"], realtime: { ...manifest.realtime, membership } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

const POST = async (request: Request) => new Response(null, { status: await events.handle(request, handlers(database.sql), { seen }) });
const noFiles = { files: async () => { throw new Error("no files"); }, drop: async () => {} };
const rows = async (formId: string) => (await database.sql<{ member_id: string }[]>`select member_id from form_live where form_id = ${formId} order by member_id`).map(r => r.member_id);

test("chest.json: a channel per form, joined through form_live; the lanes carry no feed", () => {
  assert.deepEqual(manifest.realtime.channels, [
    { name: "form:{id}", join: { table: "form_live", key: "form_id", member: "member_id" } },
    { name: "team" },
    { name: "managers", join: ["manager"] },
    { name: "mine:{member}" },
  ]);
  assert.deepEqual(manifest.realtime.feeds, [
    { table: "answers", channel: "form:{form_id}", columns: ["id"] },
    { table: "forms", channel: "form:{id}", columns: ["id"] },
  ]);
});

test("a form's channel: only who may open it joins; unsharing, the trash, a role change, a departure, an erasure take them out", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: form([q("short", "Name")], "Private " + Math.random()) });
  await forms.share(sql, asMember(ines), f.id, hugo.id, "viewer");
  // Who may open it: Inès (its owner), Hugo (shared), Camille (a manager) — never Tom.
  const mark = (await admit(sql, [f.id], ines.id))[0]!.ticket;
  assert.equal((await admit(sql, [f.id], ines.id))[0]!.ticket, mark, "let in once: the same mark");
  await admit(sql, [f.id], hugo.id);
  await admit(sql, [f.id], camille.id);
  await assert.rejects(forms.open(sql, asMember(tom), f.id), /not_found/u);
  assert.ok(!(await forms.list(sql, asMember(tom))).some(x => x.id === f.id), "never listed, so never let in");
  await snapshot();
  const screens = [tom, hugo].map(m => connect({ url: chest.realtime.url(m.id) }));
  try {
    const outcome = (screen: ReturnType<typeof connect>) => new Promise<string>(resolve => {
      const ch = screen.channel(`form:${f.id}`);
      ch.onJoined(() => resolve("joined"));
      ch.onRefused(code => resolve(code));
    });
    assert.equal(await outcome(screens[0]!), "forbidden", "Tom is refused: no answer id of a form he cannot open");
    assert.equal(await outcome(screens[1]!), "joined", "Hugo may open it: he joins");
  } finally {
    for (const screen of screens) screen.close();
  }
  assert.deepEqual(await rows(f.id), [camille.id, hugo.id, ines.id].sort());
  // Another level changes nobody's right to open it; unsharing does.
  await forms.share(sql, asMember(ines), f.id, hugo.id, "editor");
  assert.deepEqual(await rows(f.id), [camille.id, hugo.id, ines.id].sort());
  await forms.share(sql, asMember(ines), f.id, hugo.id, null);
  assert.deepEqual(await rows(f.id), [camille.id, ines.id].sort());
  // A role change (member.updated): out; a name: not.
  assert.equal(await chest.deliver({ type: "member.updated", data: { id: camille.id, changed: ["name"] } }, POST), 204);
  assert.deepEqual(await rows(f.id), [camille.id, ines.id].sort());
  assert.equal(await chest.deliver({ type: "member.updated", data: { id: camille.id, changed: ["role"] } }, POST), 204);
  assert.deepEqual(await rows(f.id), [ines.id]);
  // Losing access, leaving: out.
  await forms.share(sql, asMember(ines), f.id, lea.id, "viewer");
  await admit(sql, [f.id], lea.id);
  assert.equal(await chest.deliver({ type: "access.revoked", data: { id: lea.id } }, POST), 204);
  await admit(sql, [f.id], camille.id);
  assert.equal(await chest.deliver({ type: "member.removed", data: { id: camille.id } }, POST), 204);
  assert.deepEqual(await rows(f.id), [ines.id]);
  // The trash: nobody follows it; brought back, its owner is let in again with a new mark.
  await forms.remove(sql, asMember(ines), f.id);
  assert.deepEqual(await rows(f.id), []);
  await forms.restore(sql, asMember(ines), f.id);
  assert.notEqual((await admit(sql, [f.id], ines.id))[0]!.ticket, mark);
  // Erased: their id goes.
  assert.equal(await chest.deliver({ type: "member.erased", id: "evt_" + "q".repeat(26), data: { id: ines.id, erasure: "era_" + "q".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } }, POST), 204);
  assert.deepEqual(await rows(f.id), []);
});

test("a home's version holds its reader's marks: taken out, the page is read again (never a 304) and lets them in again", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(camille), { definition: form([q("short", "Name")], "Mine " + Math.random()) });
  await admit(sql, [f.id], camille.id);
  const before = await homeVersion(sql, asMember(camille));
  await sql`delete from form_live where member_id = ${camille.id}`;
  assert.notEqual(await homeVersion(sql, asMember(camille)), before);
});

test("what a home shows besides its forms is told without an id: a team form opening, a share, a follow-up, a new form for the managers", async () => {
  const { sql } = database;
  const told = (from: number) => chest.realtime.published.slice(from).map(p => `${p.channel} ${p.event}`);
  // A public form: made (the managers' homes), published (nobody else's).
  let from = chest.realtime.published.length;
  const name = q("short", "Name");
  const f = await forms.create(sql, asMember(ines), { definition: form([name], "Lunch " + Math.random()) });
  await forms.publish(sql, asMember(ines), f.id);
  assert.deepEqual(told(from), ["managers forms.changed"], "a public form is not every member's business");
  // Made a team form: every member's home offers it.
  from = chest.realtime.published.length;
  await forms.saveSettings(sql, asMember(ines), f.id, { audience: "team", layout: "steps", accent: "berry", once: false, watchers: [ines.id] }, null);
  assert.deepEqual(told(from), ["team forms.changed"]);
  // Shared with Hugo: his lane, no id.
  from = chest.realtime.published.length;
  await forms.share(sql, asMember(ines), f.id, hugo.id, "viewer");
  assert.deepEqual(told(from), [`mine:${hugo.id} forms.changed`]);
  // Léa's answer is followed up: her lane; the answer itself is the form's feed.
  const { form: open } = (await forms.bySlug(sql, f.slug))!;
  const { answer } = await answers.submit(sql, { form: open, version: open.version, answers: { [name.id]: "Léa" }, respondent: asMember(lea), language: "fr", ...noFiles });
  from = chest.realtime.published.length;
  await answers.follow(sql, asMember(ines), f.id, answer.id, { status: "done" });
  assert.deepEqual(told(from), [`mine:${lea.id} forms.changed`]);
  assert.ok(chest.realtime.published.every(p => p.payload === undefined || p.payload === null), "never an id");
  // Closed: the team's homes.
  from = chest.realtime.published.length;
  await forms.close(sql, asMember(ines), f.id);
  assert.deepEqual(told(from), ["team forms.changed"]);
});
