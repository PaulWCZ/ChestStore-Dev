import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as chestFiles from "@argentic/chest-sdk/files";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../lib/candidates.ts";
import { parseCsv } from "../lib/csv.ts";
import { emailFiles, everything, theirData } from "../lib/export-all.ts";
import { en } from "../lib/i18n/en.ts";
import { dateOf, emailInName, guess, rowsOf } from "../lib/import-map.ts";
import { importRows, undoImport } from "../lib/import.ts";
import * as jobs from "../lib/jobs.ts";
import { answers, questions } from "../lib/model.ts";
import { report } from "../lib/reports.ts";
import { labelOf, stageLabel } from "../lib/stages.ts";
import { readZip, zipStream, type Entry } from "../lib/zip.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, label, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, settings: { company: "Atelier Martin", locale: "fr" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const recruiter = () => asMember(camille);
const hasTool = async (id: string) => everyone.some(m => m.id === id);

test("default stages read in the reader's language until renamed; the history too", () => {
  const fr = { new: "Nouveaux", screening: "Présélection", interview: "Entretien", offer: "Proposition", hired: "Embauché" };
  assert.equal(stageLabel({ name: null, preset: "screening" }, fr), "Présélection");
  assert.equal(stageLabel({ name: null, preset: "screening" }, en.jobSettings.defaults), "Screening");
  assert.equal(stageLabel({ name: "Showroom day", preset: null }, fr), "Showroom day");
  assert.equal(labelOf(null, "offer", fr), "Proposition");
  assert.equal(labelOf("Phone call", null, fr), "Phone call");
});

test("search: accents and case aside, across the jobs one may see", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Search test");
  const other = await openJob(sql, recruiter(), "Search other");
  await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool);
  await candidates.apply(sql, application(job.slug, { name: "Hélène Vasseur", email: "helene.v@example.com", phone: "06 10 20 30 40" }));
  await candidates.apply(sql, application(other.slug, { name: "Hélène Martin", email: "hm@example.com", coverLetter: "Ébéniste depuis dix ans" }));
  assert.deepEqual((await candidates.search(sql, recruiter(), "HELENE")).map(f => f.name).sort(), ["Hélène Martin", "Hélène Vasseur"]);
  assert.deepEqual((await candidates.search(sql, recruiter(), "ebeniste")).map(f => f.name), ["Hélène Martin"]);
  assert.deepEqual((await candidates.search(sql, recruiter(), "0610 2030")).map(f => f.name), ["Hélène Vasseur"]);
  // An interviewer finds only their jobs' candidates, without their address.
  const hers = await candidates.search(sql, asMember(ines), "helene");
  assert.deepEqual(hers.map(f => [f.name, f.email]), [["Hélène Vasseur", ""]]);
  assert.deepEqual(await candidates.search(sql, recruiter(), "h"), []);
  assert.deepEqual(await candidates.search(sql, recruiter(), "100%_"), []);
  await assert.rejects(candidates.search(sql, asMember(nora), "helene"), { code: "forbidden" });
});

test("the talent pool: who agreed, once each; proposed for another job with a copy of their CV", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Pool test");
  const next = await openJob(sql, recruiter(), "Pool next");
  const a = (await candidates.apply(sql, application(job.slug, { name: "Anna Pool", email: "anna.pool@example.com", pool: true }))).candidate;
  await candidates.apply(sql, application(job.slug, { name: "Not Pool", email: "not.pool@example.com" }));
  const list = await candidates.pool(sql, recruiter());
  assert.ok(list.some(f => f.id === a.id));
  assert.ok(!list.some(f => f.name === "Not Pool"));
  assert.deepEqual((await candidates.pool(sql, recruiter(), "anna")).map(f => f.id), [a.id]);
  await assert.rejects(candidates.pool(sql, asMember(hugo)), { code: "forbidden" });
  let copied = 0;
  const copy = await candidates.considerFor(sql, recruiter(), a.id, next.id, async () => { copied++; return null; });
  assert.deepEqual([copy.jobId, copy.source, copy.name, copy.poolAt !== null], [next.id, "pool", "Anna Pool", true]);
  assert.equal(copied, 0, "no CV, nothing copied");
  await assert.rejects(candidates.considerFor(sql, recruiter(), a.id, next.id, async () => null), { code: "already_there" });
  await assert.rejects(candidates.considerFor(sql, recruiter(), a.id, job.id, async () => null), { code: "invalid" });
  const log = (await candidates.candidate(sql, recruiter(), a.id)).activity;
  assert.ok(log.some(x => x.kind === "considered" && x.data["to"] === copy.id));
  // Out of the pool, for every application of that address.
  await candidates.setPool(sql, recruiter(), a.id, false);
  assert.ok(!(await candidates.pool(sql, recruiter())).some(f => f.name === "Anna Pool"));
});

test("screening questions: at most five, checked; answers required when asked, kept with their words", async () => {
  const { sql } = database;
  const q = questions([{ kind: "yesno", label: "Saturdays?", required: true }, { kind: "choice", label: "Start?", options: ["Now", "Later", ""] }]);
  assert.equal(q.length, 2);
  assert.deepEqual(q[1]!.options, ["Now", "Later"]);
  assert.throws(() => questions([{ kind: "choice", label: "One option", options: ["Only"] }]), { code: "invalid" });
  assert.throws(() => questions(Array.from({ length: 6 }, () => ({ kind: "text", label: "Q" }))), { code: "invalid" });
  assert.throws(() => answers(q, {}), { code: "answer_missing" });
  assert.throws(() => answers(q, { [q[0]!.id]: "maybe" }), { code: "invalid" });
  assert.deepEqual(answers(q, { [q[0]!.id]: "yes", [q[1]!.id]: "Later" }).map(a => a.answer), ["yes", "Later"]);
  const job = await openJob(sql, recruiter(), "Questions test");
  await jobs.updateJob(sql, recruiter(), job.id, { title: job.title, contract: "permanent", remote: "onsite", description: job.description, questions: q });
  const stored = (await jobs.job(sql, recruiter(), job.id)).job.questions;
  assert.deepEqual(stored.map(x => x.id), q.map(x => x.id));
  await assert.rejects(candidates.apply(sql, application(job.slug)), { code: "answer_missing" });
  const c = (await candidates.apply(sql, application(job.slug, { answers: { [q[0]!.id]: "no" } }))).candidate;
  assert.deepEqual(c.answers, [{ id: q[0]!.id, label: "Saturdays?", answer: "no" }]);
});

test("a job's last day: after it, no longer listed nor open to applications", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Closing test");
  await jobs.updateJob(sql, recruiter(), job.id, { title: job.title, contract: "permanent", remote: "onsite", description: job.description, closesOn: "2020-01-31" });
  assert.ok(!(await jobs.publicJobs(sql)).some(j => j.id === job.id));
  await assert.rejects(candidates.apply(sql, application(job.slug)), { code: "closed" });
  await assert.rejects(jobs.updateJob(sql, recruiter(), job.id, { title: job.title, contract: "permanent", remote: "onsite", closesOn: "2020-02-31" }), { code: "invalid" });
  await assert.rejects(jobs.updateJob(sql, recruiter(), job.id, { title: job.title, contract: "permanent", remote: "onsite", country: "XX" }), { code: "invalid" });
});

test("duplicating a job: a draft with its words, stages and interviewers, no candidates", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Duplicate test");
  await jobs.addStage(sql, recruiter(), job.id, "Trial day");
  await jobs.addInterviewer(sql, recruiter(), job.id, hugo.id, hasTool);
  await candidates.apply(sql, application(job.slug));
  const copy = await jobs.duplicateJob(sql, recruiter(), job.id);
  const d = await jobs.job(sql, recruiter(), copy.id);
  assert.deepEqual([d.job.state, d.job.title, d.job.slug], ["draft", "Duplicate test", "duplicate-test-2"]);
  assert.deepEqual(d.stages.map(label), ["New", "Screening", "Interview", "Offer", "Trial day", "Hired"]);
  assert.deepEqual(d.interviewers, [hugo.id]);
  assert.deepEqual(await candidates.board(sql, recruiter(), copy.id), []);
  await assert.rejects(jobs.duplicateJob(sql, asMember(hugo), job.id), { code: "forbidden" });
});

test("the intro in each language; the one of before only in the Chest's own language", async () => {
  const { sql } = database;
  await sql`delete from settings where key in ('intros', 'intro')`;
  await sql`insert into settings (key, value) values ('intro', '"Des chaises depuis 1962."')`;
  const s = await jobs.settings(sql);
  assert.equal(jobs.introFor(s, "fr"), "Des chaises depuis 1962.");
  assert.equal(jobs.introFor(s, "en"), "", "never the other language's words");
  const saved = await jobs.saveSettings(sql, recruiter(), { intros: { en: "Chairs since 1962.", fr: "" }, accent: "forest", website: "atelier.example", country: "BE" });
  assert.deepEqual([jobs.introFor(saved, "en"), jobs.introFor(saved, "fr"), saved.accent, saved.website, saved.country], ["Chairs since 1962.", "", "forest", "https://atelier.example/", "BE"]);
  await assert.rejects(jobs.saveSettings(sql, recruiter(), { accent: "pink" }), { code: "invalid" });
  await assert.rejects(jobs.saveSettings(sql, recruiter(), { website: "javascript:alert(1)" }), { code: "invalid_link" });
  // Images: only the tool's public files; the old ones said, to delete.
  assert.deepEqual(await jobs.setImages(sql, recruiter(), "logo", [{ object: "public/brand/aaaaaaaaaaaaaaaaaaaa.png", version: "1" }]), []);
  assert.deepEqual(await jobs.setImages(sql, recruiter(), "logo", []), ["public/brand/aaaaaaaaaaaaaaaaaaaa.png"]);
  await assert.rejects(jobs.setImages(sql, recruiter(), "logo", [{ object: "cv/x.pdf", version: "1" }]), { code: "invalid" });
  await assert.rejects(jobs.setImages(sql, asMember(hugo), "logo", []), { code: "forbidden" });
});

test("reading another tool's export: columns guessed in English and French, dates, CVs by address", () => {
  // A Teamtailor export as its help centre describes it: columns chosen by
  // whoever exports (names, email, phone, job, stage, "Created at").
  const teamtailor = parseCsv("First name,Last name,Email,Phone,Job,Stage,Created at,LinkedIn URL\nLucie,Garnier,lucie@example.com,+33 6 12 34 56 78,Designer,Interview,2026-05-14 09:12:00 +0200,https://linkedin.com/in/lucie\n");
  const m = guess(teamtailor[0]!);
  assert.deepEqual([m.firstName, m.lastName, m.email, m.phone, m.stage, m.appliedAt, m.link, m.name], [0, 1, 2, 3, 5, 6, 7, undefined]);
  assert.deepEqual(rowsOf(teamtailor, m)[0], { line: 2, name: "Lucie Garnier", email: "lucie@example.com", phone: "+33 6 12 34 56 78", link: "https://linkedin.com/in/lucie", stage: "Interview", appliedAt: "2026-05-14 09:12:00 +0200", coverLetter: "" });
  // A French spreadsheet (Welcome to the Jungle's per-candidate CSV, or by hand): ";" and French headers.
  const wttj = parseCsv("Nom complet;Adresse e-mail;Téléphone;Étape;Date de candidature;Lettre de motivation\nHélène Vasseur;helene@example.com;06 10 20 30 40;Entretien;14/05/2026;Bonjour\n");
  const f = guess(wttj[0]!);
  assert.deepEqual([f.name, f.email, f.phone, f.stage, f.appliedAt, f.coverLetter], [0, 1, 2, 3, 4, 5]);
  assert.equal(dateOf("14/05/2026"), "2026-05-14");
  assert.equal(dateOf("2026-05-14T09:12:00Z"), "2026-05-14");
  assert.equal(dateOf("31/02/2026"), null);
  assert.equal(emailInName("cv_Lucie.Garnier@Example.com.pdf"), "lucie.garnier@example.com");
  assert.equal(emailInName("cv.pdf"), null);
});

test("importing: rows land in the matched stages with their date; errors, duplicates and old rows skipped; Undo", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Import test");
  const stages = (await jobs.job(sql, recruiter(), job.id)).stages;
  const today = new Date("2026-09-29T10:00:00Z");
  const rows = [
    { line: 2, name: "Lucie Garnier", email: "lucie.i@example.com", stage: "Interview", appliedAt: "2026-05-14" },
    { line: 3, name: "Marc Petit", email: "not-an-email", stage: "", appliedAt: "" },
    { line: 4, name: "Lucie again", email: "LUCIE.I@example.com", stage: "", appliedAt: "" },
    { line: 5, name: "Very old", email: "old@example.com", stage: "", appliedAt: "2020-01-01" },
    { line: 6, name: "", email: "noname@example.com", stage: "", appliedAt: "" },
  ];
  const done = await importRows(sql, recruiter(), job.id, { rows, stages: { Interview: stages[2]!.id }, origin: "Teamtailor", language: "fr" }, today);
  assert.deepEqual(done.added.map(a => a.email), ["lucie.i@example.com"]);
  assert.deepEqual(done.skipped, [{ line: 3, reason: "email" }, { line: 4, reason: "duplicate" }, { line: 5, reason: "old" }, { line: 6, reason: "name" }]);
  const c = (await candidates.candidate(sql, recruiter(), done.added[0]!.id)).candidate;
  assert.deepEqual([c.stageId, c.source, c.origin, c.language, c.createdAt.slice(0, 10)], [stages[2]!.id, "import", "Teamtailor", "fr", "2026-05-14"]);
  await assert.rejects(importRows(sql, asMember(hugo), job.id, { rows, stages: {}, origin: "", language: "en" }), { code: "forbidden" });
  await assert.rejects(importRows(sql, recruiter(), job.id, { rows: [], stages: {}, origin: "", language: "en" }), { code: "import_invalid" });
  // Undo: gone, unless someone worked on them since.
  const again = await importRows(sql, recruiter(), job.id, { rows: [{ line: 2, name: "Iris", email: "iris.i@example.com" }, { line: 3, name: "Noé", email: "noe.i@example.com" }], stages: {}, origin: "", language: "en" }, today);
  await candidates.addNote(sql, recruiter(), again.added[1]!.id, "Called him");
  await undoImport(sql, recruiter(), again.added.map(a => a.id));
  const left = await candidates.board(sql, recruiter(), job.id);
  assert.deepEqual(left.map(x => x.name).sort(), ["Lucie Garnier", "Noé"]);
});

test("reports: counts only, per job and overall", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Report test");
  const stages = (await jobs.job(sql, recruiter(), job.id)).stages;
  const a = (await candidates.apply(sql, application(job.slug, { email: "r1@example.com" }))).candidate;
  const b = (await candidates.apply(sql, application(job.slug, { email: "r2@example.com" }))).candidate;
  await candidates.move(sql, recruiter(), a.id, stages[2]!.id);
  await candidates.move(sql, recruiter(), a.id, stages[4]!.id);
  await candidates.move(sql, recruiter(), b.id, stages[1]!.id);
  await candidates.reject(sql, recruiter(), b.id, "salary");
  const r = await report(sql, recruiter(), job.id);
  assert.deepEqual([r.total, r.active, r.hired, r.rejected, r.hires], [2, 1, 1, 1, 1]);
  assert.deepEqual(r.funnel.map(f => f.reached), [2, 2, 1, 1, 1]);
  assert.deepEqual(r.reasons, [{ reason: "salary", count: 1 }]);
  assert.equal(r.months.length, 6);
  assert.ok((await report(sql, recruiter())).total >= 2);
  await assert.rejects(report(sql, asMember(hugo), job.id), { code: "forbidden" });
  await assert.rejects(report(sql, recruiter(), "999999"), { code: "not_found" });
});

test("a ZIP the tool writes opens; everything exports; a candidate's own data", async () => {
  const { sql } = database;
  const entries: Entry[] = [{ name: "a.txt", data: new TextEncoder().encode("hello ".repeat(100)) }, { name: "../evil/b.bin", data: new Uint8Array([1, 2, 3]) }];
  const bytes = new Uint8Array(await new Response(zipStream(entries)).arrayBuffer());
  const files = await readZip(bytes);
  assert.equal(new TextDecoder().decode(files.get("a.txt")), "hello ".repeat(100));
  assert.deepEqual([...files.get("evil/b.bin")!], [1, 2, 3]);
  const job = await openJob(sql, recruiter(), "Export test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "export@example.com", name: "Eve Export" }))).candidate;
  const all = new Uint8Array(await new Response(zipStream(everything(sql, recruiter(), en))).arrayBuffer());
  const inside = await readZip(all);
  for (const name of ["jobs.csv", "candidates.csv", "notes.csv", "feedback.csv", "emails.csv", "interviews.csv", "history.csv", "README.txt"]) assert.ok(inside.has(name), name);
  assert.match(new TextDecoder().decode(inside.get("candidates.csv")), /Eve Export/u);
  await assert.rejects(everything(sql, asMember(hugo), en).next(), { code: "forbidden" });
  const theirs = await theirData(sql, recruiter(), c.id, en);
  const data = JSON.parse(new TextDecoder().decode(theirs.entries[0]!.data));
  assert.equal(data.candidate.email, "export@example.com");
  await assert.rejects(theirData(sql, asMember(hugo), c.id, en), { code: "forbidden" });
});

test("the files of a candidate's emails, sent and received, are in their data and in the full export (round 3 limit)", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Files export");
  const c = (await candidates.apply(sql, application(job.slug, { email: "files@example.com", name: "Fanny Files" }))).candidate;
  await chestFiles.put("sent/offer-1.pdf", "%PDF offer", "application/pdf");
  await chestFiles.put("sent/offer-2.pdf", "%PDF second", "application/pdf");
  await chestFiles.put("mail/answer.pdf", "%PDF signed", "application/pdf");
  const [out] = await sql<{ id: string }[]>`insert into messages (candidate_id, direction, kind, author, subject, body, status, attachments)
    values (${c.id}, 'out', 'message', ${camille.id}, 'Your offer', 'Here it is.', 'sent', ${sql.json([{ file: "sent/offer-1.pdf", name: "Offer.pdf", type: "application/pdf", size: 10 }, { file: "sent/offer-2.pdf", name: "Offer.pdf", type: "application/pdf", size: 11 }] as never)}) returning id`;
  const [back] = await sql<{ id: string }[]>`insert into messages (candidate_id, direction, kind, subject, body, from_address, status, attachments)
    values (${c.id}, 'in', 'message', 'Re: Your offer', 'Signed.', 'files@example.com', 'received', ${sql.json([{ file: "mail/answer.pdf", name: "../../signed/offer.pdf", type: "application/pdf", size: 11 }, { file: "mail/gone.pdf", name: "gone.pdf", type: "application/pdf", size: 1 }] as never)}) returning id`;
  const sent = `emails/${out!.id}/Offer.pdf`, second = `emails/${out!.id}/2-Offer.pdf`, signed = `emails/${back!.id}/__.._signed_offer.pdf`;
  assert.deepEqual(emailFiles({ id: back!.id, attachments: [{ file: "x", name: "../../signed/offer.pdf", type: "", size: 0 }] }).map(f => f.path), [signed], "one path segment per name");
  // The candidate's own archive: the files beside data.json, named in it.
  const theirs = await theirData(sql, recruiter(), c.id, en);
  const names = theirs.entries.map(e => e.name);
  for (const name of [sent, second, signed]) assert.ok(names.includes(name), name);
  assert.ok(!names.some(n => n.includes("gone")), "a file the Chest no longer has is left out");
  assert.equal(new TextDecoder().decode(theirs.entries.find(e => e.name === second)!.data), "%PDF second");
  const data = JSON.parse(new TextDecoder().decode(theirs.entries[0]!.data));
  assert.deepEqual(data.emails.map((m: { files: string[] }) => m.files), [[sent, second], [signed, `emails/${back!.id}/gone.pdf`]]);
  // The full export: the same files, named in emails.csv.
  const inside = await readZip(new Uint8Array(await new Response(zipStream(everything(sql, recruiter(), en))).arrayBuffer()));
  assert.equal(new TextDecoder().decode(inside.get(signed)), "%PDF signed");
  assert.ok(inside.has(sent) && inside.has(second));
  const rows = parseCsv(new TextDecoder().decode(inside.get("emails.csv")));
  assert.equal(rows[0]!.at(-1), "Files");
  assert.ok(rows.some(r => r.at(-1) === `${sent}\n${second}`), "each email names its files");
});
