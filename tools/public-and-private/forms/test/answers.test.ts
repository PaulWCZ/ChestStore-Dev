import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import type { Member } from "@argentic/chest-sdk/member";
import * as answers from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import * as forms from "../lib/forms.ts";
import type { Definition } from "../lib/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

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

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, code);
};
const noFiles = { files: async () => { throw new AppError("file_missing"); }, drop: async () => {} };

async function published(def: Definition, settings: Record<string, unknown> = {}, owner = ines) {
  const { sql } = database;
  const f = await forms.create(sql, asMember(owner), { definition: def, settings: { audience: (settings["audience"] as "team" | undefined) ?? "public" } });
  if (Object.keys(settings).length) await forms.saveSettings(sql, asMember(owner), f.id, { audience: "public", layout: "steps", accent: "berry", watchers: [owner.id], ...settings }, (settings["closesAt"] as Date | undefined) ?? null);
  await forms.publish(sql, asMember(owner), f.id);
  return (await forms.bySlug(sql, f.slug))!;
}
const send = (f: forms.Form, a: unknown, respondent: Member | null = null, version?: number) =>
  answers.submit(database.sql, { form: f, version: version ?? f.version, answers: a, respondent, language: "en", ...noFiles });

test("an answer is checked against its form on the server: errors per question, nothing kept", async () => {
  const name = q("short", "Name", { required: true });
  const email = q("email", "Email", { required: true });
  const { form: f } = await published(form([name, email]));
  await assert.rejects(send(f, { [name.id]: "Nina", [email.id]: "nope" }), (e: unknown) => e instanceof AppError && e.code === "answers" && e.values[email.id] === "email");
  await assert.rejects(send(f, { [name.id]: "Nina" }), (e: unknown) => e instanceof AppError && e.values[email.id] === "required");
  const { answer } = await send(f, { [name.id]: " Nina ", [email.id]: "Nina@Example.com", zzzzzzzz: "extra" });
  assert.deepEqual(answer.data, { [name.id]: "Nina", [email.id]: "Nina@Example.com" });
  assert.equal(answer.email, "nina@example.com");
  assert.equal(answer.respondent, null);
  await refused(send(f, { [name.id]: "x".repeat(200000) }), "too_long");
  // A visitor cannot pose as a member on a public form.
  await refused(send(f, { [name.id]: "N", [email.id]: "n@x.io" }, asMember(hugo)), "invalid");
});

test("editing a published form: answers keep the version they answered", async () => {
  const { sql } = database;
  const colour = q("choice", "Colour", { options: opts("Red", "Blue"), required: true });
  const { form: f, definition: v1 } = await published(form([colour]));
  const red = v1.pages[0]!.questions[0]!.options![0]!.id;
  await send(f, { [colour.id]: { ids: [red] } });
  // v2 renames the question, removes Red, adds a new question.
  const v2: Definition = structuredClone(v1);
  v2.pages[0]!.questions[0]!.title = "Favourite colour";
  v2.pages[0]!.questions[0]!.options = [v1.pages[0]!.questions[0]!.options![1]!, { id: "greenish", label: "Green" }];
  v2.pages[0]!.questions.push(q("short", "Why?"));
  const { form: now } = await forms.open(sql, asMember(ines), f.id);
  await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify(v2), now.revision);
  await forms.publish(sql, asMember(ines), f.id);
  const after2 = (await forms.bySlug(sql, f.slug))!;
  assert.equal(after2.form.version, 2);
  // Someone who opened version 1 before the change still sends Red.
  const late = await send(after2.form, { [colour.id]: { ids: [red] } }, null, 1);
  assert.equal(late.answer.version, 1);
  await refused(send(after2.form, { [colour.id]: { ids: [red] } }, null, 2), "answers");
  const list = await answers.allAnswers(sql, asMember(ines), f.id);
  assert.deepEqual(list.answers.map(a => a.version).sort(), [1, 1]);
  assert.equal(list.versions.get(1)!.pages[0]!.questions[0]!.title, "Colour");
  // A version from the future is read as the current one.
  const future = await send(after2.form, { [colour.id]: { ids: ["greenish"] } }, null, 99);
  assert.equal(future.answer.version, 2);
});

test("the answer limit holds under concurrent answers: exactly the limit is kept", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const { form: f } = await published(form([name]), { maxAnswers: 3 });
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => send(f, { [name.id]: "Person " + i })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
  assert.ok(results.filter(r => r.status === "rejected").every(r => (r as PromiseRejectedResult).reason instanceof AppError && ["full", "closed"].includes(((r as PromiseRejectedResult).reason as AppError).code)));
  const { form: now } = await forms.open(sql, asMember(ines), f.id);
  assert.equal(now.answerCount, 3);
  assert.deepEqual(forms.openState(now), { open: false, reason: "full" });
  const [{ count }] = (await sql<{ count: number }[]>`select count(*)::int as count from answers where form_id = ${f.id}`) as unknown as [{ count: number }];
  assert.equal(count, 3);
  // Deleting one gives its place back.
  const one = (await answers.allAnswers(sql, asMember(ines), f.id)).answers[0]!;
  await answers.removeAnswer(sql, asMember(ines), f.id, one.id);
  const reopened = (await forms.bySlug(sql, f.slug))!.form;
  assert.equal(forms.openState(reopened).open, true);
});

test("a closed form, or one past its date, takes no answer", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const { form: f } = await published(form([name]));
  await forms.close(sql, asMember(ines), f.id);
  await refused(send((await forms.bySlug(sql, f.slug))!.form, { [name.id]: "late" }), "closed");
  const dated = await published(form([name]), { closesAt: new Date(Date.now() + 1000) });
  await sql`update forms set closes_at = now() - interval '1 minute' where id = ${dated.form.id}`;
  await refused(send((await forms.bySlug(sql, dated.form.slug))!.form, { [name.id]: "late" }), "closed");
});

test("team forms: members only, one answer per member when asked, identity from the Chest", async () => {
  const { sql } = database;
  const pick = q("choice", "Lunch?", { options: opts("Pizza", "Sushi"), required: true });
  const { form: f } = await published(form([pick]), { audience: "team", once: true });
  const pizza = f.draft.pages[0]!.questions[0]!.options![0]!.id;
  await refused(send(f, { [pick.id]: { ids: [pizza] } }), "not_found");
  await refused(send(f, { [pick.id]: { ids: [pizza] } }, asMember(nora)), "not_found");
  const { answer } = await send(f, { [pick.id]: { ids: [pizza] } }, asMember(hugo));
  assert.equal(answer.respondent, hugo.id);
  await refused(send(f, { [pick.id]: { ids: [pizza] } }, asMember(hugo)), "already");
  const many = await published(form([pick]), { audience: "team", once: false });
  await send(many.form, { [pick.id]: { ids: [pizza] } }, asMember(hugo));
  await send(many.form, { [pick.id]: { ids: [pizza] } }, asMember(hugo));
  assert.equal((await answers.allAnswers(sql, asMember(ines), many.form.id)).answers.length, 2);
  assert.ok((await forms.teamForms(sql, asMember(hugo))).find(x => x.slug === f.slug)!.answered);
});

test("anonymous forms: no member id, no time, participants apart, rows in a random order, hidden under five", async () => {
  const { sql } = database;
  const mood = q("rating", "Mood", { steps: 5, required: true });
  const note = q("long", "One thing");
  const { form: f } = await published(form([mood, note]), { audience: "team", anonymous: true }, camille);
  const people = [camille, ines, hugo, lea, tom, sofia];
  await send(f, { [mood.id]: 4, [note.id]: "Good week" }, asMember(people[0]!));
  await refused(send(f, { [mood.id]: 4 }, asMember(people[0]!)), "already");
  await refused(answers.listAnswers(sql, asMember(camille), f.id), "anonymous_rows");
  await refused(answers.allAnswers(sql, asMember(camille), f.id), "too_few");
  await refused(answers.anonymousTexts(sql, asMember(camille), f.id), "too_few");
  for (const p of people.slice(1)) await send(f, { [mood.id]: 3 }, asMember(p));
  const rows = await sql<{ respondent: string | null; email: string | null; created_at: Date | null; xmin: string; ctid: string }[]>`select respondent, email, created_at, xmin::text, ctid::text from answers where form_id = ${f.id}`;
  assert.equal(rows.length, 6);
  assert.ok(rows.every(r => r.respondent === null && r.email === null && r.created_at === null));
  assert.equal(new Set(rows.map(r => r.xmin)).size, 1, "every row rewritten by the last answer's transaction");
  const parts = await sql<{ member: string; xmin: string }[]>`select member, xmin::text from participants where form_id = ${f.id}`;
  assert.deepEqual(parts.map(p => p.member).sort(), people.map(p => p.id).sort());
  assert.equal(new Set(parts.map(p => p.xmin)).size, 1);
  // Nothing in the answers table says who answered.
  const text = JSON.stringify(await sql`select * from answers where form_id = ${f.id}`);
  for (const p of people) assert.ok(!text.includes(p.id));
  // Five and more: the summary shows, and the written answers each on its
  // own — never a row that joins one person's answers; no one can find them
  // to erase.
  await refused(answers.listAnswers(sql, asMember(camille), f.id), "anonymous_rows");
  const all = await answers.allAnswers(sql, asMember(camille), f.id);
  assert.equal(all.answers.length, 6);
  assert.ok(all.answers.every(a => a.respondent === null && a.createdAt === null));
  const texts = await answers.anonymousTexts(sql, asMember(camille), f.id);
  assert.equal(texts.total, 6);
  assert.deepEqual(texts.texts.map(x => [x.question.id, x.texts]), [[note.id, ["Good week"]]]);
  const anyId = (await sql<{ id: string }[]>`select id from answers where form_id = ${f.id} limit 1`)[0]!.id;
  await refused(answers.oneAnswer(sql, asMember(camille), f.id, anyId), "not_found");
  await refused(answers.follow(sql, asMember(camille), f.id, anyId, { status: "done" }), "not_found");
  assert.deepEqual(await answers.findPerson(sql, asMember(camille), "Good week"), []);
  // The order the table gives is not the order people answered, over several tries.
  const orders = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const extra = await published(form([mood]), { audience: "team", anonymous: true }, camille);
    for (const p of people.slice(0, 3)) await send(extra.form, { [mood.id]: 1 + people.indexOf(p) }, asMember(p));
    orders.add((await sql<{ data: Record<string, number> }[]>`select data from answers where form_id = ${extra.form.id} order by id`).map(r => r.data[mood.id]).join(""));
  }
  assert.ok(orders.size > 1, "row order varies: " + [...orders].join(","));
});

test("delete and bring back an answer; viewers cannot delete", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const { form: f } = await published(form([name]));
  const { answer } = await send(f, { [name.id]: "Spam" });
  await forms.share(sql, asMember(ines), f.id, hugo.id, "viewer");
  await refused(answers.removeAnswer(sql, asMember(hugo), f.id, answer.id), "forbidden");
  await refused(answers.removeAnswer(sql, asMember(lea), f.id, answer.id), "not_found");
  await answers.removeAnswer(sql, asMember(ines), f.id, answer.id);
  assert.equal((await answers.listAnswers(sql, asMember(hugo), f.id)).total, 0);
  await answers.restoreAnswer(sql, asMember(ines), f.id, answer.id);
  assert.equal((await answers.listAnswers(sql, asMember(hugo), f.id)).total, 1);
  await refused(answers.oneAnswer(sql, asMember(hugo), f.id, "zzzzzzzzzzzzzzzz"), "not_found");
});

test("search and filter the answers", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const colour = q("choice", "Colour", { options: opts("Red", "Blue") });
  const { form: f } = await published(form([name, colour]));
  const [red, blue] = f.draft.pages[0]!.questions[1]!.options!.map(o => o.id) as [string, string];
  await send(f, { [name.id]: "Alice 100%", [colour.id]: { ids: [red] } });
  await send(f, { [name.id]: "Bob", [colour.id]: { ids: [blue] } });
  await send(f, { [name.id]: "Chloé", [colour.id]: { ids: [red] } });
  assert.equal((await answers.listAnswers(sql, asMember(ines), f.id, { q: "bob" })).matching, 1);
  assert.equal((await answers.listAnswers(sql, asMember(ines), f.id, { q: "100%" })).matching, 1, "% is a character, not a wildcard");
  assert.equal((await answers.listAnswers(sql, asMember(ines), f.id, { question: colour.id, option: red })).matching, 2);
  assert.equal((await answers.listAnswers(sql, asMember(ines), f.id, { question: colour.id, option: "'; drop table answers; --" })).matching, 3, "a bad filter is no filter");
});

test("a person's answers are found by address and erased with their files; managers only", async () => {
  const { sql } = database;
  const email = q("email", "Email", { required: true });
  const { form: f } = await published(form([email]));
  await send(f, { [email.id]: "Paul.Durand@example.org" });
  await send(f, { [email.id]: "other@example.org" });
  await refused(answers.findPerson(sql, asMember(ines), "paul.durand@example.org"), "forbidden");
  const found = await answers.findPerson(sql, asMember(camille), "paul.durand@example.org");
  assert.equal(found.length, 1);
  await refused(answers.erase(sql, asMember(ines), found.map(x => x.id)), "forbidden");
  const { erased } = await answers.erase(sql, asMember(camille), found.map(x => x.id));
  assert.equal(erased, 1);
  assert.deepEqual(await answers.findPerson(sql, asMember(camille), "paul.durand@example.org"), []);
  assert.equal((await answers.listAnswers(sql, asMember(ines), f.id)).total, 1);
  assert.deepEqual(answers.filesOf({ a: { file: "answers/1/abc.pdf", name: "x", type: "application/pdf", size: 1 }, b: "text", c: { ids: [] } }), ["answers/1/abc.pdf"]);
});

test("retention: answers older than the form keeps them are deleted by the nightly cleanup", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const kept = await published(form([name]));
  const { form: f } = await published(form([name]), { retentionMonths: 3 });
  const { answer: old } = await send(f, { [name.id]: "Old" });
  const { answer: fresh } = await send(f, { [name.id]: "Fresh" });
  const { answer: forever } = await send(kept.form, { [name.id]: "Forever" });
  await sql`update answers set created_at = now() - interval '4 months', month = date_trunc('month', now() - interval '4 months')::date where id = ${old.id} or id = ${forever.id}`;
  // An anonymous form's answer keeps only its month: it goes once the whole month is older.
  const anon = await published(form([name]), { audience: "team", anonymous: true, retentionMonths: 1 }, camille);
  await send(anon.form, { [name.id]: "Anon" }, asMember(hugo));
  await sql`update answers set month = date_trunc('month', now() - interval '3 months')::date where form_id = ${anon.form.id}`;
  const gone = await answers.cleanup(sql);
  assert.ok(gone.answers >= 2);
  const left = (await sql<{ id: string }[]>`select id from answers where form_id in (${f.id}, ${kept.form.id}, ${anon.form.id})`).map(r => r.id).sort();
  assert.deepEqual(left, [fresh.id, forever.id].sort());
  assert.equal((await forms.open(sql, asMember(ines), f.id)).form.answerCount, 1);
});

test("forms and answers put aside go for good after their time", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const { form: f } = await published(form([name]));
  const { answer } = await send(f, { [name.id]: "x" });
  await answers.removeAnswer(sql, asMember(ines), f.id, answer.id);
  await sql`update answers set deleted_at = now() - interval '8 days' where id = ${answer.id}`;
  const other = await published(form([name]));
  await forms.remove(sql, asMember(ines), other.form.id);
  await sql`update forms set deleted_at = now() - interval '31 days' where id = ${other.form.id}`;
  await answers.cleanup(sql);
  assert.equal((await sql`select 1 from answers where id = ${answer.id}`).length, 0);
  assert.equal((await sql`select 1 from forms where id = ${other.form.id}`).length, 0);
});
