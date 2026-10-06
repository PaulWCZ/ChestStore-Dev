import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import { crossed, publicLimits, reaches, watchFlood } from "../src/lib/flood.ts";
import * as forms from "../src/lib/forms.ts";
import { copyAllowed, copyLimits, copyText } from "../src/lib/mailer.ts";
import { take } from "../src/lib/respond.ts";
import { reading } from "../src/lib/uploads.ts";
import { check } from "../src/shared/logic.ts";
import { clean, limits, skeleton } from "../src/shared/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea } from "./support/members.ts";

// What a stranger on the Internet, or a robot, can make Forms do — and
// the limits that hold it (README "On a Chest", Settings' sentences).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], storage: { publicUploads: true }, mail: { domain: "atelier.test" }, chest: { organization: "Atelier Martin" } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

async function publicForm(questions: ReturnType<typeof q>[], extra: Record<string, unknown> = {}) {
  const { sql } = database;
  const made = await forms.create(sql, asMember(ines), { definition: form(questions, "Contact us") });
  await forms.saveSettings(sql, asMember(ines), made.id, { audience: "public", layout: "classic", accent: "forest", watchers: [ines.id], ...extra }, null);
  await forms.publish(sql, asMember(ines), made.id);
  return (await forms.bySlug(sql, made.slug))!.form;
}
const warnings = async (run: () => Promise<unknown>) => {
  const said: string[] = [];
  const warn = console.warn;
  console.warn = (line: string) => void said.push(line);
  try {
    await run();
  } finally {
    console.warn = warn;
  }
  return said;
};

test("a form whose answers go further spends the tighter budget: copies, links to Clients or Support, web addresses", async () => {
  const { sql } = database;
  const email = q("email", "Email");
  assert.equal(await reaches(sql, await publicForm([email])), false);
  assert.equal(await reaches(sql, await publicForm([email], { sendCopy: true })), true);
  const hooked = await publicForm([email]);
  await sql`insert into form_hooks (id, form_id, kind, label, shown, created_by) values ('whk_test0000000000000000000001', ${hooked.id}, 'slack', 'Sales', 'https://hooks.slack.com/…', ${ines.id})`;
  assert.equal(await reaches(sql, hooked), true);
  await sql`update form_hooks set disabled_at = now() where form_id = ${hooked.id}`;
  assert.equal(await reaches(sql, hooked), false, "a stopped address sends nothing");
  // The budgets as Settings says them: far fewer for a form that reaches.
  assert.ok(publicLimits.reaching.perSubject * 5 <= publicLimits.answers.perSubject);
  assert.ok(publicLimits.files.perSubject * limits.fileSize <= 2 * 2 ** 30, "a robot's files: at most 2 GiB a form a day");
});

test("a flood is said in the log: at half, four fifths and the whole of a form's day, once each, counts only", async () => {
  assert.deepEqual([0, 98, 99, 100, 158, 159, 198, 199, 200].map(n => crossed(n, 200)), [null, null, 0.5, null, null, 0.8, null, 1, null]);
  const { sql } = database;
  const f = await publicForm([q("short", "Name")]);
  await sql`insert into answers (id, form_id, version, data, created_at, month, language)
    select lpad(to_hex(g + 900000), 16, '0'), ${f.id}, 1, '{}', now(), date_trunc('month', now())::date, 'en' from generate_series(1, 9) g`;
  const said = await warnings(() => watchFlood(sql, f, 20));
  assert.equal(said.length, 1);
  assert.match(said[0]!, /^warn "public answers: the form's budget for today runs low" form=\d+ today=10 budget=20$/u);
  assert.deepEqual(await warnings(() => watchFlood(sql, f, 40)), [], "not at a mark: nothing");
});

test("a public form's copy: only when the visitor asks, only the form's own words, at most one an address a day and a few an hour", async () => {
  const { sql } = database;
  const email = q("email", "Email", { required: true });
  const message = q("long", "Message");
  const topic = q("choice", "Topic", { options: opts("Quote", "Visit"), other: true });
  const f = await publicForm([email, message, topic], { sendCopy: true });
  const spam = "Win a prize at https://evil.example now";
  const answers = (to: string) => ({ [email.id]: to, [message.id]: spam, [topic.id]: { ids: [], other: spam } });
  const before = chest.outbox.length;
  assert.deepEqual(await take(sql, f, { version: 1, answers: answers("a@example.com") }, null, "en"), { copy: false }, "not asked: no copy");
  assert.equal(chest.outbox.length, before);
  assert.deepEqual(await take(sql, f, { version: 1, answers: answers("a@example.com") }, null, "en", { copyAsked: true }), { copy: true });
  const mail = chest.outbox.at(-1)!;
  assert.ok(!mail.text.includes("evil") && !mail.text.includes("prize"), mail.text);
  assert.match(mail.text, /Topic\n {2}Other: …/u);
  assert.match(mail.text, /Your 2 written answers are not repeated in this email\./u);
  assert.equal(mail.subject, "Your answers — Contact us");
  // The same address again today: held back, and the log says why.
  const said = await warnings(async () => assert.deepEqual(await take(sql, f, { version: 1, answers: answers("a@example.com") }, null, "en", { copyAsked: true }), { copy: false }));
  assert.match(said.join("\n"), /copy by email held back.*reason=address/u);
  // A flood of addresses: at most copyLimits.perHour an hour.
  await sql`insert into answers (id, form_id, version, data, created_at, month, language, email, sent)
    select lpad(to_hex(g + 800000), 16, '0'), ${f.id}, 1, '{}', now(), date_trunc('month', now())::date, 'en', 'x' || g || '@example.com', '{copy}' from generate_series(1, ${copyLimits.perHour}) g`;
  assert.equal(await copyAllowed(sql, f.id, "new@example.com", "0000000000000000"), false);
  // Whoever asks for it, a copy by email never carries what was typed.
  const text = copyText(form([message]), { [message.id]: "Visit https://evil.test now" }, "en", "Atelier Martin").text;
  assert.doesNotMatch(text, /evil\.test/u);
  assert.match(text, /Your written answer is not repeated in this email\./u);
});

test("a form takes 10,000 answers at most, whatever its own limit says", async () => {
  const { sql } = database;
  const name = q("short", "Name", { required: true });
  const f = await publicForm([name]);
  await assert.rejects(forms.saveSettings(sql, asMember(ines), f.id, { audience: "public", layout: "classic", accent: "forest", watchers: [], maxAnswers: limits.maxAnswers + 1 }, null), (e: unknown) => e instanceof AppError && e.code === "invalid");
  await sql`update forms set answer_count = ${limits.maxAnswers - 1} where id = ${f.id}`;
  await take(sql, (await forms.bySlug(sql, f.slug))!.form, { version: 1, answers: { [name.id]: "Last" } }, null, "en");
  const full = (await forms.bySlug(sql, f.slug))!.form;
  assert.deepEqual(forms.openState(full), { open: false, reason: "full" });
  await assert.rejects(take(sql, full, { version: 1, answers: { [name.id]: "One more" } }, null, "en"), (e: unknown) => e instanceof AppError && e.code === "full");
  // Even when a limit above it was kept from before.
  await sql`update forms set max_answers = 50000 where id = ${f.id}`;
  assert.equal(forms.openState((await forms.bySlug(sql, f.slug))!.form).reason, "full");
});

test("files the tool reads itself are read two at a time, whatever arrives together", async () => {
  let busy = 0, most = 0;
  await Promise.all(Array.from({ length: 8 }, () => reading(async () => {
    busy++;
    most = Math.max(most, busy);
    await new Promise(go => setTimeout(go, 5));
    busy--;
  })));
  assert.equal(most, 2);
});

test("an anonymous form with answers: its words may change, its questions not; its answers keep no reader's language", async () => {
  const { sql } = database;
  const mood = q("rating", "Your week", { required: true, steps: 5 });
  const made = await forms.create(sql, asMember(ines), { definition: { ...form([mood], "Pulse"), language: "en" }, settings: { audience: "team", anonymous: true } });
  await forms.publish(sql, asMember(ines), made.id);
  const f = (await forms.bySlug(sql, made.slug))!.form;
  await take(sql, f, { version: 1, answers: { [mood.id]: 4 } }, asMember(hugo), "fr");
  const [kept] = await sql<{ language: string }[]>`select language from answers where form_id = ${f.id}`;
  assert.equal(kept!.language, "en", "the form's language, not the French reader's");
  const open = async () => (await forms.open(sql, asMember(ines), f.id, "editor")).form;
  // Words only: published, and every answer moves to the new version.
  const reworded = structuredClone((await open()).draft);
  reworded.pages[0]!.questions[0]!.title = "How was your week?";
  await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify(reworded), (await open()).revision);
  assert.equal((await forms.publish(sql, asMember(ines), f.id)).version, 2);
  assert.deepEqual((await sql<{ version: number }[]>`select distinct version from answers where form_id = ${f.id}`).map(r => r.version), [2]);
  // A new question: refused.
  const grown = structuredClone((await open()).draft);
  grown.pages[0]!.questions.push(q("short", "Anything else?"));
  await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify(grown), (await open()).revision);
  await assert.rejects(forms.publish(sql, asMember(ines), f.id), (e: unknown) => e instanceof AppError && e.code === "anonymous_questions");
  assert.notDeepEqual(skeleton(grown), skeleton(reworded));
  // Someone else's anonymous answer cannot be asked of a second member
  // through a stale version either: lea answers the published one.
  await take(sql, (await forms.bySlug(sql, f.slug))!.form, { version: 1, answers: { [mood.id]: 2 } }, asMember(lea), "en");
  assert.deepEqual((await sql<{ version: number }[]>`select distinct version from answers where form_id = ${f.id}`).map(r => r.version), [2]);
});

test("invisible characters never reach an answer or a form: bidi overrides, zero-width spaces (an emoji's joiner stays)", () => {
  const name = q("short", "Name");
  const { answers } = check(form([name]), { [name.id]: "Nina‮​Roux \u{1F469}‍\u{1F4BB}" });
  assert.equal(answers[name.id], "NinaRoux \u{1F469}‍\u{1F4BB}");
  assert.equal(clean("Con⁦tact﻿", 100), "Contact");
});
