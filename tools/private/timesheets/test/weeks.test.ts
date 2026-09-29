import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { today } from "../lib/clock.ts";
import { addDays, mondayOf } from "../lib/days.ts";
import * as entries from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { saveChoices } from "../lib/settings.ts";
import { startTimer } from "../lib/timer.ts";
import * as weeks from "../lib/weeks.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora, tom } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
let site: projects.Project;
const thisWeek = mondayOf(today());
const lastWeek = addDays(thisWeek, -7);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  site = await projects.createProject(database.sql, asMember(camille), { name: "Site", rateCents: 9000 });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a person submits their week; it waits read-only; the managers' bell says so; taken back, it opens", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  const entry = await entries.addEntry(sql, me, { projectId: site.id, day: lastWeek, minutes: 480, note: "Home page" });
  await entries.saveCell(sql, me, { projectId: site.id, taskId: null, day: addDays(lastWeek, 1), minutes: 420 });
  const state = await weeks.submitWeek(sql, me, addDays(lastWeek, 3));
  assert.equal(state.status, "submitted");
  assert.equal(state.minutes, 900);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.key, n.path]), [
    [camille.id, `Hugo Bernard a envoyé sa semaine du ${frDay(lastWeek)} (15:00)`, `approve:${hugo.id}:${lastWeek}`, `/chest/team/${hugo.id}?week=${lastWeek}`],
  ]);
  // Nothing of that week changes now, by any path.
  await assert.rejects(entries.saveCell(sql, me, { projectId: site.id, taskId: null, day: addDays(lastWeek, 2), minutes: 60 }), refused("week_submitted"));
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day: addDays(lastWeek, 4), minutes: 60 }), refused("week_submitted"));
  await assert.rejects(entries.updateEntry(sql, me, entry.id, { projectId: site.id, day: lastWeek, minutes: 60 }), refused("week_submitted"));
  await assert.rejects(entries.updateEntry(sql, me, entry.id, { projectId: site.id, day: thisWeek, minutes: 480 }), refused("week_submitted"));
  await assert.rejects(entries.deleteEntry(sql, me, entry.id), refused("week_submitted"));
  await assert.rejects(entries.setNote(sql, me, entry.id, "Other"), refused("week_submitted"));
  await assert.rejects(entries.removeRow(sql, me, { week: lastWeek, projectId: site.id, taskId: null }), refused("week_submitted"));
  assert.ok((await entries.dayEntries(sql, me, lastWeek)).every(e => e.locked));
  assert.equal((await entries.week(sql, me, lastWeek)).state.status, "submitted");
  // Sent twice: refused; others' weeks are theirs.
  await assert.rejects(weeks.submitWeek(sql, me, lastWeek), refused("week_state"));
  await assert.rejects(weeks.submitWeek(sql, me, addDays(thisWeek, 7)), refused("week_future"));
  await assert.rejects(weeks.submitWeek(sql, asMember(nora), lastWeek), refused("forbidden"));
  // Taken back: it opens again, and the managers' item goes.
  await weeks.withdrawWeek(sql, me, lastWeek);
  assert.equal(chest.notifications.length, 0);
  await entries.setNote(sql, me, entry.id, "Home page and footer");
  await assert.rejects(weeks.withdrawWeek(sql, me, lastWeek), refused("week_state"));
});

test("a manager approves (it locks) or sends back with a word (it opens); the person's bell says which", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  await weeks.submitWeek(sql, me, lastWeek);
  const waiting = await weeks.waiting(sql, asMember(camille));
  assert.deepEqual(waiting.map(w => [w.memberId, w.week, w.minutes, w.billableMinutes]), [[hugo.id, lastWeek, 900, 900]]);
  await assert.rejects(weeks.waiting(sql, me), refused("forbidden"));
  await assert.rejects(weeks.approveWeek(sql, me, hugo.id, lastWeek), refused("forbidden"));
  await assert.rejects(weeks.approveWeek(sql, asMember(camille), ines.id, lastWeek), refused("week_state"));
  await assert.rejects(weeks.approveWeek(sql, asMember(camille), "robert", lastWeek), refused("not_found"));
  // 15:00 of a 35:00 week: said on the line, and approved only on purpose.
  assert.deepEqual(waiting[0]!.fullness, { over: true, minutes: 900, capacity: 2100, short: true });
  await assert.rejects(weeks.approveWeek(sql, asMember(camille), hugo.id, lastWeek), refused("week_short"));
  assert.equal((await weeks.weekState(sql, hugo.id, lastWeek)).status, "submitted");
  const approved = await weeks.approveWeek(sql, asMember(camille), hugo.id, lastWeek, { anyway: true });
  assert.equal(approved.status, "approved");
  assert.equal(approved.decidedBy, camille.id);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.key]), [[hugo.id, `Your week of ${enDay(lastWeek)} is approved`, `approval:${lastWeek}`]]);
  await assert.rejects(entries.addEntry(sql, me, { projectId: site.id, day: lastWeek, minutes: 30 }), refused("week_approved"));
  await assert.rejects(weeks.withdrawWeek(sql, me, lastWeek), refused("week_state"));
  // Sent back, even once approved: with a word, which the person reads.
  await assert.rejects(weeks.returnWeek(sql, asMember(camille), hugo.id, lastWeek, "  "), refused("empty"));
  const back = await weeks.returnWeek(sql, asMember(camille), hugo.id, lastWeek, "Tuesday is missing the client meeting");
  assert.equal(back.status, "returned");
  assert.equal(back.reason, "Tuesday is missing the client meeting");
  const item = chest.notifications.find(n => n.key === `approval:${lastWeek}`)!;
  assert.equal(item.title, `Your week of ${enDay(lastWeek)} was sent back`);
  assert.equal(item.body, "Tuesday is missing the client meeting");
  assert.equal((await weeks.weekState(sql, hugo.id, lastWeek)).reason, "Tuesday is missing the client meeting");
  await entries.addEntry(sql, me, { projectId: site.id, day: addDays(lastWeek, 1), minutes: 60, note: "Client meeting" });
  const again = await weeks.submitWeek(sql, me, lastWeek);
  assert.deepEqual([again.status, again.minutes, again.reason], ["submitted", 960, ""]);
  await assert.rejects(weeks.returnWeek(sql, me, hugo.id, lastWeek, "no"), refused("forbidden"));
});

test("this week sent (off on Friday): the timer cannot run into it", async () => {
  const { sql } = database;
  await weeks.submitWeek(sql, asMember(ines), thisWeek);
  await assert.rejects(startTimer(sql, asMember(ines), { projectId: site.id }), refused("week_submitted"));
  await weeks.withdrawWeek(sql, asMember(ines), thisWeek);
  await startTimer(sql, asMember(ines), { projectId: site.id });
});

test("the team's weeks against each usual week; Remind rings those short of it, not those who sent theirs", async () => {
  const { sql } = database;
  const m = asMember(camille);
  await weeks.setCapacity(sql, m, tom.id, 600);
  await assert.rejects(weeks.setCapacity(sql, asMember(hugo), tom.id, 600), refused("forbidden"));
  await assert.rejects(weeks.setCapacity(sql, m, tom.id, -1), refused("invalid"));
  await entries.addEntry(sql, asMember(tom), { projectId: site.id, day: lastWeek, minutes: 540 });
  await entries.addEntry(sql, asMember(ines), { projectId: site.id, day: lastWeek, minutes: 600 });
  const rows = await weeks.teamWeeks(sql, m, [hugo.id, ines.id, tom.id], [lastWeek, thisWeek]);
  assert.deepEqual(rows.map(r => [r.memberId, r.capacity, r.weeks.map(w => [w.minutes, w.status])]), [
    [hugo.id, 2100, [[960, "submitted"], [0, "open"]]],
    [ines.id, 2100, [[600, "open"], [0, "open"]]],
    [tom.id, 600, [[540, "open"], [0, "open"]]],
  ]);
  chest.notifications.length = 0;
  assert.equal(await weeks.remind(sql, m, [hugo.id, ines.id, tom.id], lastWeek), 2);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.key]).sort(), [
    [ines.id, `Votre semaine du ${frDay(lastWeek)} compte 10:00 sur 35:00 — compléter le reste ?`, `remind:${lastWeek}`],
    [tom.id, `Your week of ${enDay(lastWeek)} has 9:00 of 10:00 — fill in the rest?`, `remind:${lastWeek}`],
  ].sort());
  // Reminded again: the same item, replaced, not a second one.
  await weeks.remind(sql, m, [ines.id], lastWeek);
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 1);
  await weeks.setCapacity(sql, m, tom.id, null);
  assert.equal((await weeks.capacities(sql, [tom.id])).get(tom.id), 2100);
  await assert.rejects(weeks.remind(sql, asMember(hugo), [ines.id], lastWeek), refused("forbidden"));
  await assert.rejects(weeks.remind(sql, m, ["x"], lastWeek), refused("not_found"));
});

test("with approvals turned off, nobody submits; weeks waiting open again", async () => {
  const { sql } = database;
  await weeks.submitWeek(sql, asMember(tom), lastWeek);
  await assert.rejects(saveChoices(sql, asMember(hugo), { approvals: false }), refused("forbidden"));
  await saveChoices(sql, asMember(camille), { approvals: false });
  assert.equal((await weeks.weekState(sql, tom.id, lastWeek)).status, "open");
  assert.equal((await weeks.weekState(sql, hugo.id, lastWeek)).status, "open");
  assert.ok(!chest.notifications.some(n => n.key?.startsWith("approve:")));
  await assert.rejects(weeks.submitWeek(sql, asMember(ines), lastWeek), refused("forbidden"));
  await saveChoices(sql, asMember(camille), { approvals: true });
});

const enDay = (day: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(day + "T00:00:00Z"));
const frDay = (day: string) => new Intl.DateTimeFormat("fr", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(day + "T00:00:00Z"));

test("approving: a week not over is never approved by the bulk way; a full, finished week is", async () => {
  const { sql } = database;
  const m = asMember(camille);
  // Tom sends this week on its Monday with a whole usual week in it: still not over.
  await weeks.setCapacity(sql, m, tom.id, 480);
  await entries.addEntry(sql, asMember(tom), { projectId: site.id, day: thisWeek, minutes: 480 });
  await weeks.submitWeek(sql, asMember(tom), thisWeek);
  const line = (await weeks.waiting(sql, m)).find(w => w.memberId === tom.id && w.week === thisWeek)!;
  assert.deepEqual([line.fullness.over, line.fullness.short, weeks.needsLook(line.fullness)], [false, false, true]);
  await assert.rejects(weeks.approveWeek(sql, m, tom.id, thisWeek), refused("week_short"));
  await weeks.withdrawWeek(sql, asMember(tom), thisWeek);
  // Two weeks ago, full: approved at once.
  const before = addDays(lastWeek, -7);
  await entries.addEntry(sql, asMember(tom), { projectId: site.id, day: before, minutes: 480 });
  await weeks.submitWeek(sql, asMember(tom), before);
  assert.equal((await weeks.approveWeek(sql, m, tom.id, before)).status, "approved");
  assert.equal(weeks.needsLook(weeks.fullness(before, 480, 480, today())), false);
  await weeks.setCapacity(sql, m, tom.id, null);
});

test("the team's weeks start with each person: weeks before their first time (or first visit) and before the tool are not short, and nobody is reminded of them", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const old = addDays(thisWeek, -70);
  // The tool's start: its first project or entry (weeks ago here).
  const start = await weeks.toolStart(sql);
  assert.ok(start !== null && start <= lastWeek);
  const starts = await weeks.startWeeks(sql, [hugo.id, camille.id]);
  assert.equal(starts.get(hugo.id), lastWeek); // his first entry
  assert.equal(starts.get(camille.id), start); // no entry, never seen: the tool's start
  let rows = await weeks.teamWeeks(sql, m, [hugo.id, camille.id], [old, lastWeek]);
  // Long before anyone recorded anything: "before", not short.
  assert.deepEqual(rows.map(r => r.weeks[0]!.before), [true, true]);
  assert.equal(weeks.isShort(rows[1]!.weeks[0]!, rows[1]!.capacity), false);
  // Camille never recorded time: counted from the tool's start, so last week is short…
  assert.equal(weeks.isShort(rows[1]!.weeks[1]!, rows[1]!.capacity), true);
  // …until the tool knows she only arrived this week (her first visit).
  await weeks.seenNow(sql, camille.id);
  await weeks.seenNow(sql, camille.id); // once: a later visit changes nothing
  assert.equal((await weeks.startWeeks(sql, [camille.id])).get(camille.id), thisWeek);
  rows = await weeks.teamWeeks(sql, m, [camille.id], [lastWeek]);
  assert.deepEqual([rows[0]!.weeks[0]!.before, weeks.isShort(rows[0]!.weeks[0]!, rows[0]!.capacity)], [true, false]);
  assert.equal(await weeks.remind(sql, m, [camille.id], lastWeek), 0);
  // Remind for a week before a person's start rings nobody.
  chest.notifications.length = 0;
  assert.equal(await weeks.remind(sql, m, [hugo.id, camille.id], old), 0);
  assert.equal(chest.notifications.length, 0);
});

test("an empty tool: no start, no week expected of anyone", async () => {
  const fresh = await testDatabase();
  try {
    const m = asMember(camille);
    assert.equal(await weeks.toolStart(fresh.sql), null);
    const rows = await weeks.teamWeeks(fresh.sql, m, [hugo.id, ines.id], [lastWeek, thisWeek]);
    assert.ok(rows.every(r => r.start === null && r.weeks.every(w => w.before)));
    assert.equal(await weeks.remind(fresh.sql, m, [hugo.id, ines.id], lastWeek), 0);
  } finally {
    await fresh.close();
  }
});
