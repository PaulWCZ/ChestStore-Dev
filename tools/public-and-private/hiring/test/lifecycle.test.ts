import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST as events } from "../app/chest-events/route.ts";
import { POST as jobsRoute } from "../app/chest-jobs/[name]/route.ts";
import * as candidates from "../lib/candidates.ts";
import * as interviews from "../lib/interviews.ts";
import * as jobs from "../lib/jobs.ts";
import * as messages from "../lib/messages.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, schedules: [{ name: "cleanup", cron: "25 3 * * *" }] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hasTool = async () => true;
const isRecruiter = async () => false;

test("an interviewer who leaves is taken off the job; their feedback stays", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille));
  await jobs.addInterviewer(sql, asMember(camille), job.id, hugo.id, hasTool);
  await jobs.addInterviewer(sql, asMember(camille), job.id, ines.id, hasTool);
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  await candidates.giveFeedback(sql, asMember(hugo), c.id, { rating: 3, recommendation: "yes" });
  await candidates.askFeedback(sql, asMember(camille), c.id, [ines.id], isRecruiter);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: hugo.id } }, events), 204);
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: ines.id } }, events), 204);
  const d = await jobs.job(sql, asMember(camille), job.id);
  assert.deepEqual(d.interviewers, []);
  const detail = await candidates.candidate(sql, asMember(camille), c.id);
  assert.deepEqual(detail.others.map(f => f.author), [hugo.id]);
  assert.deepEqual(detail.asked, []);
});

test("an erasure removes the member's id everywhere, keeps what they wrote, and is acknowledged once", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Erasure test");
  await jobs.addInterviewer(sql, asMember(camille), job.id, ines.id, hasTool);
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  await candidates.giveFeedback(sql, asMember(ines), c.id, { rating: 4, strengths: "Great", recommendation: "strong_yes" });
  await candidates.addNote(sql, asMember(camille), c.id, "Called her.");
  await candidates.askFeedback(sql, asMember(camille), c.id, [ines.id, hugo.id], async () => true);
  // Camille writes, keeps a template, plans an interview with Inès.
  await messages.write(sql, asMember(camille), c.id, { subject: "Hello", text: "Hello" });
  await messages.saveTemplate(sql, asMember(camille), { name: "Mine", language: "en", subject: "S", body: "B" });
  const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  await interviews.schedule(sql, asMember(camille), c.id, { day, time: "10:00", minutes: 30, people: [camille.id, ines.id], tell: false }, async () => true);
  const erasure = "era_" + "e".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "f".repeat(26), data: { id: camille.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, events), 204);
  assert.equal(await chest.emit(event, events), 204);
  const second = { type: "member.erased" as const, id: "evt_" + "g".repeat(26), data: { id: ines.id, erasure: "era_" + "h".repeat(26), deadline: event.data.deadline } };
  assert.equal(await chest.emit(second, events), 204);
  const [left] = await sql<{ n: number }[]>`
    select (select count(*) from notes where author in (${camille.id}, ${ines.id}))::int + (select count(*) from feedback where author in (${camille.id}, ${ines.id}))::int
      + (select count(*) from activity where actor in (${camille.id}, ${ines.id}) or data::text like ${"%" + ines.id + "%"})::int
      + (select count(*) from jobs where created_by = ${camille.id})::int + (select count(*) from job_interviewers where member_id = ${ines.id})::int
      + (select count(*) from messages where author = ${camille.id})::int + (select count(*) from templates where created_by = ${camille.id})::int
      + (select count(*) from interviews where created_by = ${camille.id})::int + (select count(*) from interview_people where member_id in (${camille.id}, ${ines.id}))::int as n`;
  assert.equal(left!.n, 0);
  const [kept] = await sql<{ notes: number; feedback: number }[]>`select (select count(*) from notes where candidate_id = ${c.id})::int as notes, (select count(*) from feedback where candidate_id = ${c.id})::int as feedback`;
  assert.deepEqual([kept!.notes, kept!.feedback], [1, 1]);
  assert.deepEqual(chest.acknowledged, [erasure, "era_" + "h".repeat(26)]);
});

test("the nightly cleanup deletes candidates past the retention, with their CVs", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Cleanup test");
  const object = "cv/bbbbbbbbbbbbbbbbbbbb.pdf";
  chest.files.set(object, { data: new TextEncoder().encode("%PDF-"), type: "application/pdf", updated: new Date().toISOString() });
  const c = (await candidates.apply(sql, application(job.slug, { cv: { object, fileName: "cv.pdf", type: "application/pdf", size: 5 } }))).candidate;
  await sql`update candidates set last_activity_at = now() - interval '3 years' where id = ${c.id}`;
  assert.equal(await chest.run("cleanup", jobsRoute as never), 204);
  await assert.rejects(candidates.candidate(sql, asMember(camille), c.id), { code: "not_found" });
  assert.equal(chest.files.has(object), false);
});
