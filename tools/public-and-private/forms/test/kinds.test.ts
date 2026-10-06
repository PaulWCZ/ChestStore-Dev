import assert from "node:assert/strict";
import { test } from "node:test";
import { answerText, check, prefill, read } from "../src/shared/logic.ts";
import { copyDefinition, definition, enterOption, languageFor, localize, newId, newQuestion, problems, untranslated, type Definition } from "../src/shared/model.ts";
import { summarise } from "../src/shared/summary.ts";
import { statsOf } from "./support/stats.ts";
import { form, opts, q } from "./support/fixtures.ts";

const words = { yes: "Yes", no: "No", other: "Other" };
const picture = (object = "public/pictures/" + "a".repeat(20) + ".png") => ({ object, version: "1" });

test("Enter in an option goes to the next empty one, or adds one right after, and says where the cursor goes", () => {
  const a = { id: newId(), label: "Fish" }, b = { id: newId(), label: "" }, c = { id: newId(), label: "Meat" };
  // The next option is empty (the new question's second one): no new option, the cursor moves there.
  const one = enterOption([a, b], 0);
  assert.equal(one.options.length, 2);
  assert.equal(one.focus, 1);
  // The next one has words: a new empty option right after, focused.
  const two = enterOption([a, c], 0);
  assert.deepEqual(two.options.map(o => o.label), ["Fish", "", "Meat"]);
  assert.equal(two.focus, 1);
  // On the last option: a new one at the end.
  const three = enterOption([a, c], 1);
  assert.deepEqual(three.options.map(o => o.label), ["Fish", "Meat", ""]);
  assert.equal(three.focus, 2);
});

test("a new question's options are empty (placeholders in the builder), and an empty one blocks publishing", () => {
  const choice = newQuestion("choice");
  assert.deepEqual(choice.options!.map(o => o.label), ["", ""]);
  choice.title = "Pick";
  const found = problems(form([choice])).map(p => p.code);
  assert.ok(found.includes("empty_option"));
  const matrix = newQuestion("matrix", { columns: ["Poor", "Good"] });
  assert.deepEqual(matrix.options!.map(o => o.label), ["Poor", "Good"]);
  assert.equal(matrix.rows!.length, 2);
});

test("matrix: one column per row, every row when required, stored in the rows' order, summarised row by row", () => {
  const [r1, r2] = opts("Price", "Quality");
  const [c1, c2, c3] = opts("Poor", "Good", "Excellent");
  const m = q("matrix", "Rate us", { rows: [r1!, r2!], options: [c1!, c2!, c3!], required: true });
  assert.equal(read(m, { rows: { [r1!.id]: c2!.id } }).error, "every_row");
  assert.equal(read(m, { rows: { [r1!.id]: "zzzzzzzz" } }).error, "invalid");
  assert.equal(read(m, { rows: { zzzzzzzz: c1!.id } }).error, "invalid");
  const { value } = read(m, { rows: { [r2!.id]: c3!.id, [r1!.id]: c2!.id } });
  assert.deepEqual(Object.keys((value as { rows: Record<string, string> }).rows), [r1!.id, r2!.id]);
  assert.equal(answerText(m, value, words), "Price: Good; Quality: Excellent");
  const def = form([m]);
  const s = summarise(new Map([[1, def]]), statsOf([{ data: { [m.id]: value! } }, { data: { [m.id]: { rows: { [r1!.id]: c2!.id, [r2!.id]: c2!.id } } } }], new Map([[1, def]])), words)[0]!;
  assert.equal(s.stat.type, "grid");
  if (s.stat.type === "grid") assert.deepEqual(s.stat.rows[0]!.cells.map(c => c.count), [0, 2, 0]);
});

test("ranking: distinct known items in the respondent's order, all of them when required; average places", () => {
  const items = opts("Price", "Speed", "Quality");
  const r = q("ranking", "What matters most?", { options: items, required: true });
  const ids = items.map(i => i.id) as [string, string, string];
  assert.equal(read(r, [ids[0]]).error, "rank_all");
  assert.equal(read(r, [ids[0], ids[0], ids[1]]).error, "invalid");
  assert.equal(read(r, ["zzzzzzzz"]).error, "invalid");
  const { value } = read(r, [ids[2], ids[0], ids[1]]);
  assert.deepEqual(value, [ids[2], ids[0], ids[1]]);
  assert.equal(answerText(r, value, words), "1. Quality, 2. Price, 3. Speed");
  const s = summarise(new Map([[1, form([r])]]), statsOf([{ data: { [r.id]: value! } }, { data: { [r.id]: [ids[2], ids[1], ids[0]] as string[] } }], new Map([[1, form([r])]])), words)[0]!;
  if (s.stat.type !== "ranks") throw new Error("ranks");
  assert.equal(s.stat.items[0]!.label, "Quality");
  assert.equal(s.stat.items[0]!.average, 1);
  assert.equal(s.stat.items[0]!.firsts, 2);
  // Not required: a partial order is kept.
  assert.deepEqual(read({ ...r, required: false }, [ids[1]]).value, [ids[1]]);
});

test("picture choice: a pick like a choice (one, or several), every option needs a picture before publishing", () => {
  const options = opts("Oak", "Walnut").map(o => ({ ...o, image: picture() }));
  const one = q("picture", "Which wood?", { options });
  assert.deepEqual(read(one, { ids: [options[0]!.id] }).value, { ids: [options[0]!.id] });
  assert.equal(read(one, { ids: options.map(o => o.id) }).error, "invalid");
  const many = { ...one, multiple: true, max: 1 };
  assert.equal(read(many, { ids: options.map(o => o.id) }).error, "too_many");
  assert.deepEqual(problems(form([one])), []);
  const missing = q("picture", "Which wood?", { options: opts("Oak", "Walnut") });
  assert.ok(problems(form([missing])).some(p => p.code === "no_picture"));
  // A picture is a published object of the tool's, nothing else.
  assert.throws(() => definition({ title: "x", intro: "", pages: [{ id: newId(), title: "", jumps: [], questions: [{ ...one, options: [{ id: newId(), label: "x", image: { object: "answers/1/x.png", version: "1" } }] }] }] }));
  assert.equal(prefill(form([one]), { [one.id]: "walnut" })[one.id] !== undefined, true);
});

test("several files per question: up to its number, each a separate reference; one file stays one value", () => {
  const f = q("file", "Your documents", { max: 3 });
  const ref = (n: number) => ({ ref: `team.${"a".repeat(20)}.pdf.${n}`, name: `doc${n}.pdf` });
  assert.deepEqual(read(f, [ref(1), ref(2)]).value, [ref(1), ref(2)]);
  assert.equal(read(f, [ref(1), ref(2), ref(3), ref(4)]).error, "too_many");
  assert.equal(read(f, [ref(1), ref(1)]).error, "invalid");
  assert.equal(answerText(f, [ref(1), ref(2)], words), "doc1.pdf, doc2.pdf");
  const single = q("file", "CV");
  assert.deepEqual(read(single, ref(1)).value, ref(1));
  assert.equal(read(single, [ref(1), ref(2)]).error, "invalid");
});

test("a name in links fills a question (?nps=9), names are unique", () => {
  const nps = q("scale", "Recommend?", { from: 0, to: 10, key: "nps" });
  const def = form([nps]);
  assert.equal(prefill(def, { nps: "9" })[nps.id], 9);
  const twin = q("short", "Other", { key: "nps" });
  assert.ok(problems(form([nps, twin])).some(p => p.code === "key_taken"));
  assert.throws(() => definition({ ...def, pages: [{ ...def.pages[0]!, questions: [{ ...nps, key: "Bad Key" }] }] }));
});

test("a second language: its texts replace the first language's where written; the page speaks one language", () => {
  const colour = q("choice", "Favourite colour", { options: opts("Red", "Blue"), help: "Just one" });
  const def: Definition = { ...form([colour], "Survey"), language: "en", alt: { language: "fr", texts: { title: "Enquête", [colour.id]: "Couleur préférée", [`${colour.id}.${colour.options![0]!.id}`]: "Rouge" } } };
  const read1 = definition(def);
  const fr = localize(read1, "fr");
  assert.equal(fr.title, "Enquête");
  assert.equal(fr.pages[0]!.questions[0]!.title, "Couleur préférée");
  assert.deepEqual(fr.pages[0]!.questions[0]!.options!.map(o => o.label), ["Rouge", "Blue"]);
  assert.equal(fr.pages[0]!.questions[0]!.help, "Just one", "an untranslated text falls back");
  assert.equal(localize(read1, "en").title, "Survey");
  assert.equal(untranslated(read1), 2);
  // The visitor's language when the form has it, the form's own otherwise.
  assert.equal(languageFor(read1, "fr"), "fr");
  assert.equal(languageFor({ language: "en" }, "fr"), "en");
  assert.equal(languageFor({}, "fr"), "fr");
  // Answers are checked against the form itself: the ids are one.
  assert.deepEqual(check(read1, { [colour.id]: { ids: [colour.options![0]!.id] } }).errors, {});
  // A second language needs a first one, and differs from it; keys name what they translate.
  assert.throws(() => definition({ ...def, language: undefined }));
  assert.throws(() => definition({ ...def, alt: { language: "en", texts: {} } }));
  assert.throws(() => definition({ ...def, alt: { language: "fr", texts: { "no such key!": "x" } } }));
  // Duplicating a form keeps its translations on the new ids.
  const copy = copyDefinition(read1);
  const q2 = copy.pages[0]!.questions[0]!;
  assert.equal(copy.alt!.texts[q2.id], "Couleur préférée");
  assert.equal(copy.alt!.texts[`${q2.id}.${q2.options![0]!.id}`], "Rouge");
});
