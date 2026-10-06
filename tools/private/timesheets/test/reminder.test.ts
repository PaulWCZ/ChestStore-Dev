import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestSchedules as POST } from "../src/calls.ts";
import { addDays, mondayOf, todayIn } from "../src/shared/days.ts";
import { addEntry } from "../src/lib/entries.ts";
import * as projects from "../src/lib/projects.ts";
import { saveReminder } from "../src/lib/settings.ts";
import { submitWeek } from "../src/lib/weeks.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, tom } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase({ timeZone: "Europe/Paris" });
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications"], chest: { timeZone: "Europe/Paris" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

// Before anything: a tool with no project nor entry expects nothing of
// anyone (the Team page shows no week as short either).
test("an empty tool reminds nobody on Friday", async () => {
  const friday = addDays(mondayOf(todayIn("Europe/Paris")), 4);
  assert.equal(await chest.run("friday", POST, { scheduledAt: new Date(`${friday}T13:30:00Z`).toISOString() }), 204);
  assert.equal(chest.notifications.length, 0);
  assert.equal(chest.outbox.length, 0);
});

test("on Friday, whoever has a short week gets one notice, in every language; delivered twice, still one; no mail", async () => {
  const { sql } = database;
  const friday = addDays(mondayOf(todayIn("Europe/Paris")), 4);
  const p = await projects.createProject(sql, asMember(camille), { name: "Site" });
  await addEntry(sql, asMember(ines), { projectId: p.id, day: addDays(friday, -4), minutes: 600 });
  await addEntry(sql, asMember(ines), { projectId: p.id, day: addDays(friday, -3), minutes: 690 });
  for (let i = 0; i < 5; i++) await addEntry(sql, asMember(camille), { projectId: p.id, day: addDays(friday, -i), minutes: 7 * 60 + 30 });
  await addEntry(sql, asMember(hugo), { projectId: p.id, day: addDays(friday, -7), minutes: 600 }); // last week's
  const scheduledAt = new Date(`${friday}T13:30:00Z`).toISOString();
  assert.equal(await chest.run("friday", POST, { scheduledAt }), 204);
  const items = chest.notifications.map(n => [n.member, shownTo(n, everyone.find(p => p.id === n.member)!.language ?? "en"), n.key] as const).map(([m, w, k]) => [m, w.title, k]).sort();
  // Tom has no entry yet: his start is the tool's (last week, Hugo's first
  // entry), so this week is expected of him — as the Team page says.
  assert.deepEqual(items, [
    [hugo.id, "Your week is empty — fill it in?", "week"],
    [ines.id, "Votre semaine compte 21,5 h — compléter le reste ?", "week"],
    [tom.id, "Your week is empty — fill it in?", "week"],
  ].sort());
  // The tool mails nobody: the Chest mails each member their
  // notifications, by their own choice.
  assert.equal(chest.outbox.length, 0);
  assert.equal(await chest.run("friday", POST, { scheduledAt }), 204);
  assert.equal(chest.notifications.length, 3);
});

test("a week before the tool's start (anyone's start) is never reminded", async () => {
  const before = chest.notifications.length;
  // Two weeks back: before Hugo's first entry, the tool's first day.
  const friday = addDays(mondayOf(todayIn("Europe/Paris")), 4 - 14);
  const run = { scheduledAt: new Date(`${friday}T13:30:00Z`).toISOString() };
  assert.equal(await chest.run("friday", POST, run), 204);
  assert.equal(chest.notifications.length, before);
});

test("turned off, or a higher bar, as the manager sets it", async () => {
  const { sql } = database;
  await assert.rejects(saveReminder(sql, asMember(hugo), { enabled: false, minutes: 600 }), refused("forbidden"));
  await assert.rejects(saveReminder(sql, asMember(camille), { enabled: true, minutes: 10 }), refused("invalid"));
  await assert.rejects(saveReminder(sql, asMember(camille), { enabled: "yes", minutes: 600 }), refused("invalid"));
  await saveReminder(sql, asMember(camille), { enabled: false, minutes: 600 });
  const before = chest.notifications.length;
  const friday = addDays(mondayOf(todayIn("Europe/Paris")), 4);
  assert.equal(await chest.run("friday", POST, { scheduledAt: new Date(`${friday}T13:30:00Z`).toISOString() }), 204);
  assert.equal(chest.notifications.length, before);
});

test("a week sent to two managers: each is told, the French words with the notice", async () => {
  const { sql } = database;
  const sofia = { id: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa", firstName: "Sofia", lastName: "Rossi", name: "Sofia Rossi", photo: null, role: "manager", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" };
  chest.members.push(sofia);
  try {
    const p = await projects.createProject(sql, asMember(camille), { name: "Shop" });
    const week = addDays(mondayOf(todayIn("Europe/Paris")), -21);
    await addEntry(sql, asMember(hugo), { projectId: p.id, day: week, minutes: 480 });
    chest.notifications.length = 0;
    const sent = await submitWeek(sql, asMember(hugo), week);
    assert.equal(sent.approvers, 2);
    const told = chest.notifications.filter(n => n.title.startsWith("Hugo Bernard sent their week"));
    assert.deepEqual(told.map(n => n.member).sort(), [camille.id, sofia.id].sort());
    assert.match(shownTo(told[0]!, "fr").title, /^Hugo Bernard a envoyé sa semaine du /u);
    assert.ok(told.every(n => n.path === `/chest/team/${hugo.id}?week=${week}`));
    assert.equal(chest.outbox.length, 0);
  } finally {
    chest.members.splice(chest.members.findIndex(m => m.id === sofia.id), 1);
  }
});
