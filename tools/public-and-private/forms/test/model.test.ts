import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/lib/app-error.ts";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import { check, walk } from "../src/shared/logic.ts";
import { blank, copyDefinition, definition, definitionFromText, limits, problems, readIn, redirectUrl, settings, sniff, typesFor } from "../src/shared/model.ts";
import { template, templateKeys } from "../src/lib/templates.ts";
import { zonedInstant, zonedParts } from "../src/shared/zone.ts";
import { form, opts, q } from "./support/fixtures.ts";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : "other";
  }
  return "none";
};

test("a draft may be unfinished, never malformed", () => {
  const draft = form([q("short", "")]);
  assert.deepEqual(definition(JSON.parse(JSON.stringify(draft))), draft);
  assert.equal(code(() => definition({ ...draft, pages: [] })), "invalid");
  assert.equal(code(() => definition({ ...draft, pages: [{ ...draft.pages[0]!, id: "X!" }] })), "invalid");
  assert.equal(code(() => definition(form([{ ...q("short", "a"), kind: "script" as never }]))), "invalid");
  const twice = q("short", "a");
  assert.equal(code(() => definition(form([twice, twice]))), "invalid", "an id used twice");
  assert.equal(code(() => definition(form([q("short", "x".repeat(limits.questionTitle + 1))]))), "too_long");
  assert.equal(code(() => definitionFromText("{".repeat(10))), "invalid");
  assert.equal(code(() => definitionFromText("x".repeat(limits.definitionBytes + 1))), "too_long");
  assert.equal(code(() => definition(form(Array.from({ length: limits.questions + 1 }, () => q("short", "a"))))), "invalid");
});

test("what is read is cleaned: control characters, bidi overrides, unknown fields", () => {
  const read = definition({ title: " Hello‮\u0007 ", intro: "a\r\nb", pages: [{ id: "abcdefgh", title: "", jumps: [], questions: [{ id: "qqqqqqqq", kind: "short", title: "Name", required: true, script: "<x>" }] }] });
  assert.equal(read.title, "Hello");
  assert.equal(read.intro, "a\nb");
  assert.deepEqual(Object.keys(read.pages[0]!.questions[0]!).sort(), ["help", "id", "kind", "required", "title"]);
});

test("publishing needs a title, a question, texts and sound conditions", () => {
  const empty = blank();
  assert.deepEqual(problems(empty).map(p => p.code), ["no_title", "no_questions"]);
  const later = q("short", "Later");
  const early = q("short", "Early", { showIf: { question: later.id, op: "answered" } });
  const choice = q("choice", "Pick", { options: opts("Only") });
  const found = problems(form([early, later, choice, q("short", "")], "Ok")).map(p => p.code).sort();
  assert.deepEqual(found, ["condition_later", "few_options", "question_title"].sort());
  const good = form([q("short", "Name"), q("choice", "Pick", { options: opts("A", "B") })], "Good");
  assert.deepEqual(problems(good), []);
});

test("every template in every language can be published as it is, and its logic works", () => {
  for (const [name, words] of [["en", en], ["fr", fr]] as const) {
    for (const key of templateKeys.filter(k => k !== "blank")) {
      const { definition: def } = template(key, words as never);
      assert.deepEqual(problems(definition(def)), [], `${name} ${key}`);
    }
  }
  const { definition: feedback } = template("feedback", en as never);
  const score = feedback.pages[0]!.questions[1]!;
  assert.equal(walk(feedback, { [score.id]: 3 }).pages.length, 3);
  assert.equal(walk(feedback, { [score.id]: 10 }).pages.length, 3);
  assert.notEqual(walk(feedback, { [score.id]: 3 }).pages[1]!.page.id, walk(feedback, { [score.id]: 10 }).pages[1]!.page.id);
  const { definition: event } = template("event", en as never);
  const lunch = event.pages[0]!.questions[4]!;
  const diet = event.pages[0]!.questions[5]!;
  assert.ok(!(diet.id in check(event, { [lunch.id]: false, [diet.id]: "vegan" }).answers));
});

test("a copied form gets new ids everywhere, its logic following them", () => {
  const { definition: def } = template("feedback", en as never);
  const copy = copyDefinition(def);
  const ids = (d: typeof def) => d.pages.flatMap(p => [p.id, ...p.questions.map(x => x.id)]);
  assert.equal(ids(copy).filter(i => ids(def).includes(i)).length, 0);
  assert.deepEqual(problems(copy), []);
  assert.equal(copy.pages[0]!.jumps[0]!.to, copy.pages[2]!.id);
  assert.equal(copy.pages[0]!.jumps[0]!.when.question, copy.pages[0]!.questions[1]!.id);
});

test("settings: https redirects only; anonymous means team, once and no copy", () => {
  assert.equal(redirectUrl("https://example.com/thanks"), "https://example.com/thanks");
  for (const bad of ["http://example.com", "javascript:alert(1)", "https://user:pw@example.com", "https://localhost/"]) assert.equal(code(() => redirectUrl(bad)), "invalid_url", bad);
  const base = { audience: "team", anonymous: true, once: false, sendCopy: true, layout: "steps", accent: "teal", watchers: [] };
  const s = settings(base, null);
  assert.equal(s.anonymous, true);
  assert.equal(s.once, true);
  assert.equal(s.sendCopy, false);
  assert.equal(settings({ ...base, audience: "public" }, null).anonymous, false);
  assert.equal(code(() => settings({ ...base, accent: "neon" }, null)), "invalid");
  assert.equal(code(() => settings({ ...base, retentionMonths: 5 }, null)), "invalid");
  assert.equal(code(() => settings({ ...base, watchers: ["bob"] }, null)), "invalid");
  assert.equal(code(() => settings({ ...base, maxAnswers: 0 }, null)), "invalid");
});

test("a file's first bytes must match its type", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  assert.ok(sniff(new TextEncoder().encode("%PDF-1.7"), "application/pdf"));
  assert.ok(!sniff(new TextEncoder().encode("<html>"), "application/pdf"));
  assert.ok(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"));
  assert.ok(sniff(bytes(0x50, 0x4b, 0x03, 0x04), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  assert.ok(!sniff(bytes(0x50, 0x4b, 0x03, 0x04), "image/svg+xml"), "an unknown type never passes");
  assert.ok(!sniff(bytes(0x41, 0x00), "text/plain"));
  assert.deepEqual(typesFor("images"), ["image/png", "image/jpeg", "image/gif", "image/webp"]);
  assert.ok(!typesFor("any").includes("image/svg+xml"), "no SVG: it can carry scripts");
});

test("a closing day and hour on the Chest's clock", () => {
  assert.equal(zonedInstant("2026-10-24", 18, "Europe/Paris").toISOString(), "2026-10-24T16:00:00.000Z");
  assert.equal(zonedInstant("2026-10-26", 18, "Europe/Paris").toISOString(), "2026-10-26T17:00:00.000Z", "after the change of clock");
  assert.deepEqual(zonedParts(new Date("2026-10-24T16:00:00Z"), "Europe/Paris"), { day: "2026-10-24", hour: 18 });
  assert.throws(() => zonedInstant("2026-13-01", 1, "Europe/Paris"));
});

test("answers read in the member's language when the form has it, as written otherwise", () => {
  const ask = { id: "qaaaaaaa", kind: "short" as const, title: "Your name", help: "", required: false };
  const def = { title: "Contact", intro: "", language: "en" as const, alt: { language: "fr" as const, texts: { title: "Contact FR", qaaaaaaa: "Votre nom" } }, pages: [{ id: "paaaaaaa", title: "", questions: [ask], jumps: [] }] };
  assert.equal(readIn(def, "fr").pages[0]!.questions[0]!.title, "Votre nom");
  assert.equal(readIn(def, "en"), def);
  const { alt: _alt, ...alone } = def;
  assert.equal(readIn(alone, "fr").title, "Contact");
});
