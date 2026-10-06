import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as j from "../src/lib/journeys.ts";
import * as share from "../src/lib/share.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea } from "./support/members.ts";

// People → Equipment: what People tells when HR sets someone's last day
// (Proposal (studio): events between tools).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  process.env["CHEST_TOOL"] = "people";
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, emits: ["people.leaving", "people.leaving_cancelled"], receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);

// As the server actions do (app/chest/actions.ts).
const start = (personId: string, templateId: string, anchor: string) =>
  share.around(database.sql, personId, () => j.startJourney(database.sql, hr, { personId, templateId, anchor }));
async function stop(journeyId: string, stopped: boolean) {
  const it = await j.about(database.sql, journeyId);
  await share.around(database.sql, it.personId, () => j.stopJourney(database.sql, hr, journeyId, stopped));
}

test("a leaving checklist tells who leaves and their last day — nothing else; stopped, the departure is taken back; restarted, told again", async () => {
  const { sql } = database;
  const t = await j.createTemplate(sql, hr, { kind: "offboarding", name: "Leaving" });
  await j.addTemplateItem(sql, hr, t.id, { text: "Return the laptop", role: "person", offset: -1 });
  const started = await start(hugo.id, t.id, "2026-10-12");
  assert.deepEqual(chest.published.map(e => [e.type, e.data]), [["people.leaving", { member: hugo.id, lastDay: "2026-10-12" }]]);
  assert.match(chest.published[0]!.key!, /^people:mbr_[a-z2-7]{26}:leaving:\d+$/u);
  await stop(started.id, true);
  assert.deepEqual(chest.published.at(-1)!.data, { member: hugo.id });
  assert.equal(chest.published.at(-1)!.type, "people.leaving_cancelled");
  await stop(started.id, false);
  assert.deepEqual(chest.published.at(-1)!.data, { member: hugo.id, lastDay: "2026-10-12" });
  assert.equal(chest.published.length, 3);
  // A second leaving checklist with a later day: the day moves; stopping
  // it brings back the first one's day — never "cancelled" while one runs.
  const later = await start(hugo.id, t.id, "2026-10-16");
  assert.deepEqual(chest.published.at(-1)!.data, { member: hugo.id, lastDay: "2026-10-16" });
  await stop(later.id, true);
  assert.deepEqual([chest.published.at(-1)!.type, chest.published.at(-1)!.data], ["people.leaving", { member: hugo.id, lastDay: "2026-10-12" }]);
  assert.equal(chest.published.length, 5);
});

test("a welcome checklist tells nothing; without events between tools, nothing breaks", async () => {
  const { sql } = database;
  const t = await j.createTemplate(sql, hr, { kind: "onboarding", name: "Welcome" });
  await j.addTemplateItem(sql, hr, t.id, { text: "Lunch", role: "hr", offset: 0 });
  const count = chest.published.length;
  await start(lea.id, t.id, "2026-10-12");
  assert.equal(chest.published.length, count);
  const bare = await fakeChest({ network: {}, members: everyone });
  try {
    const off = await j.createTemplate(sql, hr, { kind: "offboarding", name: "Leaving 2" });
    await j.addTemplateItem(sql, hr, off.id, { text: "Badge", role: "hr", offset: 0 });
    await start(lea.id, off.id, "2026-10-30");
    assert.equal(await share.lastDay(sql, lea.id), "2026-10-30");
  } finally {
    await bare.close();
  }
});
