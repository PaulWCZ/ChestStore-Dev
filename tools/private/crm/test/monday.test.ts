import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as activities from "../lib/activities.ts";
import * as deals from "../lib/deals.ts";
import { today } from "../lib/model.ts";
import { stageConversion, weekActivities, weekStart } from "../lib/reports.ts";
import { listStages } from "../lib/stages.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

// The Monday numbers of the Team page: what each person logged in a week,
// and how deals go from stage to stage.
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

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-09-29"), "2026-09-28", "a Tuesday");
  assert.equal(weekStart("2026-09-28"), "2026-09-28", "a Monday");
  assert.equal(weekStart("2026-10-04"), "2026-09-28", "a Sunday");
  assert.equal(weekStart("2026-09-29", 1), "2026-09-21");
  assert.equal(weekStart("2026-09-29", -1), "2026-10-05");
});

test("what each person logged in a week, by kind, the most first; nothing of the week before; not the tool's own lines", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(ines), { title: "Monday deal" });
  for (const kind of ["call", "call", "meeting", "email"]) await activities.log(sql, asMember(ines), { deal: d.id }, kind, "x");
  await activities.log(sql, asMember(hugo), { deal: d.id }, "note", "y");
  // Last week: not this week's.
  await sql`insert into activities (kind, body, deal_id, author, at) values ('call', 'old', ${d.id}, ${hugo.id}, now() - interval '8 days')`;
  const now = today();
  const week = await weekActivities(sql, asMember(lea), now);
  assert.equal(week.from, weekStart(now));
  assert.deepEqual(week.lines, [
    { author: ines.id, call: 2, meeting: 1, email: 1, note: 0, total: 4 },
    { author: hugo.id, call: 0, meeting: 0, email: 0, note: 1, total: 1 },
  ]);
  assert.ok(!week.lines.some(l => l.author === "chest"), "the lines the tool writes are not anyone's work");
  const before = await weekActivities(sql, asMember(lea), now, 2);
  assert.ok(!before.lines.some(l => l.author === ines.id));
  await assert.rejects(weekActivities(sql, asMember(nora), now), /forbidden/u);
});

test("from stage to stage: a deal counts in every stage it reached or went past; a won deal went through all", async () => {
  const { sql } = database;
  await sql`delete from deals`;
  const stages = await listStages(sql);
  const open = stages.filter(s => s.kind === "open");
  const won = stages.find(s => s.kind === "won")!, lost = stages.find(s => s.kind === "lost")!;
  assert.ok(open.length >= 3);
  const a = await deals.addDeal(sql, asMember(ines), { title: "Stays first" });
  const b = await deals.addDeal(sql, asMember(ines), { title: "Jumps to third" });
  await deals.moveDeal(sql, asMember(ines), b.id, open[2]!.id);
  const c = await deals.addDeal(sql, asMember(ines), { title: "Second then lost" });
  await deals.moveDeal(sql, asMember(ines), c.id, open[1]!.id);
  await deals.moveDeal(sql, asMember(ines), c.id, lost.id, null, null, "Price");
  const w = await deals.addDeal(sql, asMember(ines), { title: "Won from first" });
  await deals.moveDeal(sql, asMember(ines), w.id, won.id);
  void a;
  const r = await stageConversion(sql, asMember(camille));
  assert.equal(r.deals, 4);
  assert.deepEqual([r.won, r.lost], [1, 1]);
  assert.deepEqual(r.stages.slice(0, 3).map(s => s.reached), [4, 3, 2]);
  await assert.rejects(stageConversion(sql, asMember(nora)), /forbidden/u);
});
