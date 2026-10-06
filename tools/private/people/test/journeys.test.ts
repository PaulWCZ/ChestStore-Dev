import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/errors.ts";
import { en } from "../src/i18n/en.ts";
import * as j from "../src/lib/journeys.ts";
import { addDays } from "../src/shared/model.ts";
import { today } from "../src/lib/zone.ts";
import { updateJob } from "../src/lib/profiles.ts";
import * as tell from "../src/lib/tell.ts";
import { examples } from "../src/lib/examples.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, paul, sofia, tom, seen } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const hr = asMember(camille);

async function newcomerTemplate() {
  const t = await j.createTemplate(database.sql, hr, { kind: "onboarding", name: "Office newcomer" });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Order the laptop", role: "hr", offset: -7 });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Lunch with the team", role: "manager", offset: 0 });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Fill in your profile", role: "person", offset: 1 });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Give the office tour", role: "member", memberId: tom.id, offset: 0 });
  return t;
}

test("HR writes templates; items are checked; members may not", async () => {
  const { sql } = database;
  const t = await newcomerTemplate();
  const read = await j.template(sql, hr, t.id);
  assert.deepEqual(read.items.map(i => [i.text, i.role, i.offset]), [["Order the laptop", "hr", -7], ["Lunch with the team", "manager", 0], ["Give the office tour", "member", 0], ["Fill in your profile", "person", 1]]);
  await assert.rejects(j.createTemplate(sql, asMember(hugo), { kind: "onboarding", name: "Mine" }), refused("forbidden"));
  await assert.rejects(j.listTemplates(sql, asMember(hugo)), refused("forbidden"));
  await assert.rejects(j.createTemplate(sql, hr, { kind: "holiday", name: "x" }), refused("invalid"));
  await assert.rejects(j.createTemplate(sql, hr, { kind: "onboarding", name: " " }), refused("empty"));
  await assert.rejects(j.addTemplateItem(sql, hr, t.id, { text: "x", role: "boss", offset: 0 }), refused("invalid"));
  await assert.rejects(j.addTemplateItem(sql, hr, t.id, { text: "x", role: "member", offset: 0 }), refused("invalid"));
  await assert.rejects(j.addTemplateItem(sql, hr, t.id, { text: "x", role: "member", memberId: "mbr_" + "q".repeat(26), offset: 0 }), refused("not_member"));
  await assert.rejects(j.addTemplateItem(sql, hr, t.id, { text: "x", role: "hr", offset: 1000 }), refused("invalid"));
  await assert.rejects(j.addTemplateItem(sql, hr, "999999", { text: "x", role: "hr", offset: 0 }), refused("not_found"));
  const edited = await j.updateTemplateItem(sql, hr, read.items[0]!.id, { text: "Order the laptop and mouse", role: "hr", offset: -14 });
  assert.equal(edited.offset, -14);
  const removed = await j.removeTemplateItem(sql, hr, read.items[0]!.id);
  const back = await j.addTemplateItem(sql, hr, t.id, { text: removed.text, role: removed.role, offset: removed.offset });
  assert.equal(back.text, "Order the laptop and mouse");
  await j.renameTemplate(sql, hr, t.id, "Newcomer");
  await j.archiveTemplate(sql, hr, t.id, true);
  assert.equal((await j.listTemplates(sql, hr)).some(x => x.id === t.id), false);
  assert.equal((await j.listTemplates(sql, hr, { archived: true })).some(x => x.id === t.id), true);
  await j.archiveTemplate(sql, hr, t.id, false);
  const ex = await j.addExamples(sql, hr, examples(en));
  assert.equal(ex.length, 2);
  assert.deepEqual((await j.listTemplates(sql, hr)).map(x => x.kind).sort(), ["offboarding", "onboarding", "onboarding"]);
});

test("starting a checklist gives each step to someone, tells them in their language, and keeps the tile's number", async () => {
  const { sql } = database;
  await updateJob(sql, hr, nora.id, { managerId: ines.id });
  const t = await newcomerTemplate();
  const start = today();
  await assert.rejects(j.startJourney(sql, asMember(ines), { personId: nora.id, templateId: t.id, anchor: start }), refused("forbidden"));
  await assert.rejects(j.startJourney(sql, hr, { personId: "mbr_" + "q".repeat(26), templateId: t.id, anchor: start }), refused("not_member"));
  await assert.rejects(j.startJourney(sql, hr, { personId: nora.id, templateId: t.id, anchor: "soon" }), refused("invalid"));
  const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: t.id, anchor: start });
  await tell.todo(sql, hr, started, started.assignees.keys());
  const journey = await j.journey(sql, hr, started.id);
  assert.deepEqual(journey.items.map(i => [i.text, i.assignee, i.due]), [
    ["Order the laptop", camille.id, addDays(start, -7)],
    ["Lunch with the team", ines.id, start],
    ["Give the office tour", tom.id, start],
    ["Fill in your profile", nora.id, addDays(start, 1)],
  ]);
  const inbox = (who: string) => chest.notifications.filter(n => n.member === who).map(n => seen(n).title);
  assert.deepEqual(inbox(ines.id), ["Arrivée de Nora Petit : 1 tâche pour vous"]);
  assert.deepEqual(inbox(tom.id), ["Welcome Nora Petit: 1 to-do for you"]);
  assert.deepEqual(inbox(nora.id), ["Vos premières semaines : 1 tâche"]);
  assert.deepEqual(inbox(camille.id), []);
  assert.equal(chest.badges.get(tom.id), 1);
  // Who sees it: HR, Nora, her manager, those with a step; not Hugo or Léa.
  for (const who of [nora, ines, tom]) assert.equal((await j.journey(sql, asMember(who), started.id)).id, started.id);
  for (const who of [hugo, lea]) await assert.rejects(j.journey(sql, asMember(who), started.id), refused("not_found"));
  // My to-dos.
  const toms = await j.myItems(sql, asMember(tom));
  assert.deepEqual(toms.map(g => [g.journey.personId, g.items.map(i => i.text)]), [[nora.id, ["Give the office tour"]]]);
  // Ticking: only one's own step (or HR); Tom's item goes from his bell.
  const tour = journey.items[2]!;
  await assert.rejects(j.tick(sql, asMember(ines), tour.id, true), refused("forbidden"));
  await assert.rejects(j.tick(sql, asMember(hugo), tour.id, true), refused("not_found"));
  await assert.rejects(j.tick(sql, asMember(tom), tour.id, "yes"), refused("invalid"));
  const ticked = await j.tick(sql, asMember(tom), tour.id, true);
  assert.equal(ticked.assigneeDone, true);
  await tell.todo(sql, asMember(tom), { id: started.id }, [tom.id]);
  assert.deepEqual(inbox(tom.id), []);
  assert.equal(chest.badges.has(tom.id), false);
  // HR gives Ines's lunch to Hugo, adds a step, removes one and undoes it.
  const moved = await j.updateJourneyItem(sql, hr, journey.items[1]!.id, { assignee: hugo.id });
  assert.equal(moved.before, ines.id);
  assert.equal(moved.item.role, "member");
  const added = await j.addJourneyItem(sql, hr, started.id, { text: "Plan a coffee with Sofia", assignee: sofia.id, due: addDays(start, 2) });
  assert.equal(added.item.assignee, sofia.id);
  await assert.rejects(j.addJourneyItem(sql, asMember(tom), started.id, { text: "x" }), refused("forbidden"));
  await j.removeJourneyItem(sql, hr, added.item.id, true);
  await assert.rejects(j.removeJourneyItem(sql, hr, added.item.id, true), refused("not_found"));
  await j.removeJourneyItem(sql, hr, added.item.id, false);
  // Everything done: complete, the starter is told; one unticked: open again.
  for (const item of (await j.journey(sql, hr, started.id)).items) await j.tick(sql, hr, item.id, true);
  const last = await j.journey(sql, hr, started.id);
  assert.notEqual(last.completedAt, null);
  const reopened = await j.tick(sql, hr, last.items[0]!.id, false);
  assert.equal(reopened.reopened, true);
  const done = await j.tick(sql, hr, last.items[0]!.id, true);
  assert.equal(done.completed, true);
  const summary = (await j.listJourneys(sql, hr)).find(s => s.id === started.id)!;
  assert.deepEqual([summary.total, summary.done], [5, 5]);
  await assert.rejects(j.listJourneys(sql, asMember(nora)), refused("forbidden"));
});

test("a checklist is stopped (undo) and deleted; the bell and tiles follow; the morning reminds what is due", async () => {
  const { sql } = database;
  const t = await newcomerTemplate();
  const started = await j.startJourney(sql, hr, { personId: lea.id, templateId: t.id, anchor: today() });
  await tell.todo(sql, hr, started, started.assignees.keys());
  // No manager for Léa: that step waits for HR to give it.
  // Nora has no manager: the manager's step goes to HR (whoever started it), never to nobody.
  assert.equal((await j.journey(sql, hr, started.id)).items.find(i => i.role === "manager")?.assignee, camille.id);
  assert.ok(chest.badges.get(lea.id)! >= 1);
  await assert.rejects(j.deleteJourney(sql, hr, started.id), refused("not_found"));
  const stopped = await j.stopJourney(sql, hr, started.id, true);
  await tell.settled(sql, started.id, stopped.assignees);
  assert.equal(chest.badges.has(lea.id), false);
  await assert.rejects(j.tick(sql, asMember(lea), (await j.journey(sql, hr, started.id)).items[0]!.id, true), refused("not_found"));
  assert.deepEqual(await j.myItems(sql, asMember(lea)), []);
  await j.stopJourney(sql, hr, started.id, false);
  await tell.todo(sql, hr, started, started.assignees.keys());
  assert.ok(chest.badges.get(lea.id)! >= 1);
  // The morning: one digest per person with steps due today or late.
  const status = await chest.run("morning", request => import("../src/lib/deliveries.ts").then(m => m.onSchedule(request)));
  assert.equal(status, 204);
  assert.ok(chest.notifications.some(n => n.member === tom.id && n.key === "digest" && /today/u.test(n.title)));
  await j.stopJourney(sql, hr, started.id, true);
  await j.deleteJourney(sql, hr, started.id);
  await assert.rejects(j.journey(sql, hr, started.id), refused("not_found"));
  await assert.rejects(j.stopJourney(sql, asMember(paul), started.id, true), refused("forbidden"));
});
