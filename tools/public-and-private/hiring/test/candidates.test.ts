import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../lib/candidates.ts";
import * as jobs from "../lib/jobs.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob, stageNames } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

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

const recruiter = () => asMember(camille);
const hasTool = async (id: string) => everyone.some(m => m.id === id);
const isRecruiter = async (id: string) => everyone.some(m => m.id === id && m.role === "recruiter");

test("an application lands in the first stage, with its consent; the form's rules", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter());
  const { candidate } = await candidates.apply(sql, application(job.slug));
  const d = await candidates.candidate(sql, recruiter(), candidate.id);
  assert.equal(d.stages[0]!.id, candidate.stageId);
  assert.equal(candidate.link, "https://linkedin.com/in/lucie");
  assert.equal(candidate.language, "fr");
  assert.ok(candidate.consentAt);
  assert.deepEqual(d.activity.map(a => a.kind), ["applied"]);
  await assert.rejects(candidates.apply(sql, application(job.slug, { consent: false })), { code: "consent" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { consent: "true" })), { code: "consent" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { email: "lucie@" })), { code: "invalid_email" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { link: "javascript:alert(1)" })), { code: "invalid_link" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { link: "" })), { code: "cv_missing" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { phone: "call me" })), { code: "invalid" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { name: "" })), { code: "empty" });
  await assert.rejects(candidates.apply(sql, application(job.slug, { coverLetter: "x".repeat(10001) })), { code: "too_long" });
  await assert.rejects(candidates.apply(sql, application("no-such-job")), { code: "not_found" });
  await jobs.setJobState(sql, recruiter(), job.id, "closed");
  await assert.rejects(candidates.apply(sql, application(job.slug)), { code: "closed" });
  await jobs.setJobState(sql, recruiter(), job.id, "open");
  await jobs.saveSettings(sql, recruiter(), { careersOpen: false });
  await assert.rejects(candidates.apply(sql, application(job.slug)), { code: "closed" });
  await jobs.saveSettings(sql, recruiter(), { careersOpen: true });
  const draft = await jobs.createJob(sql, recruiter(), { title: "Hidden", contract: "permanent", remote: "onsite" }, stageNames);
  await assert.rejects(candidates.apply(sql, application(draft.slug)), { code: "not_found" });
});

test("the form's guard: ten applications an hour per visitor, then too_many", async () => {
  const { sql } = database;
  for (let i = 0; i < candidates.formLimits.perVisitorHour; i++) await candidates.guard(sql, "203.0.113.9");
  await assert.rejects(candidates.guard(sql, "203.0.113.9"), { code: "too_many" });
  await candidates.guard(sql, "203.0.113.10");
  await candidates.guard(sql, "203.0.113.9", "upload");
});

test("the board: stages, days in stage, new for recruiters, ratings hidden from an interviewer until they rated", async () => {
  const { sql } = database;
  const base = await candidates.unseenCounts(sql, [camille.id, sofia.id]);
  const unseen = async (id: string) => (await candidates.unseenCounts(sql, [id])).get(id)! - base.get(id)!;
  const job = await openJob(sql, recruiter(), "Board test");
  await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool);
  await jobs.addInterviewer(sql, recruiter(), job.id, hugo.id, hasTool);
  const a = (await candidates.apply(sql, application(job.slug, { name: "Ana" }))).candidate;
  const b = (await candidates.apply(sql, application(job.slug, { name: "Ben", email: "ben@example.com" }))).candidate;
  let cards = await candidates.board(sql, recruiter(), job.id);
  assert.deepEqual(cards.map(c => [c.name, c.unseen, c.days]), [["Ana", true, 0], ["Ben", true, 0]]);
  assert.equal(await unseen(camille.id), 2);
  await candidates.candidate(sql, recruiter(), a.id);
  assert.equal(await unseen(camille.id), 1);
  assert.equal(await unseen(sofia.id), 2);
  // Moved out of the first stage, a candidate is no longer new for anyone.
  const stages = (await jobs.job(sql, recruiter(), job.id)).stages;
  await candidates.move(sql, recruiter(), b.id, stages[2]!.id);
  assert.equal(await unseen(sofia.id), 1);
  await sql`update candidates set stage_entered_at = now() - interval '3 days 2 hours' where id = ${b.id}`;
  await candidates.giveFeedback(sql, asMember(hugo), b.id, { rating: 4, strengths: "Precise", concerns: "", recommendation: "strong_yes" });
  await candidates.giveFeedback(sql, recruiter(), b.id, { rating: 3, recommendation: "yes" });
  cards = await candidates.board(sql, recruiter(), job.id);
  const ben = cards.find(c => c.id === b.id)!;
  assert.deepEqual([ben.days, ben.rating, ben.ratings, ben.stageId], [3, 3.5, 2, stages[2]!.id]);
  const forInes = (await candidates.board(sql, asMember(ines), job.id)).find(c => c.id === b.id)!;
  assert.deepEqual([forInes.rating, forInes.ratings, forInes.unseen], [null, 0, false]);
  const forHugo = (await candidates.board(sql, asMember(hugo), job.id)).find(c => c.id === b.id)!;
  assert.equal(forHugo.rating, 3.5);
  await assert.rejects(candidates.board(sql, asMember(lea), job.id), { code: "not_found" });
  await assert.rejects(candidates.board(sql, asMember(nora), job.id), { code: "not_found" });
});

test("feedback: one per person, others hidden until given; asking and answering", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Feedback test");
  await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool);
  await jobs.addInterviewer(sql, recruiter(), job.id, hugo.id, hasTool);
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  const asked = await candidates.askFeedback(sql, recruiter(), c.id, [ines.id, hugo.id, sofia.id], isRecruiter);
  assert.deepEqual(asked.asked, [ines.id, hugo.id, sofia.id]);
  assert.deepEqual((await candidates.askFeedback(sql, recruiter(), c.id, [ines.id], isRecruiter)).asked, []);
  await assert.rejects(candidates.askFeedback(sql, recruiter(), c.id, [lea.id], isRecruiter), { code: "invalid" });
  await assert.rejects(candidates.askFeedback(sql, asMember(ines), c.id, [hugo.id], isRecruiter), { code: "forbidden" });
  assert.deepEqual((await candidates.waitingOn(sql, asMember(ines))).map(w => w.candidateId), [c.id]);
  const given = await candidates.giveFeedback(sql, asMember(hugo), c.id, { rating: 2, strengths: "Kind", concerns: "Little experience", recommendation: "no" });
  assert.deepEqual([given.first, given.askedBy], [true, [camille.id]]);
  let forInes = await candidates.candidate(sql, asMember(ines), c.id);
  assert.deepEqual([forInes.others.length, forInes.othersHidden, forInes.mine, forInes.askedOfMe], [0, 1, null, true]);
  await candidates.giveFeedback(sql, asMember(ines), c.id, { rating: 3, recommendation: "yes" });
  forInes = await candidates.candidate(sql, asMember(ines), c.id);
  assert.deepEqual([forInes.others.map(f => f.author), forInes.othersHidden, forInes.mine?.rating, forInes.askedOfMe], [[hugo.id], 0, 3, false]);
  // Rewritten, not doubled.
  const again = await candidates.giveFeedback(sql, asMember(ines), c.id, { rating: 4, recommendation: "strong_yes" });
  assert.equal(again.first, false);
  const forRecruiter = await candidates.candidate(sql, recruiter(), c.id);
  assert.deepEqual(forRecruiter.others.map(f => [f.author, f.rating]), [[hugo.id, 2], [ines.id, 4]]);
  assert.deepEqual(forRecruiter.asked, [sofia.id]);
  assert.deepEqual(forRecruiter.activity.filter(a => a.kind === "feedback").length, 2);
  await assert.rejects(candidates.giveFeedback(sql, asMember(ines), c.id, { rating: 5, recommendation: "yes" }), { code: "invalid" });
  await assert.rejects(candidates.giveFeedback(sql, asMember(ines), c.id, { rating: 3, recommendation: "maybe" }), { code: "invalid" });
  await assert.rejects(candidates.giveFeedback(sql, asMember(lea), c.id, { rating: 3, recommendation: "yes" }), { code: "not_found" });
  await assert.rejects(candidates.giveFeedback(sql, asMember(nora), c.id, { rating: 3, recommendation: "yes" }), { code: "forbidden" });
  await candidates.cancelAsk(sql, recruiter(), c.id, sofia.id);
  assert.deepEqual((await candidates.candidate(sql, recruiter(), c.id)).asked, []);
});

test("moving, rejecting with a reason, bringing back; an interviewer does none of it", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Moves test");
  await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool);
  const other = await openJob(sql, recruiter(), "Other job");
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  const stages = (await jobs.job(sql, recruiter(), job.id)).stages;
  const foreign = (await jobs.job(sql, recruiter(), other.id)).stages[1]!;
  const moved = await candidates.move(sql, recruiter(), c.id, stages[1]!.id);
  assert.deepEqual([moved.from.name, moved.to.name], ["New", "Screening"]);
  await assert.rejects(candidates.move(sql, recruiter(), c.id, foreign.id), { code: "invalid" });
  const i = asMember(ines);
  await assert.rejects(candidates.move(sql, i, c.id, stages[2]!.id), { code: "forbidden" });
  await assert.rejects(candidates.reject(sql, i, c.id, "skills"), { code: "forbidden" });
  await assert.rejects(candidates.addNote(sql, i, c.id, "Hello"), { code: "forbidden" });
  await assert.rejects(candidates.erase(sql, i, c.id), { code: "forbidden" });
  await assert.rejects(candidates.editCandidate(sql, i, c.id, { name: "X", email: "x@example.com" }), { code: "forbidden" });
  await assert.rejects(candidates.addCandidate(sql, i, job.id, { name: "X", email: "x@example.com", cv: null }), { code: "forbidden" });
  await assert.rejects(candidates.exportRows(sql, i, job.id), { code: "forbidden" });
  await assert.rejects(candidates.reject(sql, recruiter(), c.id, "too_old"), { code: "invalid" });
  const rejected = await candidates.reject(sql, recruiter(), c.id, "skills", "Not the right wood");
  assert.deepEqual([rejected.status, rejected.rejectReason, rejected.rejectNote], ["rejected", "skills", "Not the right wood"]);
  await assert.rejects(candidates.move(sql, recruiter(), c.id, stages[2]!.id), { code: "invalid" });
  const back = await candidates.restore(sql, recruiter(), c.id);
  assert.deepEqual([back.status, back.stageId, back.rejectReason], ["active", stages[1]!.id, null]);
  const log = (await candidates.candidate(sql, recruiter(), c.id)).activity.map(a => a.kind);
  assert.deepEqual(log, ["restored", "rejected", "moved", "applied"]);
  // A stage with someone in it cannot go.
  await assert.rejects(jobs.removeStage(sql, recruiter(), stages[1]!.id), { code: "stage_not_empty" });
  await assert.rejects(jobs.removeJob(sql, recruiter(), job.id), { code: "has_candidates" });
});

test("a recruiter adds someone by hand, notes, edits, exports; others' applications show", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Referral test");
  const stages = (await jobs.job(sql, recruiter(), job.id)).stages;
  const c = await candidates.addCandidate(sql, recruiter(), job.id, { name: "Marc Referral", email: "marc@example.com", language: "en", stageId: stages[2]!.id, cv: null });
  assert.deepEqual([c.source, c.addedBy, c.stageId, c.consentAt], ["team", camille.id, stages[2]!.id, null]);
  await assert.rejects(candidates.addCandidate(sql, recruiter(), job.id, { name: "X", email: "x@example.com", stageId: "999999", cv: null }), { code: "invalid" });
  const note = await candidates.addNote(sql, recruiter(), c.id, "Knows the Lyon market.");
  await assert.rejects(candidates.removeNote(sql, asMember(sofia), note.id), { code: "forbidden" });
  await candidates.removeNote(sql, recruiter(), note.id);
  await candidates.addNote(sql, recruiter(), c.id, "Called him: available in November.");
  const edited = await candidates.editCandidate(sql, recruiter(), c.id, { name: "Marc Dupont", email: "marc.dupont@example.com", phone: "06 11 22 33 44", link: "", language: "fr" });
  assert.deepEqual([edited.name, edited.email, edited.language], ["Marc Dupont", "marc.dupont@example.com", "fr"]);
  const other = await openJob(sql, recruiter(), "Referral test two");
  await candidates.apply(sql, application(other.slug, { email: "MARC.DUPONT@example.com", name: "Marc D." }));
  const d = await candidates.candidate(sql, recruiter(), c.id);
  assert.deepEqual(d.elsewhere.map(e => e.jobTitle), ["Referral test two"]);
  assert.equal(d.notes.length, 1);
  const out = await candidates.exportRows(sql, recruiter(), job.id);
  assert.deepEqual(out.rows.map(r => [r.name, r.stage, r.source]), [["Marc Dupont", "Interview", "team"]]);
});

test("erasing a candidate and the retention delete them with their CV", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Retention test");
  const cv = { object: "cv/0123456789abcdef0123.pdf", fileName: "cv.pdf", type: "application/pdf", size: 1000 };
  const a = (await candidates.apply(sql, application(job.slug, { name: "Old", cv }))).candidate;
  const b = (await candidates.apply(sql, application(job.slug, { name: "Recent" }))).candidate;
  await sql`update candidates set last_activity_at = now() - interval '25 months' where id = ${a.id}`;
  await sql`update candidates set last_activity_at = now() - interval '23 months' where id = ${b.id}`;
  const gone = await candidates.cleanup(sql);
  assert.deepEqual([gone.candidates, gone.objects], [1, [cv.object]]);
  await jobs.saveSettings(sql, recruiter(), { retentionMonths: 12 });
  assert.equal((await candidates.cleanup(sql)).candidates, 1);
  await jobs.saveSettings(sql, recruiter(), { retentionMonths: 24 });
  const c = (await candidates.apply(sql, application(job.slug, { name: "Asks erasure", cv: { ...cv, object: "cv/aaaaaaaaaaaaaaaaaaaa.pdf" } }))).candidate;
  await candidates.addNote(sql, recruiter(), c.id, "Asked to be erased.");
  await assert.rejects(candidates.erase(sql, asMember(ines), c.id), { code: "forbidden" });
  assert.deepEqual(await candidates.erase(sql, recruiter(), c.id), { objects: ["cv/aaaaaaaaaaaaaaaaaaaa.pdf"], wasHired: false });
  await assert.rejects(candidates.candidate(sql, recruiter(), c.id), { code: "not_found" });
  const [left] = await sql<{ n: number }[]>`select (select count(*) from notes where candidate_id = ${c.id})::int + (select count(*) from activity where candidate_id = ${c.id})::int as n`;
  assert.equal(left!.n, 0);
});
