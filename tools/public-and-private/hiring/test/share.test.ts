import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../lib/candidates.ts";
import * as jobs from "../lib/jobs.ts";
import * as share from "../lib/share.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone } from "./support/members.ts";

// What Hiring tells People (Proposal (studio): events between tools).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  process.env["CHEST_TOOL"] = "hiring";
  chest = await fakeChest({ members: everyone, emits: ["hiring.hired", "hiring.hire_cancelled"], receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a move into hired keeps the first day; out of it, the day goes", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille));
  const stages = (await jobs.job(sql, asMember(camille), job.id)).stages;
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  await assert.rejects(candidates.move(sql, asMember(camille), c.id, stages.at(-1)!.id, "2026-02-30"), { code: "invalid" });
  const hired = await candidates.move(sql, asMember(camille), c.id, stages.at(-1)!.id, "2026-11-02");
  assert.deepEqual([hired.to.hired, hired.candidate.startDate], [true, "2026-11-02"]);
  const back = await candidates.move(sql, asMember(camille), c.id, stages[3]!.id);
  assert.equal(back.candidate.startDate, null);
  // Only a candidate in "hired" counts as hired when erased.
  assert.equal((await candidates.erase(sql, asMember(camille), c.id)).wasHired, false);
});

test("a hire is told with who, where and when — nothing of the application; then taken back", async () => {
  const hire = { candidate: "42", name: "Lucie Garnier", email: "lucie@example.com", job: "Senior furniture designer", team: "", place: "Lyon", startDate: "2026-11-02", hiredBy: camille.id };
  assert.equal(await share.hired(hire, "2026-10-01T09:00:00.000Z"), true);
  const [e] = chest.published;
  assert.equal(e!.type, "hiring.hired");
  assert.deepEqual(e!.data, { candidate: "42", name: "Lucie Garnier", email: "lucie@example.com", job: "Senior furniture designer", team: null, place: "Lyon", startDate: "2026-11-02", hiredBy: camille.id });
  assert.equal(e!.key, `hiring:42:hired:${Date.parse("2026-10-01T09:00:00.000Z")}`);
  // The same move told twice is one event.
  await share.hired(hire, "2026-10-01T09:00:00.000Z");
  assert.equal(chest.published.filter(p => p.type === "hiring.hired").length, 1);
  assert.equal(await share.hireCancelled("42", new Date("2026-10-02T09:00:00Z")), true);
  assert.deepEqual([chest.published.at(-1)!.type, chest.published.at(-1)!.data, chest.published.at(-1)!.key], ["hiring.hire_cancelled", { candidate: "42" }, `hiring:42:cancelled:${Date.parse("2026-10-02T09:00:00Z")}`]);
});

test("without events between tools, nothing breaks", async () => {
  await chest.close();
  chest = await fakeChest({ members: everyone });
  assert.equal(await share.hired({ candidate: "1", name: "A", email: null, job: "J", team: null, place: null, startDate: null, hiredBy: camille.id }, new Date().toISOString()), false);
  assert.equal(await share.hireCancelled("1"), false);
});
