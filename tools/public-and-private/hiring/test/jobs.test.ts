import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as jobs from "../lib/jobs.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { label, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, chest: { organization: "Atelier Martin" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const recruiter = () => asMember(camille);
const hasTool = async (id: string) => everyone.some(m => m.id === id);

test("a recruiter writes a draft with its stages; the slug follows the title until it is published", async () => {
  const { sql } = database;
  const draft = await jobs.createJob(sql, recruiter(), { title: "Office manager", contract: "permanent", remote: "onsite", description: "" });
  assert.equal(draft.state, "draft");
  assert.equal(draft.slug, "office-manager");
  const d = await jobs.job(sql, recruiter(), draft.id);
  // Default stages are keys, read in each reader's language.
  assert.deepEqual(d.stages.map(s => [s.name, s.preset, s.hired]), [[null, "new", false], [null, "screening", false], [null, "interview", false], [null, "offer", false], [null, "hired", true]]);
  assert.deepEqual(d.stages.map(label), ["New", "Screening", "Interview", "Offer", "Hired"]);
  const renamed = await jobs.updateJob(sql, recruiter(), draft.id, { title: "Office & admin manager", contract: "permanent", remote: "onsite", description: "Run the office." });
  assert.equal(renamed.slug, "office-admin-manager");
  const other = await jobs.createJob(sql, recruiter(), { title: "Office & admin manager", contract: "fixed_term", remote: "onsite" });
  assert.equal(other.slug, "office-admin-manager-2");
  // A draft is not on the careers page; empty, it cannot be published.
  assert.equal(await jobs.publicJob(sql, "office-admin-manager"), null);
  await assert.rejects(jobs.setJobState(sql, recruiter(), other.id, "open"), { code: "empty" });
  const published = await jobs.setJobState(sql, recruiter(), renamed.id, "open");
  assert.equal(published.previous, "draft");
  const after = await jobs.updateJob(sql, recruiter(), renamed.id, { title: "Office manager (Lyon)", contract: "permanent", remote: "onsite", description: "Run the office." });
  assert.equal(after.slug, "office-admin-manager");
  assert.ok((await jobs.publicJobs(sql)).some(j => j.slug === "office-admin-manager"));
});

test("the job's rules: salary order, known lists, bounds", async () => {
  const { sql } = database;
  const base = { title: "Sales associate", contract: "permanent", remote: "onsite" };
  await assert.rejects(jobs.createJob(sql, recruiter(), { ...base, salaryMin: "40000", salaryMax: "30000" }), { code: "salary_order" });
  await assert.rejects(jobs.createJob(sql, recruiter(), { ...base, contract: "slavery" }), { code: "invalid" });
  await assert.rejects(jobs.createJob(sql, recruiter(), { ...base, salaryCurrency: "BTC" }), { code: "invalid" });
  await assert.rejects(jobs.createJob(sql, recruiter(), { ...base, title: "x".repeat(121) }), { code: "too_long" });
  await assert.rejects(jobs.createJob(sql, recruiter(), { ...base, title: "  " }), { code: "empty" });
  const job = await jobs.createJob(sql, recruiter(), { ...base, salaryMin: "32 000", salaryMax: "", salaryShown: false });
  assert.equal(job.salaryMin, 32000);
  assert.equal(job.salaryMax, null);
});

test("an interviewer sees only the jobs they are on, and changes nothing", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Workshop apprentice");
  const other = await openJob(sql, recruiter(), "Delivery driver");
  const i = asMember(ines);
  assert.ok(!(await jobs.listJobs(sql, i)).some(j => j.id === job.id));
  await assert.rejects(jobs.job(sql, i, job.id), { code: "not_found" });
  assert.equal(await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool), true);
  assert.equal(await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool), false);
  await assert.rejects(jobs.addInterviewer(sql, recruiter(), job.id, "mbr_" + "z".repeat(26), hasTool), { code: "invalid" });
  const mine = await jobs.listJobs(sql, i);
  assert.deepEqual(mine.map(j => j.id), [job.id]);
  assert.equal((await jobs.job(sql, i, job.id)).access, "interview");
  await assert.rejects(jobs.job(sql, i, other.id), { code: "not_found" });
  for (const step of [
    () => jobs.createJob(sql, i, { title: "Mine", contract: "permanent", remote: "onsite" }),
    () => jobs.updateJob(sql, i, job.id, { title: "Mine", contract: "permanent", remote: "onsite" }),
    () => jobs.setJobState(sql, i, job.id, "closed"),
    () => jobs.addStage(sql, i, job.id, "More"),
    () => jobs.addInterviewer(sql, i, job.id, hugo.id, hasTool),
    () => jobs.removeInterviewer(sql, i, job.id, ines.id),
    () => jobs.saveSettings(sql, i, { companyName: "Mine" }),
    () => jobs.removeJob(sql, i, job.id),
  ]) await assert.rejects(step(), { code: "forbidden" });
  await assert.rejects(jobs.listJobs(sql, asMember(nora)), { code: "forbidden" });
  await assert.rejects(jobs.listJobs(sql, null), { code: "forbidden" });
  await jobs.removeInterviewer(sql, recruiter(), job.id, ines.id);
  assert.deepEqual(await jobs.listJobs(sql, i), []);
});

test("stages: added before hired, renamed, reordered; hired stays last; an empty stage goes", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Upholsterer");
  const added = await jobs.addStage(sql, recruiter(), job.id, "Workshop trial");
  let list = (await jobs.job(sql, recruiter(), job.id)).stages;
  assert.deepEqual(list.map(label), ["New", "Screening", "Interview", "Offer", "Workshop trial", "Hired"]);
  await jobs.moveStage(sql, recruiter(), added.id, "up");
  await jobs.renameStage(sql, recruiter(), added.id, "Trial day");
  list = (await jobs.job(sql, recruiter(), job.id)).stages;
  assert.deepEqual(list.map(label), ["New", "Screening", "Interview", "Trial day", "Offer", "Hired"]);
  const hired = list.at(-1)!;
  await assert.rejects(jobs.moveStage(sql, recruiter(), hired.id, "up"), { code: "invalid" });
  await assert.rejects(jobs.moveStage(sql, recruiter(), list.at(-2)!.id, "down"), { code: "invalid" });
  await assert.rejects(jobs.removeStage(sql, recruiter(), hired.id), { code: "invalid" });
  for (const s of list.slice(1, -1)) await jobs.removeStage(sql, recruiter(), s.id);
  await assert.rejects(jobs.removeStage(sql, recruiter(), list[0]!.id), { code: "last_stage" });
  for (let i = 0; i < 10; i++) await jobs.addStage(sql, recruiter(), job.id, `Step ${i}`);
  await assert.rejects(jobs.addStage(sql, recruiter(), job.id, "One too many"), { code: "too_many" });
});

test("settings: the Chest's company name unless the tool has one; retention among the choices", async () => {
  const { sql } = database;
  assert.equal((await jobs.settings(sql)).companyName, "Atelier Martin");
  const s = await jobs.saveSettings(sql, recruiter(), { companyName: "Atelier Martin & fils", intros: { en: "Chairs since 1962.", fr: "Des chaises depuis 1962." }, careersOpen: false, retentionMonths: 12 });
  assert.deepEqual([s.companyName, jobs.introFor(s, "en"), jobs.introFor(s, "fr"), s.careersOpen, s.retentionMonths], ["Atelier Martin & fils", "Chairs since 1962.", "Des chaises depuis 1962.", false, 12]);
  await assert.rejects(jobs.saveSettings(sql, recruiter(), { retentionMonths: 36 }), { code: "invalid" });
  await jobs.saveSettings(sql, recruiter(), { companyName: "", careersOpen: true, retentionMonths: 24 });
  assert.equal((await jobs.settings(sql)).companyName, "Atelier Martin");
});

test("the careers page shows open jobs only, and the salary only when shown", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Cabinet maker");
  let seen = await jobs.publicJob(sql, job.slug);
  assert.deepEqual(seen?.salary, { min: 42000, max: 50000, currency: "EUR", period: "year" });
  await jobs.updateJob(sql, recruiter(), job.id, { title: job.title, contract: "permanent", remote: "hybrid", description: job.description, salaryMin: "42000", salaryShown: false });
  seen = await jobs.publicJob(sql, job.slug);
  assert.equal(seen?.salary, null);
  await jobs.setJobState(sql, recruiter(), job.id, "closed");
  assert.equal((await jobs.publicJob(sql, job.slug))?.state, "closed");
  assert.ok(!(await jobs.publicJobs(sql)).some(j => j.slug === job.slug));
  assert.equal(await jobs.publicJob(sql, "../etc"), null);
  const draft = await jobs.createJob(sql, recruiter(), { title: "Secret plan", contract: "permanent", remote: "onsite" });
  await jobs.removeJob(sql, recruiter(), draft.id);
  await assert.rejects(jobs.job(sql, recruiter(), draft.id), { code: "not_found" });
});
