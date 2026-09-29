import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { today } from "../lib/clock.ts";
import { addDays, mondayOf } from "../lib/days.ts";
import * as entries from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { lock } from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
let site: projects.Project;
let internal: projects.Project;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  site = await projects.createProject(database.sql, asMember(camille), { name: "Site", newClient: "Dupain", tasks: ["Design", "Dev"], rateCents: 9000 });
  internal = await projects.createProject(database.sql, asMember(camille), { name: "Internal", billable: false });
});
after(async () => {
  await chest.close();
  await database.close();
});

const monday = () => mondayOf(today());

test("typing in the week grid creates, changes and clears the day's entry", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  const design = site.tasks[0]!.id;
  const day = addDays(monday(), 1);
  const created = await entries.saveCell(sql, me, { projectId: site.id, taskId: design, day, minutes: 90 });
  assert.equal(created.minutes, 90);
  assert.equal((await entries.saveCell(sql, me, { projectId: site.id, taskId: design, day, minutes: 120 })).entryId, created.entryId);
  let w = await entries.week(sql, me, monday());
  const row = w.rows.find(r => r.projectId === site.id && r.taskId === design)!;
  assert.equal(row.cells[1]!.minutes, 120);
  assert.equal(w.totals[1], 120);
  assert.equal(w.total, 120);
  assert.ok(row.writable);
  const [entry] = await entries.dayEntries(sql, me, day);
  assert.equal(entry?.billable, true);
  assert.equal(entry?.source, "grid");
  // Clearing the cell deletes the entry; the row stays in the week.
  await entries.saveCell(sql, me, { projectId: site.id, taskId: design, day, minutes: 0 });
  w = await entries.week(sql, me, monday());
  assert.equal(w.rows.find(r => r.projectId === site.id && r.taskId === design)?.cells[1]?.minutes, 0);
  // A non-billable project gives non-billable entries.
  await entries.saveCell(sql, me, { projectId: internal.id, taskId: null, day, minutes: 30 });
  assert.equal((await entries.dayEntries(sql, me, day)).find(e => e.projectId === internal.id)?.billable, false);
  // Others see nothing of it.
  assert.equal((await entries.week(sql, asMember(ines), monday())).rows.length, 0);
});

test("a cell with several entries is changed in the day list", async () => {
  const { sql } = database;
  const me = asMember(ines);
  const day = addDays(monday(), 2);
  await entries.addEntry(sql, me, { projectId: site.id, day, minutes: 60, note: "Call" });
  await entries.addEntry(sql, me, { projectId: site.id, day, minutes: 30, note: "Mockups" });
  const w = await entries.week(sql, me, monday());
  assert.deepEqual(w.rows[0]!.cells[2], { minutes: 90, count: 2, entryId: null, note: "", invoiced: false });
  await assert.rejects(entries.saveCell(sql, me, { projectId: site.id, taskId: null, day, minutes: 60 }), refused("several"));
});

test("a day holds 24 hours at most, whatever the way in", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  const day = addDays(monday(), 3);
  await entries.saveCell(sql, me, { projectId: site.id, taskId: null, day, minutes: 1400 });
  await assert.rejects(entries.addEntry(sql, me, { projectId: internal.id, day, minutes: 41 }), refused("day_full"));
  await assert.rejects(entries.saveCell(sql, me, { projectId: internal.id, taskId: null, day, minutes: 60 }), refused("day_full"));
  await entries.addEntry(sql, me, { projectId: internal.id, day, minutes: 40 });
  // Two at once cannot overflow it either (one waits for the other).
  const day2 = addDays(monday(), 4);
  const results = await Promise.allSettled([
    entries.addEntry(sql, me, { projectId: site.id, day: day2, minutes: 800 }),
    entries.addEntry(sql, me, { projectId: internal.id, day: day2, minutes: 800 }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});

test("entries are checked on the server and belong to their author", async () => {
  const { sql } = database;
  const me = asMember(ines);
  const day = today();
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day, minutes: 0 }), refused("bad_duration"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day, minutes: 1441 }), refused("bad_duration"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day, minutes: "60" }), refused("bad_duration"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day: "2026-02-30", minutes: 60 }), refused("invalid"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day: "1999-12-31", minutes: 60 }), refused("invalid"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day: addDays(day, 400), minutes: 60 }), refused("invalid"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day, minutes: 60, note: "x".repeat(501) }), refused("too_long"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: "nope", day, minutes: 60 }), refused("not_found"));
  await assert.rejects(entries.addEntry(sql, asMember(nora), { projectId: site.id, day, minutes: 60 }), refused("forbidden"));
  await assert.rejects(entries.addEntry(sql, null, { projectId: site.id, day, minutes: 60 }), refused("forbidden"));
  const mine = await entries.addEntry(sql, me, { projectId: site.id, taskId: site.tasks[1]!.id, day, minutes: 45, note: "  Header\r\nfix " });
  assert.equal(mine.note, "Header\nfix");
  await assert.rejects(entries.updateEntry(sql, asMember(hugo), mine.id, { projectId: site.id, day, minutes: 60 }), refused("not_found"));
  await assert.rejects(entries.deleteEntry(sql, asMember(hugo), mine.id), refused("not_found"));
  await assert.rejects(entries.restoreEntries(sql, asMember(hugo), [mine.id]), refused("not_found"));
  const changed = await entries.updateEntry(sql, me, mine.id, { projectId: internal.id, day, minutes: 50, note: "Moved", billable: true });
  assert.equal(changed.projectId, internal.id);
  assert.equal(changed.taskId, null);
  assert.equal(changed.billable, false);
  await entries.deleteEntry(sql, me, mine.id);
  assert.ok(!(await entries.dayEntries(sql, me, day)).some(e => e.id === mine.id));
  assert.equal(await entries.restoreEntries(sql, me, [mine.id]), 1);
  assert.ok((await entries.dayEntries(sql, me, day)).some(e => e.id === mine.id));
});

test("a project not open to someone, or closed, takes no new time from them", async () => {
  const { sql } = database;
  const secret = await projects.createProject(sql, asMember(camille), { name: "Secret", everyone: false, people: [ines.id] });
  await assert.rejects(entries.addEntry(sql, asMember(hugo), { projectId: secret.id, day: today(), minutes: 60 }), refused("not_offered"));
  const e = await entries.addEntry(sql, asMember(ines), { projectId: secret.id, day: today(), minutes: 60 });
  await projects.archiveProject(sql, asMember(camille), secret.id, true);
  await assert.rejects(entries.saveCell(sql, asMember(ines), { projectId: secret.id, taskId: null, day: today(), minutes: 30 }), refused("not_offered"));
  const w = await entries.week(sql, asMember(ines), today());
  assert.equal(w.rows.find(r => r.projectId === secret.id)?.writable, false);
  // Her past time stays hers to correct (the note), on the same project.
  const fixed = await entries.updateEntry(sql, asMember(ines), e.id, { projectId: secret.id, day: today(), minutes: 60, note: "Typo fixed" });
  assert.equal(fixed.note, "Typo fixed");
  await projects.archiveProject(sql, asMember(camille), secret.id, false);
});

test("nothing changes in a locked period, and the reason is a code the page explains", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  const old = addDays(monday(), -7);
  const e = await entries.addEntry(sql, me, { projectId: site.id, day: old, minutes: 60 });
  await assert.rejects(lock(sql, me, old), refused("forbidden"));
  await assert.rejects(lock(sql, asMember(camille), addDays(today(), 1)), refused("future"));
  await lock(sql, asMember(camille), addDays(old, 1));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day: old, minutes: 60 }), refused("locked"));
  await assert.rejects(entries.updateEntry(sql, me, e.id, { projectId: site.id, day: old, minutes: 90 }), refused("locked"));
  await assert.rejects(entries.updateEntry(sql, me, e.id, { projectId: site.id, day: today(), minutes: 60 }), refused("locked"));
  await assert.rejects(entries.deleteEntry(sql, me, e.id), refused("locked"));
  await assert.rejects(entries.saveCell(sql, me, { projectId: site.id, taskId: null, day: old, minutes: 30 }), refused("locked"));
  await assert.rejects(entries.removeRow(sql, me, { week: old, projectId: site.id, taskId: null }), refused("locked"));
  assert.equal((await entries.dayEntries(sql, me, old))[0]?.locked, true);
  // A later day can still move into... no: nor out of a locked day into an open one.
  const fresh = await entries.addEntry(sql, me, { projectId: site.id, day: today(), minutes: 10 });
  await assert.rejects(entries.updateEntry(sql, me, fresh.id, { projectId: site.id, day: old, minutes: 10 }), refused("locked"));
  await lock(sql, asMember(camille), null);
  await entries.deleteEntry(sql, me, e.id);
});

test("rows: added, copied from last week, removed with their time and brought back", async () => {
  const { sql } = database;
  const me = asMember(camille);
  const last = addDays(monday(), -7);
  await entries.addRow(sql, me, { week: last, projectId: site.id, taskId: site.tasks[0]!.id });
  await entries.saveCell(sql, me, { projectId: internal.id, taskId: null, day: addDays(last, 2), minutes: 120 });
  assert.equal(await entries.copyLastWeek(sql, me, monday()), 2);
  assert.equal(await entries.copyLastWeek(sql, me, monday()), 0);
  let w = await entries.week(sql, me, monday());
  assert.equal(w.rows.length, 2);
  assert.equal(w.total, 0);
  await entries.saveCell(sql, me, { projectId: internal.id, taskId: null, day: monday(), minutes: 60 });
  const removed = await entries.removeRow(sql, me, { week: monday(), projectId: internal.id, taskId: null });
  assert.equal(removed.length, 1);
  w = await entries.week(sql, me, monday());
  assert.deepEqual(w.rows.map(r => r.projectId), [site.id]);
  await entries.restoreEntries(sql, me, removed);
  w = await entries.week(sql, me, monday());
  assert.equal(w.total, 60);
  await assert.rejects(entries.addRow(sql, asMember(hugo), { week: monday(), projectId: "999999", taskId: null }), refused("not_found"));
  assert.equal((await entries.weekMinutes(sql, camille.id, addDays(monday(), 6))), 60);
  assert.deepEqual(await entries.lastWork(sql, me), { projectId: internal.id, taskId: null });
});
