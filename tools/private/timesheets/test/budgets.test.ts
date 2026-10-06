import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { addDays, mondayOf, todayIn } from "../src/shared/days.ts";
import * as entries from "../src/lib/entries.ts";
import { markInvoiced, unmarkInvoiced } from "../src/lib/invoicing.ts";
import * as projects from "../src/lib/projects.ts";
import { report } from "../src/lib/reports.ts";
import { setRate } from "../src/lib/rates.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, seen } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
// The fake Chest's day (its zone, UTC, is the test database's too).
const monday = mondayOf(todayIn("UTC"));
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("crossing 80 % then 100 % of a budget rings the managers once each; back under, it may ring again", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, asMember(camille), { name: "Signage", budget: { kind: "hours", minutes: 600 } });
  const me = asMember(hugo);
  await entries.addEntry(sql, me, { projectId: p.id, day: monday, minutes: 420 });
  assert.equal(chest.notifications.length, 0);
  const cell = await entries.saveCell(sql, me, { projectId: p.id, taskId: null, day: addDays(monday, 1), minutes: 90 });
  assert.deepEqual(chest.notifications.map(n => [n.member, seen(n).title, n.key, n.path]), [[camille.id, "Signage a consommé 85 % de son budget", `budget:${p.id}`, `/chest/projects/${p.id}`]]);
  await entries.saveCell(sql, me, { projectId: p.id, taskId: null, day: addDays(monday, 1), minutes: 100 });
  assert.equal(chest.notifications.length, 1);
  await entries.saveCell(sql, me, { projectId: p.id, taskId: null, day: addDays(monday, 1), minutes: 200 });
  assert.deepEqual(chest.notifications.map(n => seen(n).title), ["Signage dépasse son budget : 103 %"]);
  // Back under 80 % (time removed), then over it again: a new warning.
  await entries.saveCell(sql, me, { projectId: p.id, taskId: null, day: addDays(monday, 1), minutes: 0 });
  assert.equal((await sql`select 1 from budget_alerts where project_id = ${p.id}`).length, 0);
  chest.notifications.length = 0;
  await entries.saveCell(sql, me, { projectId: p.id, taskId: null, day: addDays(monday, 1), minutes: 60 });
  assert.equal(chest.notifications.length, 1);
  assert.ok(cell.entryId);
});

test("a money budget counts the billable amount; raising the budget clears the warning", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const p = await projects.createProject(sql, asMember(camille), { name: "Brand", rateCents: 10000, budget: { kind: "money", cents: 100000 } });
  await entries.addEntry(sql, asMember(ines), { projectId: p.id, day: monday, minutes: 600 });
  assert.deepEqual(chest.notifications.map(n => seen(n).title), ["Brand dépasse son budget : 100 %"]);
  await projects.updateProject(sql, asMember(camille), p.id, { name: "Brand", rateCents: 10000, budget: { kind: "money", cents: 500000 } });
  assert.equal((await sql`select 1 from budget_alerts where project_id = ${p.id}`).length, 0);
});

test("billable time is marked invoiced: it locks, keeps its rates, leaves 'not invoiced'; Undo puts it back", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const p = await projects.createProject(sql, m, { name: "Invoiced", rateCents: 5000 });
  const a = await entries.addEntry(sql, asMember(hugo), { projectId: p.id, day: addDays(monday, 2), minutes: 60 });
  await entries.addEntry(sql, asMember(hugo), { projectId: p.id, day: addDays(monday, 2), minutes: 30, billable: false });
  const q = { from: monday, to: addDays(monday, 6), projectId: p.id };
  let r = await report(sql, m, { ...q, billable: "uninvoiced" });
  assert.deepEqual([r.minutes, r.uninvoiced, r.unnoted], [60, 1, 1]);
  await assert.rejects(markInvoiced(sql, asMember(hugo), q), refused("forbidden"));
  const marked = await markInvoiced(sql, m, q);
  assert.deepEqual(marked, { ids: [a.id], fixed: [a.id] });
  assert.equal((await report(sql, m, { ...q, billable: "uninvoiced" })).minutes, 0);
  await assert.rejects(entries.updateEntry(sql, asMember(hugo), a.id, { projectId: p.id, day: a.day, minutes: 90 }), refused("invoiced"));
  await assert.rejects(entries.deleteEntry(sql, asMember(hugo), a.id), refused("invoiced"));
  await assert.rejects(entries.saveCell(sql, asMember(hugo), { projectId: p.id, taskId: null, day: a.day, minutes: 10 }), refused("several"));
  assert.ok((await entries.dayEntries(sql, asMember(hugo), a.day)).find(e => e.id === a.id)?.locked);
  // A later rate change does not move invoiced time, even from before its day.
  await setRate(sql, m, { kind: "bill", projectId: p.id, cents: 9000, from: monday });
  r = await report(sql, m, { ...q });
  assert.equal(r.cents, 5000);
  // Undo: back as it was, at the rates in force.
  assert.equal(await unmarkInvoiced(sql, m, marked), 1);
  assert.equal((await report(sql, m, { ...q })).cents, 9000);
  await assert.rejects(unmarkInvoiced(sql, m, { ids: "all" }), refused("invalid"));
  await assert.rejects(unmarkInvoiced(sql, asMember(hugo), marked), refused("forbidden"));
});

test("the grid's note: written on the cell's entry, only one's own", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, asMember(camille), { name: "Notes" });
  const cell = await entries.saveCell(sql, asMember(hugo), { projectId: p.id, taskId: null, day: monday, minutes: 60 });
  await entries.setNote(sql, asMember(hugo), cell.entryId, "Checkout page");
  const w = await entries.week(sql, asMember(hugo), monday);
  assert.equal(w.rows.find(r => r.projectId === p.id)!.cells[0]!.note, "Checkout page");
  await assert.rejects(entries.setNote(sql, asMember(ines), cell.entryId, "Mine"), refused("not_found"));
  await assert.rejects(entries.setNote(sql, asMember(hugo), cell.entryId, "x".repeat(501)), refused("too_long"));
  // Changing the minutes keeps the note.
  await entries.saveCell(sql, asMember(hugo), { projectId: p.id, taskId: null, day: monday, minutes: 90 });
  assert.equal((await entries.dayEntries(sql, asMember(hugo), monday)).find(e => e.projectId === p.id)?.note, "Checkout page");
});
