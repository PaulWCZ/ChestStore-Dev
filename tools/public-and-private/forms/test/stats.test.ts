import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import * as answers from "../src/lib/answers.ts";
import { db } from "../src/lib/db.ts";
import { answersCsv, archive, fileName } from "../src/lib/downloads.ts";
import * as forms from "../src/lib/forms.ts";
import { catalogue } from "../src/i18n/index.ts";
import { cut } from "../src/lib/notify.ts";
import { companyName, formLink, publicOrigin, teamOrigin } from "../src/lib/public-origin.ts";
import { sign, verify } from "../src/lib/signature.ts";
import { answerStats, shuffledTexts } from "../src/lib/stats.ts";
import { answersVersion, homeVersion } from "../src/lib/versions.ts";
import { summarise } from "../src/shared/summary.ts";
import type { Answers } from "../src/shared/logic.ts";
import type { Definition } from "../src/shared/model.ts";
import { everyAnswer } from "./support/answers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";
import { statsOf } from "./support/stats.ts";
import { readZip } from "./support/zip.ts";

atLeast(7);

// What the database counts for the summary (src/lib/stats.ts) is what the
// tool counted in memory before (test/support/stats.ts), kind by kind; the
// exports are written as they are read; the page versions move when what
// the page shows moves.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ tool: "forms", members: everyone, capabilities: ["members", "files", "notifications"], chest: { organization: "Atelier Martin", timeZone: "Europe/Paris" }, network: {} });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

// A download's text as a spreadsheet reads it: its byte-order mark kept.
const read = async (body: BodyInit | ReadableStream<Uint8Array>) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await new Response(body).arrayBuffer());
const noFiles = { files: async () => { throw new Error("no files"); }, drop: async () => {} };

async function published(def: Definition, settings: Record<string, unknown> = {}) {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: def, settings: { audience: (settings["audience"] as "team" | undefined) ?? "public" } });
  await forms.saveSettings(sql, asMember(ines), f.id, { audience: "public", layout: "classic", accent: "berry", watchers: [ines.id], ...settings }, null);
  await forms.publish(sql, asMember(ines), f.id);
  return (await forms.bySlug(sql, f.slug))!;
}

// One question of every kind the summary reads.
const colour = q("choice", "Colour", { options: opts("Red", "Blue", "Green"), other: true });
const many = q("choices", "Days", { options: opts("Mon", "Tue", "Wed") });
const yes = q("yesno", "Coming?");
const stars = q("rating", "Stars", { steps: 5 });
const nps = q("scale", "Recommend", { from: 0, to: 10 });
const count = q("number", "How many");
const day = q("date", "When");
const rank = q("ranking", "Order", { options: opts("A", "B", "C") });
const grid = q("matrix", "Rate", { rows: opts("Price", "Speed"), options: opts("Bad", "Ok", "Good") });
const text = q("short", "Comment");
const all = form([colour, many, yes, stars, nps, count, day, rank, grid, text], "Everything");

function answer(i: number): Answers {
  const pick = (list: { id: string }[], n: number) => list[n % list.length]!.id;
  const a: Answers = {};
  if (i % 7 !== 0) a[colour.id] = i % 5 === 0 ? { ids: [], other: `Pink ${i}` } : { ids: [pick(colour.options!, i)] };
  if (i % 3 !== 0) a[many.id] = { ids: [pick(many.options!, i), pick(many.options!, i + 1)] };
  if (i % 4 !== 0) a[yes.id] = i % 2 === 0;
  a[stars.id] = (i % 5) + 1;
  a[nps.id] = i % 11;
  if (i % 2 === 0) a[count.id] = i * 1.5;
  if (i % 6 !== 0) a[day.id] = `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`;
  if (i % 5 !== 1) a[rank.id] = i % 2 ? [pick(rank.options!, i), pick(rank.options!, i + 1), pick(rank.options!, i + 2)] : [pick(rank.options!, i + 2), pick(rank.options!, i), pick(rank.options!, i + 1)];
  if (i % 3 !== 1) a[grid.id] = { rows: { [grid.rows![0]!.id]: pick(grid.options!, i), ...(i % 2 ? { [grid.rows![1]!.id]: pick(grid.options!, i + 1) } : {}) } };
  if (i % 4 !== 3) a[text.id] = `Note number ${i}`;
  return a;
}

test("the summary counted by the database is the summary counted answer by answer, kind by kind", async () => {
  const { sql } = database;
  const { form: f } = await published(all);
  for (let i = 1; i <= 60; i++) await answers.submit(sql, { form: f, version: f.version, answers: answer(i), respondent: null, language: "en", ...noFiles });
  // A file question's answers, stored as the tool keeps them.
  const versions = await forms.versions(sql, f.id);
  const listed = (await everyAnswer(sql, f.id)).answers;
  const fromDatabase = await answerStats(sql, f.id, versions);
  const inMemory = statsOf(listed, versions);
  assert.equal(fromDatabase.total, 60);
  const words = { yes: "Yes", no: "No", other: "Other" };
  const a = summarise(versions, fromDatabase, words), b = summarise(versions, inMemory, words);
  assert.equal(a.length, 10);
  for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], b[i], a[i]!.column.question.title);
  // A few values read by eye: NPS, a ranking's places, a matrix's cells.
  const recommend = a.find(x => x.column.question.id === nps.id)!.stat;
  assert.ok(recommend.type === "average" && recommend.nps !== null && recommend.nps.promoters + recommend.nps.passives + recommend.nps.detractors === 60);
  const order = a.find(x => x.column.question.id === rank.id)!.stat;
  assert.ok(order.type === "ranks" && order.items.every(i => i.average >= 1 && i.average <= 3));
  const rate = a.find(x => x.column.question.id === grid.id)!.stat;
  assert.ok(rate.type === "grid" && rate.rows[0]!.answered === 40);
});

test("files are counted from their stored names; the texts of an anonymous form come shuffled and capped", async () => {
  const { sql } = database;
  const cv = q("file", "CV", { max: 3 });
  const note = q("long", "Note");
  const { form: f } = await published(form([cv, note], "Files"));
  const stored = (n: number) => ({ file: `answers/${f.id}/${"a".repeat(19)}${n}.pdf`, name: `cv${n}.pdf`, type: "application/pdf", size: 10 });
  const rows: Answers[] = [{ [cv.id]: [stored(1), stored(2)], [note.id]: "one" }, { [cv.id]: stored(3) }, { [note.id]: "two" }, { [note.id]: "   " }];
  for (const [i, data] of rows.entries()) await sql`insert into answers (id, form_id, version, data, created_at, month) values (${"filetest" + String(i).padStart(8, "0")}, ${f.id}, 1, ${sql.json(data as never)}, now(), date_trunc('month', now())::date)`;
  const s = await answerStats(sql, f.id, await forms.versions(sql, f.id));
  assert.equal(s.questions[cv.id]!.withFiles, 2);
  assert.equal(s.questions[cv.id]!.files, 3);
  assert.equal(s.questions[note.id]!.answered, 2, "blank text is not an answer");
  const texts = await shuffledTexts(sql, f.id, [note.id], 1);
  assert.equal(texts.get(note.id)!.count, 2);
  assert.equal(texts.get(note.id)!.texts.length, 1, "capped");
});

test("the CSV is written as it is read: a header, one line per answer, the reader's separator, no formula", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const score = q("scale", "Score", { from: 0, to: 10 });
  const { form: f } = await published(form([name, score], "Feedback: 2026"));
  for (const [n, s] of [["=HYPERLINK(1)", 9], ["Léa", 4], ["Tom; Jr", 10]] as const) await answers.submit(sql, { form: f, version: f.version, answers: { [name.id]: n, [score.id]: s }, respondent: null, language: "en", ...noFiles });
  const fr = await answersCsv(db(), asMember(camille), f.id, catalogue("fr"), "fr", "Europe/Paris");
  assert.equal(fr.name, "Feedback-2026.csv");
  const text = await read(fr.body);
  const lines = text.slice(1).trimEnd().split("\r\n");
  assert.ok(text.startsWith("﻿"));
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "Date;Qui;Name;Score;Suivi;Note;Version du formulaire");
  assert.ok(lines.some(l => l.includes(";'=HYPERLINK(1);9;")), "a formula is defused");
  assert.ok(lines.some(l => l.includes(';"Tom; Jr";10;')), "a cell holding the separator is quoted");
  assert.equal(fileName("  "), "form");
  // Someone the form is not shared with: not found.
  await assert.rejects(answersCsv(db(), asMember(hugo), f.id, catalogue("en"), "en", "UTC"));
});

test("an anonymous form's CSV is its summary, then each written answer on its own line", async () => {
  const { sql } = database;
  const mood = q("rating", "Mood", { steps: 5 });
  const why = q("short", "Why");
  const { form: f } = await published(form([mood, why], "Pulse"), { audience: "team", anonymous: true, once: true });
  const people = [camille, ines, hugo, ...everyone.filter(p => p.role === "member" && p.id !== hugo.id)].slice(0, 5);
  for (const [i, p] of people.entries()) await answers.submit(sql, { form: f, version: f.version, answers: { [mood.id]: (i % 5) + 1, [why.id]: `Reason ${i}` }, respondent: asMember(p), language: "en", ...noFiles });
  const csv = await read((await answersCsv(db(), asMember(ines), f.id, catalogue("en"), "en", "UTC")).body);
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines[0], "Question,Answer,Count,Share (%)");
  assert.equal(lines[1], "Answers,,5,");
  assert.equal(lines.filter(l => l.startsWith("Why,Reason ")).length, 5);
  assert.ok(!csv.includes("mbr_"));
  // Its archive does not exist.
  await assert.rejects(archive(db(), asMember(ines), f.id, catalogue("en"), "en", "UTC"));
});

test("the archive: the CSV, the form, each answer's files in its folder, a read-me — streamed", async () => {
  const { sql } = database;
  const email = q("email", "Email");
  const cv = q("file", "CV");
  const { form: f } = await published(form([email, cv], "Jobs"));
  const object = `answers/${f.id}/${"b".repeat(20)}.pdf`;
  chest.files.set(object, { data: new TextEncoder().encode("%PDF-1.4\n"), type: "application/pdf", updated: new Date().toISOString() } as never);
  await sql`insert into answers (id, form_id, version, email, data, created_at, month) values ('archivetest00001', ${f.id}, 1, 'nina@example.com', ${sql.json({ [email.id]: "nina@example.com", [cv.id]: { file: object, name: "cv/../nina.pdf", type: "application/pdf", size: 9 } } as never)}, '2026-09-20T10:00:00Z', '2026-09-01')`;
  await sql`insert into answers (id, form_id, version, email, data, created_at, month) values ('archivetest00002', ${f.id}, 1, null, ${sql.json({ [cv.id]: { file: `answers/${f.id}/${"c".repeat(20)}.pdf`, name: "gone.pdf", type: "application/pdf", size: 9 } } as never)}, '2026-09-21T10:00:00Z', '2026-09-01')`;
  const zip = await archive(db(), asMember(ines), f.id, catalogue("en"), "en", "Europe/Paris");
  assert.equal(zip.name, "Jobs.zip");
  const entries = readZip(new Uint8Array(await new Response(zip.body).arrayBuffer()));
  assert.deepEqual(entries.map(e => e.name), ["answers.csv", "form.json", "files/2026-09-20 nina@example.com/CV - cv_.._nina.pdf", "read-me.txt"]);
  assert.ok(entries[0]!.data.toString().includes("nina@example.com"));
  assert.match(entries.at(-1)!.data.toString(), /1 files could not be read|could not be read/u);
});

test("page versions move when what the page shows moves, and only then", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const { form: f } = await published(form([name], "Versions"));
  const home = await homeVersion(sql, asMember(ines));
  const list = await answersVersion(sql, asMember(ines), f.id, "?q=");
  assert.equal(await homeVersion(sql, asMember(ines)), home, "nothing changed");
  const { answer } = await answers.submit(sql, { form: f, version: f.version, answers: { [name.id]: "Nina" }, respondent: null, language: "en", ...noFiles });
  assert.notEqual(await homeVersion(sql, asMember(ines)), home, "a new answer");
  const after = await answersVersion(sql, asMember(ines), f.id, "?q=");
  assert.notEqual(after, list);
  await answers.follow(sql, asMember(ines), f.id, answer.id, { note: "Called back" });
  assert.notEqual(await answersVersion(sql, asMember(ines), f.id, "?q="), after, "a note");
  assert.notEqual(await answersVersion(sql, asMember(ines), f.id, "?q=x"), await answersVersion(sql, asMember(ines), f.id, "?q="), "another filter");
  assert.equal(await answersVersion(sql, asMember(ines), "nope", ""), null);
});

test("the small rules: links on the Chest's addresses, the company's name, signed tickets, cut texts", () => {
  assert.equal(publicOrigin(), "https://forms.chest.test");
  assert.equal(teamOrigin(), "https://forms-chest.chest.test");
  assert.equal(formLink({ slug: "abcdefgh", audience: "public" }), "https://forms.chest.test/abcdefgh");
  assert.equal(formLink({ slug: "abcdefgh", audience: "team" }), "https://forms-chest.chest.test/chest/f/abcdefgh");
  assert.equal(companyName(), "Atelier Martin");
  const s = sign("file", "team.x");
  assert.equal(verify("file", "team.x", s), true);
  assert.equal(verify("file", "team.y", s), false);
  assert.equal(verify("image", "team.x", s), false, "a signature serves one purpose");
  assert.equal(cut("  a   b  ", 80), "a b");
  assert.equal(cut("é".repeat(100), 80), "é".repeat(79) + "…");
});
