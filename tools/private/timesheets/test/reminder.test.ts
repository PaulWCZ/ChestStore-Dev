import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import { addDays, mondayOf, todayIn } from "../lib/days.ts";
import { addEntry } from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { saveReminder } from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, tom } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, schedules: [{ name: "friday", cron: "30 15 * * 5" }], timeZone: "Europe/Paris" });
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
  assert.equal(await chest.run("friday", POST, { scheduledAt }), 204);
  assert.equal(chest.notifications.length, 3);
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
