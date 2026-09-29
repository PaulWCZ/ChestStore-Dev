import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { answer } from "../lib/answers.ts";
import * as polls from "../lib/polls.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, ines, lea, sofia, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone: "Europe/Paris", now, today: "2026-10-05", known: null };
const b32 = (c: string) => c.repeat(26);

test("losing access changes nothing; leaving the Chest removes only one's drafts", async () => {
  const { sql } = database;
  const open = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Lunch?", options: ["A", "B"], open: true }, ctx);
  const draft = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Draft", options: ["A", "B"] }, ctx);
  const q = (await polls.load(sql, open.id)).questions[0]!;
  await answer(sql, asMember(sofia), open.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: sofia.id } }, POST), 204);
  assert.equal((await sql`select 1 from polls where id = ${draft.id}`).length, 1);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: sofia.id } }, POST), 204);
  assert.equal((await sql`select 1 from polls where id = ${draft.id}`).length, 0);
  // Their open poll stays open, their answer still counts.
  const view = await polls.view(sql, asMember(camille), open.id, now);
  assert.equal(view.poll.status, "open");
  assert.equal(view.poll.organiser, sofia.id);
  assert.equal(view.answers, 1);
  // An admin can still close it.
  await polls.closePoll(sql, asMember(camille), open.id, now);
});

test("an erasure unnames answers and polls, keeps them counted, and is acknowledged once", async () => {
  const { sql } = database;
  const named = await polls.createPoll(sql, asMember(camille), { kind: "date", title: "Dinner", dates: [{ day: "2026-11-20" }], open: true }, ctx);
  const anonymous = await polls.createPoll(sql, asMember(camille), { kind: "choice", title: "Pulse", options: ["Good", "Bad"], anonymous: true, open: true }, ctx);
  const byInes = await polls.createPoll(sql, asMember({ ...ines, role: "organiser" }), { kind: "choice", title: "Ines' poll", options: ["A", "B"], open: true }, ctx);
  const nq = (await polls.load(sql, named.id)).questions[0]!;
  const aq = (await polls.load(sql, anonymous.id)).questions[0]!;
  for (const p of [ines, lea, tom]) await answer(sql, asMember(p), named.id, { [nq.id]: { dates: { [nq.options[0]!.id]: 2 } } }, now);
  await answer(sql, asMember(ines), anonymous.id, { [aq.id]: { options: [aq.options[0]!.id] } }, now);
  const erasure = "era_" + b32("a");
  const event = { type: "member.erased" as const, id: "evt_" + b32("b"), data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.deepEqual(chest.acknowledged, [erasure]);
  assert.equal((await sql`select 1 from participants where member = ${ines.id}`).length, 0);
  assert.equal((await sql`select 1 from polls where organiser = ${ines.id}`).length, 0);
  assert.equal((await polls.load(sql, byInes.id)).organiser, "erased");
  // Counted, not named.
  const view = await polls.view(sql, asMember(camille), named.id, now);
  assert.equal(view.answers, 3);
  const r = view.results![0]!;
  assert.ok(r.kind === "date");
  assert.equal(r.options[0]!.yes, 3);
  assert.deepEqual(r.grid.map(g => g.member).sort(), ["erased", lea.id, tom.id].sort());
  assert.equal((await polls.view(sql, asMember(camille), anonymous.id, now)).answers, 1);
  // A second erased person in the same poll is counted apart.
  await chest.emit({ type: "member.erased", data: { id: lea.id, erasure: "era_" + b32("c"), deadline: new Date(Date.now() + 864e5).toISOString() } }, POST);
  assert.equal((await polls.view(sql, asMember(camille), named.id, now)).answers, 3);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
