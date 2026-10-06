import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as events from "@argentic/chest-sdk/events";
import { seen } from "@argentic/chest-app/db";
import { handlers } from "../src/lib/lifecycle.ts";
import * as answers from "../src/lib/answers.ts";
import * as forms from "../src/lib/forms.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

// The tool's /chest-events, as src/app.tsx answers it.
const POST = async (request: Request) => new Response(null, { status: await events.handle(request, handlers(database.sql), { seen }) });
const noFiles = { files: async () => { throw new Error("no files"); }, drop: async () => {} };
const erasure = (id: string, n: string) => ({ type: "member.erased" as const, id: "evt_" + n.repeat(26), data: { id, erasure: "era_" + n.repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } });

test("losing access takes a member off shared forms and the bell; their own forms stay for the managers", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: form([q("short", "Name")], "Mine") });
  await forms.share(sql, asMember(ines), f.id, hugo.id, "editor");
  await forms.saveSettings(sql, asMember(ines), f.id, { audience: "public", layout: "steps", accent: "berry", watchers: [ines.id, hugo.id] }, null);
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: hugo.id } }, POST), 204);
  assert.deepEqual(await forms.team(sql, f.id), { owner: ines.id, shared: [], watchers: [ines.id] });
  assert.equal(await chest.emit({ type: "member.removed", data: { id: ines.id } }, POST), 204);
  assert.equal((await forms.open(sql, asMember(camille), f.id)).form.owner, ines.id, "a manager still opens it");
});

test("an erasure deletes the person's team answers, keeps anonymous counts unnamed, and is acknowledged once", async () => {
  const { sql } = database;
  const note = q("short", "Note", { required: true });
  const named = await forms.create(sql, asMember(camille), { definition: form([note], "Named"), settings: { audience: "team" } });
  await forms.publish(sql, asMember(camille), named.id);
  const anon = await forms.create(sql, asMember(camille), { definition: form([note], "Anon"), settings: { audience: "team", anonymous: true } });
  await forms.publish(sql, asMember(camille), anon.id);
  const owned = await forms.create(sql, asMember(camille), { definition: form([note], "Owned") });
  const n = (await forms.bySlug(sql, named.slug))!.form, a = (await forms.bySlug(sql, anon.slug))!.form;
  for (const who of [hugo, lea]) {
    await answers.submit(sql, { form: n, version: 1, answers: { [note.id]: "from " + who.firstName }, respondent: asMember(who), language: "en", ...noFiles });
    await answers.submit(sql, { form: a, version: 1, answers: { [note.id]: "anon" }, respondent: asMember(who), language: "en", ...noFiles });
  }
  await sql`update forms set owner = ${hugo.id} where id = ${owned.id}`;
  const event = erasure(hugo.id, "h");
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204, "a second delivery is harmless");
  const left = await sql<{ respondent: string | null }[]>`select respondent from answers where form_id = ${n.id}`;
  assert.deepEqual(left.map(r => r.respondent), [lea.id]);
  assert.equal((await sql`select 1 from answers where form_id = ${a.id}`).length, 2, "anonymous answers name no one: they stay");
  assert.deepEqual((await sql<{ member: string }[]>`select member from participants where form_id = ${a.id} order by member`).map(p => p.member), ["erased", lea.id].sort());
  assert.equal((await sql<{ owner: string }[]>`select owner from forms where id = ${owned.id}`)[0]!.owner, "erased");
  assert.equal(JSON.stringify(await sql`select * from forms`).includes(hugo.id), false);
  assert.deepEqual(chest.acknowledged, ["era_" + "h".repeat(26)]);
  assert.equal((await forms.open(sql, asMember(camille), n.id)).form.answerCount, 1);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
