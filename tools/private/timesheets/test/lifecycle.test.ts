import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/calls.ts";
import { clock, today, zone } from "../src/lib/clock.ts";
import { addDays, mondayOf, wall } from "../src/shared/days.ts";
import { addEntry, addRow, dayEntries, week } from "../src/lib/entries.ts";
import * as projects from "../src/lib/projects.ts";
import { nameFor, people } from "../src/lib/people.ts";
import { report } from "../src/lib/reports.ts";
import { lock, settings } from "../src/lib/settings.ts";
import { startTimer, timer } from "../src/lib/timer.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let secret: projects.Project;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  secret = await projects.createProject(database.sql, asMember(camille), { name: "Secret", everyone: false, people: [hugo.id, ines.id, tom.id] });
});
after(async () => {
  await chest.close();
  await database.close();
});
afterEach(() => {
  clock.now = () => new Date();
});

const event = (type: "access.revoked" | "member.removed" | "member.erased", id: string, n: string) =>
  type === "member.erased"
    ? { type, id: "evt_" + n.repeat(26), data: { id, erasure: "era_" + n.repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } }
    : { type, id: "evt_" + n.repeat(26), data: { id } };

test("someone who leaves: their timer stops into an entry, they leave the projects, their time stays", async () => {
  const { sql } = database;
  const day = today();
  await addEntry(sql, asMember(hugo), { projectId: secret.id, day, minutes: 60, note: "Kept" });
  await addRow(sql, asMember(hugo), { week: day, projectId: secret.id, taskId: null });
  clock.now = () => new Date(Date.now() - 30 * 60_000);
  await startTimer(sql, asMember(hugo), { projectId: secret.id, note: "Running" });
  clock.now = () => new Date();
  await sql`update projects set lead_id = ${hugo.id} where id = ${secret.id}`;
  assert.equal(await chest.emit(event("member.removed", hugo.id, "b"), POST), 204);
  assert.equal(await chest.emit(event("member.removed", hugo.id, "b"), POST), 204);
  assert.equal(await timer(sql, asMember(hugo)), null);
  // The timer's entry belongs to the day it started (yesterday, just after midnight).
  const startDay = wall(Date.now() - 30 * 60_000, zone()).day;
  assert.ok((await dayEntries(sql, asMember(hugo), day)).some(e => e.note === "Kept"));
  assert.ok((await dayEntries(sql, asMember(hugo), startDay)).some(e => e.note === "Running" && e.source === "timer"));
  assert.equal((await projects.project(sql, asMember(camille), secret.id)).people.includes(hugo.id), false);
  // The project they led goes back to every manager.
  assert.equal((await projects.project(sql, asMember(camille), secret.id)).lead, null);
  // Their grid rows went; their time is in the reports.
  assert.ok((await week(sql, asMember(hugo), mondayOf(day))).rows.every(r => r.cells.some(c => c.minutes > 0)));
  const r = await report(sql, asMember(camille), { from: day, to: day, group: "person" });
  assert.ok(r.lines.some(l => l.memberId === hugo.id));
});

test("a forgotten timer of someone who lost access is dropped, not recorded", async () => {
  const { sql } = database;
  clock.now = () => new Date(Date.now() - 12 * 3600_000);
  await startTimer(sql, asMember(tom), { projectId: secret.id });
  clock.now = () => new Date();
  assert.equal(await chest.emit(event("access.revoked", tom.id, "c"), POST), 204);
  assert.equal(await timer(sql, asMember(tom)), null);
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from entries where member_id = ${tom.id}`;
  assert.equal(row?.n, 0);
});

test("an erasure keeps the time for the company, anonymous and without notes, and is acknowledged once", async () => {
  const { sql } = database;
  const day = addDays(today(), -1);
  await addEntry(sql, asMember(ines), { projectId: secret.id, day, minutes: 90, note: "Called Mrs Dupain about her divorce" });
  await lock(sql, asMember(camille), addDays(today(), -30));
  const e = event("member.erased", ines.id, "d");
  assert.equal(await chest.emit(e, POST), 204);
  assert.equal(await chest.emit(e, POST), 204);
  assert.deepEqual(chest.acknowledged, ["era_" + "d".repeat(26)]);
  const rows = await sql<{ member_id: string; note: string; minutes: number }[]>`select member_id, note, minutes from entries where day = ${day} and member_id <> ${hugo.id}`;
  assert.deepEqual([...rows], [{ member_id: "erased", note: "", minutes: 90 }]);
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from entries where member_id = ${ines.id}`;
  assert.equal(left?.n, 0);
  const r = await report(sql, asMember(camille), { from: day, to: day, group: "person" });
  assert.deepEqual(r.lines.filter(l => l.memberId !== hugo.id).map(l => [l.memberId, l.minutes]), [["erased", 90]]);
  assert.equal((await projects.project(sql, asMember(camille), secret.id)).people.includes(ines.id), false);
  // The one who locked the period, erased: the lock stays, anonymous.
  assert.equal(await chest.emit(event("member.erased", camille.id, "e"), POST), 204);
  const s = await settings(sql);
  assert.equal(s.lockedBy, "erased");
  assert.notEqual(s.lockedUntil, null);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});

test("someone who left the Chest reads as a former member, with the day they left (studio.15)", async () => {
  const at = chest.members.findIndex(m => m.id === hugo.id);
  const [gone] = chest.members.splice(at, 1);
  chest.former.push({ id: hugo.id, name: hugo.name, leftAt: "2026-09-30T08:00:00.000Z" });
  chest.clearCaches();
  try {
    const found = (await people([hugo.id])).get(hugo.id);
    assert.deepEqual(found && [found.status, found.leftAt, nameFor(hugo.id, new Map([[hugo.id, found]]), "en")], ["former", "2026-09-30T08:00:00.000Z", "Hugo Bernard (former member)"]);
  } finally {
    chest.former.splice(chest.former.findIndex(f => f.id === hugo.id), 1);
    chest.members.splice(at, 0, gone!);
    chest.clearCaches();
  }
});
