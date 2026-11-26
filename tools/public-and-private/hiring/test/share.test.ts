import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeChest, type FakeChest, type FakeEmits } from "@argentic/chest-sdk/testing";
import * as candidates from "../src/lib/candidates.ts";
import * as jobs from "../src/lib/jobs.ts";
import * as share from "../src/lib/share.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone } from "./support/members.ts";

// What Hiring tells People (SDK 0.7.0's events between tools).
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8")) as { emits: Record<string, FakeEmits> };
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  process.env["CHEST_TOOL"] = "hiring";
  chest = await fakeChest({ members: everyone, emits: manifest.emits });
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

test("a hire is told with who, where and when — company news, for everyone: nothing of the application, no address, no salary; then taken back", async () => {
  const hire = { candidate: "42", name: "Lucie Garnier", job: "Senior furniture designer", team: "", place: "Lyon", startDate: "2026-11-02", hiredBy: camille.id };
  // Even handed more than its type allows, the event carries its fields only.
  assert.equal(await share.hired({ ...hire, email: "lucie@example.com", salary: 52000, notes: "great" } as never, "2026-10-01T09:00:00.000Z"), true);
  const [e] = chest.emitted;
  assert.equal(e!.type, "hiring.hired");
  assert.deepEqual(e!.data, { candidate: "42", name: "Lucie Garnier", job: "Senior furniture designer", team: null, place: "Lyon", startDate: "2026-11-02", hiredBy: camille.id });
  // Exactly the fields chest.json declares, nothing more.
  assert.deepEqual(Object.keys(e!.data).sort(), Object.keys(manifest.emits["hiring.hired"]!.data).sort());
  for (const word of ["email", "salary", "notes", "cv", "rating", "feedback"]) assert.ok(!(word in manifest.emits["hiring.hired"]!.data), word);
  assert.equal(e!.key, `hiring:42:hired:${Date.parse("2026-10-01T09:00:00.000Z")}`);
  // About the candidate; no audience: an arrival is company news (People's
  // HR and Goals see it).
  assert.equal(e!.subject, "42");
  assert.equal(e!.audience, undefined);
  // The same move told twice is one event.
  await share.hired(hire, "2026-10-01T09:00:00.000Z");
  assert.equal(chest.emitted.filter(p => p.type === "hiring.hired").length, 1);
  assert.equal(await share.hireCancelled("42", new Date("2026-10-02T09:00:00Z")), true);
  // Renamed for 0.7.0 (no underscore in a type): People hears hiring.hire-cancelled.
  assert.deepEqual([chest.emitted.at(-1)!.type, chest.emitted.at(-1)!.data, chest.emitted.at(-1)!.key], ["hiring.hire-cancelled", { candidate: "42" }, `hiring:42:cancelled:${Date.parse("2026-10-02T09:00:00Z")}`]);
  assert.equal(chest.emitted.at(-1)!.audience, undefined, "taken back for everyone too");
  assert.deepEqual(Object.keys(manifest.emits).sort(), ["hiring.busy", "hiring.hire-cancelled", "hiring.hired"]);
});

test("a format character typed in a name is left out of the event only", async () => {
  const at = new Date().toISOString();
  assert.equal(await share.hired({ candidate: "43", name: "Zo\u200be 👩\u200d🎨", job: "Designer\ufeff", team: "\u200b", place: null, startDate: null, hiredBy: camille.id }, at), true);
  const d = chest.emitted.at(-1)!.data;
  assert.deepEqual([d["name"], d["job"], d["team"]], ["Zoe 👩🎨", "Designer", null]);
});

test("without events between tools, nothing breaks", async () => {
  await chest.close();
  chest = await fakeChest({ members: everyone });
  assert.equal(await share.hired({ candidate: "1", name: "A", job: "J", team: null, place: null, startDate: null, hiredBy: camille.id }, new Date().toISOString()), false);
  assert.equal(await share.hireCancelled("1"), false);
});
