import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { catalogue } from "../src/i18n/index.ts";
import { AppError } from "../src/lib/app-error.ts";
import { exportRows } from "../src/lib/export.ts";
import * as forms from "../src/lib/forms.ts";
import { countView, forgetViews, reachOf } from "../src/lib/reach.ts";
import { take } from "../src/lib/respond.ts";
import { matches, recall, walk } from "../src/shared/logic.ts";
import { copyDefinition, definition, hiddenNames, hiddenValues, problems, settings, unreachable, type Definition } from "../src/shared/model.ts";
import { everyAnswer } from "./support/answers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines } from "./support/members.ts";

// What brings Forms level with Typeform and Tally: values from the link,
// a text that repeats an answer, rules that join conditions, a page no one
// reaches said in the builder, and how far a form reached.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test" }, chest: { organization: "Atelier Martin" } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});
const words = { yes: "Yes", no: "No", other: "Other" };

test("a text repeats an earlier answer or a value of the link by its name; anything else in braces stays", () => {
  const name = q("short", "Your first name", { key: "first_name" });
  const thanks = q("statement", "Thanks, {first_name}! You came from {utm_source}. {nobody} stays.");
  const def = form([name, thanks]);
  assert.equal(recall(thanks.title, def, { [name.id]: "Nina" }, words, { utm_source: "newsletter" }), "Thanks, Nina! You came from newsletter. {nobody} stays.");
  assert.equal(recall(thanks.title, def, {}, words), "Thanks, ! You came from {utm_source}. {nobody} stays.", "not answered yet: nothing");
});

test("a rule joins up to five conditions, all of them or any one; read, checked and copied like one", () => {
  const size = q("number", "Team size", { required: true });
  const plan = q("choice", "Plan", { options: opts("Free", "Pro") });
  const extra = q("short", "Why so many?");
  const rule = { question: size.id, op: "gt" as const, value: 50, join: "any" as const, more: [{ question: plan.id, op: "is" as const, value: plan.options![1]!.id }] };
  const def = definition({ ...form([size, plan, { ...extra, showIf: rule }]) });
  assert.deepEqual(def.pages[0]!.questions[2]!.showIf, rule);
  assert.equal(matches(rule, { [size.id]: 10, [plan.id]: { ids: [plan.options![1]!.id] } }), true, "any: the plan is enough");
  assert.equal(matches({ ...rule, join: "all" }, { [size.id]: 10, [plan.id]: { ids: [plan.options![1]!.id] } }), false, "all: the size too");
  assert.equal(matches({ ...rule, join: "all" }, { [size.id]: 80, [plan.id]: { ids: [plan.options![1]!.id] } }), true);
  assert.deepEqual(walk(def, { [size.id]: 80 }).pages[0]!.questions.map(x => x.id), [size.id, plan.id, extra.id]);
  // Every condition is checked: one that points later is a problem.
  const later = { ...rule, more: [{ question: extra.id, op: "answered" as const }] };
  assert.ok(problems(form([size, { ...plan, showIf: later }, extra])).some(p => p.code === "condition_later"));
  // Six conditions: too many; a join that is not all or any: refused.
  assert.throws(() => definition(form([size, { ...extra, showIf: { ...rule, more: Array.from({ length: 5 }, () => rule.more[0]!) } }])), (e: unknown) => e instanceof AppError && e.code === "invalid");
  assert.throws(() => definition(form([size, plan, { ...extra, showIf: { ...rule, join: "some" } as never }])), (e: unknown) => e instanceof AppError);
  // A copied form keeps its joined rules on the new ids.
  const copy = copyDefinition(def);
  const copied = copy.pages[0]!.questions[2]!.showIf!;
  assert.equal(copied.question, copy.pages[0]!.questions[0]!.id);
  assert.equal(copied.more![0]!.question, copy.pages[0]!.questions[1]!.id);
  assert.equal(copied.more![0]!.value, copy.pages[0]!.questions[1]!.options![1]!.id);
});

test("a page no one reaches is said: the page before always jumps, and no rule leads to it", () => {
  const ok = q("yesno", "Coming?", { required: true });
  const page = (id: string, questions: ReturnType<typeof q>[], jumps: Definition["pages"][number]["jumps"] = []) => ({ id, title: "", questions, jumps });
  const def: Definition = { title: "Party", intro: "", pages: [
    page("pageaaaa", [ok], [{ when: { question: ok.id, op: "is", value: true }, to: "pagecccc" }, { when: { question: ok.id, op: "is", value: false }, to: "end" }]),
    page("pagebbbb", [q("short", "Never asked")]),
    page("pagecccc", [q("short", "Diet")]),
  ] };
  assert.deepEqual(unreachable(def), ["pagebbbb"]);
  // An answer the rules do not cover (not required): the next page is reached.
  const loose = structuredClone(def);
  loose.pages[0]!.questions[0]!.required = false;
  assert.deepEqual(unreachable(loose), []);
  // A choice whose every option jumps.
  const pick = q("choice", "Which?", { required: true, options: opts("A", "B") });
  const both = { ...def, pages: [page("pageaaaa", [pick], pick.options!.map(o => ({ when: { question: pick.id, op: "is" as const, value: o.id }, to: "pagecccc" }))), def.pages[1]!, def.pages[2]!] };
  assert.deepEqual(unreachable(both), ["pagebbbb"]);
  assert.deepEqual(problems(def), [], "said, never blocking");
});

test("values from the link: the names a form reads, ten at most; an answer keeps what the link gave for them, shown in its CSV", async () => {
  assert.deepEqual(hiddenNames("utm_source, ref ref"), ["utm_source", "ref"]);
  assert.throws(() => hiddenNames("utm-source"), (e: unknown) => e instanceof AppError && e.code === "hidden_fields");
  assert.throws(() => hiddenNames(Array.from({ length: 11 }, (_, i) => `n${i}`)), (e: unknown) => e instanceof AppError);
  assert.deepEqual(hiddenValues(["utm_source", "ref"], { utm_source: " news‮letter\n ", other: "x", ref: 4 }), { utm_source: "newsletter" });
  assert.equal(hiddenValues(["ref"], { ref: "x".repeat(900) }).ref!.length, 200);
  const { sql } = database;
  const name = q("short", "Name", { required: true });
  const made = await forms.create(sql, asMember(ines), { definition: form([name], "Sign up") });
  await forms.saveSettings(sql, asMember(ines), made.id, { audience: "public", layout: "classic", accent: "teal", watchers: [], hiddenFields: "utm_source, ref" }, null);
  await forms.publish(sql, asMember(ines), made.id);
  const f = (await forms.bySlug(sql, made.slug))!.form;
  assert.deepEqual(f.hiddenFields, ["utm_source", "ref"]);
  await take(sql, f, { version: 1, answers: { [name.id]: "Nina" }, hidden: { utm_source: "newsletter", admin: "yes" } }, null, "en");
  const { answers } = await everyAnswer(sql, f.id);
  assert.deepEqual(answers[0]!.hidden, { utm_source: "newsletter" }, "only the form's names");
  const rows = exportRows({ form: f, versions: new Map([[1, f.draft]]), t: catalogue("en"), locale: "en", zone: "UTC", names: new Map(), answers });
  assert.deepEqual(rows[0]!.slice(3, 5), ["utm_source", "ref"]);
  assert.deepEqual(rows[1]!.slice(3, 5), ["newsletter", ""]);
  // An anonymous form reads nothing from its link.
  assert.deepEqual(settings({ audience: "team", anonymous: true, layout: "classic", accent: "teal", watchers: [], hiddenFields: "ref" }, null).hiddenFields, []);
});

test("how far a form reached: its openings, the answers since, the share; its answers day by day (never for an anonymous form)", async () => {
  const { sql } = database;
  const name = q("short", "Name", { required: true });
  const made = await forms.create(sql, asMember(ines), { definition: form([name], "Open day") });
  await forms.saveSettings(sql, asMember(ines), made.id, { audience: "public", layout: "classic", accent: "teal", watchers: [] }, null);
  await forms.publish(sql, asMember(ines), made.id);
  const f = (await forms.bySlug(sql, made.slug))!.form;
  assert.deepEqual(await reachOf(sql, f), { since: null, views: 0, answers: 0, rate: null, days: (await reachOf(sql, f)).days });
  for (let i = 0; i < 4; i++) await countView(sql, f.id);
  await take(sql, f, { version: 1, answers: { [name.id]: "Nina" } }, null, "en");
  const reach = await reachOf(sql, f);
  assert.equal(reach.views, 4);
  assert.equal(reach.answers, 1);
  assert.equal(reach.rate, 25);
  assert.equal(reach.days!.length, 30);
  assert.equal(reach.days!.at(-1)!.count, 1);
  assert.equal(reach.days!.reduce((n, d) => n + d.count, 0), 1);
  assert.equal((await reachOf(sql, { ...f, anonymous: true })).days, null);
  await sql`update form_views set day = current_date - 500 where form_id = ${f.id}`;
  await forgetViews(sql);
  assert.equal((await reachOf(sql, f)).views, 0);
});
