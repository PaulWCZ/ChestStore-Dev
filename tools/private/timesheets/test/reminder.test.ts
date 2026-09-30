import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import { addDays, mondayOf, todayIn } from "../lib/days.ts";
import { addEntry } from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { saveReminder } from "../lib/settings.ts";
import { submitWeek } from "../lib/weeks.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, tom } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase({ timeZone: "Europe/Paris" });
  chest = await fakeChest({ members: everyone.map(p => ({ ...p, email: p.firstName.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "") + "@atelier.test", ...(p.id === tom.id ? { mailPreference: "none" as const } : {}) })), capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier.test" }, schedules: [{ name: "friday", cron: "30 15 * * 5" }], chest: { timeZone: "Europe/Paris" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("on Friday, whoever has a short week gets one item, in their language; delivered twice, still one", async () => {
  const { sql } = database;
  const friday = addDays(mondayOf(todayIn("Europe/Paris")), 4);
  const p = await projects.createProject(sql, asMember(camille), { name: "Site" });
  await addEntry(sql, asMember(ines), { projectId: p.id, day: addDays(friday, -4), minutes: 600 });
  await addEntry(sql, asMember(ines), { projectId: p.id, day: addDays(friday, -3), minutes: 690 });
  for (let i = 0; i < 5; i++) await addEntry(sql, asMember(camille), { projectId: p.id, day: addDays(friday, -i), minutes: 7 * 60 + 30 });
  await addEntry(sql, asMember(hugo), { projectId: p.id, day: addDays(friday, -7), minutes: 600 }); // last week's
  const scheduledAt = new Date(`${friday}T13:30:00Z`).toISOString();
  assert.equal(await chest.run("friday", POST, { scheduledAt }), 204);
  const items = chest.notifications.map(n => [n.member, n.title, n.key]).sort();
  assert.deepEqual(items, [
    [hugo.id, "Your week is empty — fill it in?", "week"],
    [ines.id, "Votre semaine compte 21,5 h — compléter le reste ?", "week"],
    [tom.id, "Your week is empty — fill it in?", "week"],
  ].sort());
  // By email too (the mail proposal), once whatever the retries — except
  // to Tom, who chose no email in the Chest: a reminder is not
  // transactional, so his choice holds (the bell still tells him).
  assert.deepEqual(chest.outbox.map(m => [m.to[0], m.subject.replace(/\s/gu, " ")]).sort(), [
    ["hugo@atelier.test", "Your week is empty — fill it in?"],
    ["ines@atelier.test", "Votre semaine compte 21,5 h — compléter le reste ?"],
  ]);
  assert.deepEqual(chest.held.map(h => [h.member, h.reason]), [[tom.id, "none"]]);
  assert.equal(await chest.run("friday", POST, { scheduledAt }), 204);
  assert.equal(chest.notifications.length, 3);
  assert.equal(chest.outbox.length, 2);
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

test("a week sent to two managers: each gets their email, under a key of their own (never cut)", async () => {
  const { sql } = database;
  const sofia = { id: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa", firstName: "Sofia", lastName: "Rossi", name: "Sofia Rossi", photo: null, role: "manager", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris", email: "sofia@atelier.test" };
  chest.members.push(sofia);
  try {
    const p = await projects.createProject(sql, asMember(camille), { name: "Shop" });
    const week = addDays(mondayOf(todayIn("Europe/Paris")), -21);
    await addEntry(sql, asMember(hugo), { projectId: p.id, day: week, minutes: 480 });
    chest.outbox.length = 0;
    const sent = await submitWeek(sql, asMember(hugo), week);
    assert.equal(sent.approvers, 2);
    assert.deepEqual(chest.outbox.map(m => m.to[0]).sort(), ["camille@atelier.test", "sofia@atelier.test"]);
    const keys = chest.outbox.map(m => m.key);
    assert.equal(new Set(keys).size, 2);
    // The tool's key is longer than the Chest keeps: the SDK sends its digest.
    assert.ok(keys.every(k => k?.startsWith("sha256:")));
  } finally {
    chest.members.splice(chest.members.findIndex(m => m.id === sofia.id), 1);
  }
});
