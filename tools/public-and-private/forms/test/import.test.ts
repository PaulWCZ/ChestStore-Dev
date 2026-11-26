import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../src/lib/app-error.ts";
import { importForm } from "../src/lib/importer.ts";
import { definition, problems } from "../src/shared/model.ts";

// The fixtures follow the documented shapes of each vendor's API (their
// own clients' type definitions: see lib/importer.ts and THIRD_PARTY.md).
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

test("a Google Forms form (forms.get) comes in: pages, kinds, options, Other, grid, required; the rest is listed", () => {
  const { definition: def, source, skipped, questions } = importForm(fixture("google-form.json"));
  assert.equal(source, "google");
  assert.equal(def.title, "Customer satisfaction 2026");
  assert.equal(def.intro, "Three minutes to tell us how we did.");
  assert.equal(def.pages.length, 2);
  assert.equal(def.pages[1]!.title, "About the delivery");
  const kinds = def.pages.flatMap(p => p.questions).map(q => q.kind);
  assert.deepEqual(kinds, ["short", "long", "choice", "choices", "dropdown", "scale", "rating", "matrix", "date", "file", "statement"]);
  assert.equal(questions, 11);
  const [name, , source2, , , nps, , grid, , photos] = def.pages.flatMap(p => p.questions);
  assert.equal(name!.required, true);
  assert.equal(source2!.other, true);
  assert.deepEqual(source2!.options!.map(o => o.label), ["A friend", "Instagram", "Our shop window"]);
  assert.deepEqual([nps!.from, nps!.to, nps!.left, nps!.right], [0, 10, "Not likely", "Very likely"]);
  assert.deepEqual(grid!.rows!.map(r => r.label), ["Welcome", "Advice", "Price"]);
  assert.equal(grid!.options!.length, 4);
  assert.deepEqual([photos!.accept, photos!.max], ["images", 5]);
  assert.deepEqual(skipped.sort(), ["logic", "picture"]);
  // It is a draft the server reads as any other, ready to publish.
  assert.deepEqual(problems(definition(def)), []);
});

test("a Typeform form (GET /forms/{id}) comes in: its language, welcome text, kinds and limits; logic and payment are listed", () => {
  const { definition: def, source, skipped } = importForm(fixture("typeform-form.json"));
  assert.equal(source, "typeform");
  assert.equal(def.language, "en");
  assert.equal(def.title, "Contact us");
  assert.equal(def.intro, "Hello!\n\nWe answer within one working day.");
  const qs = def.pages[0]!.questions;
  assert.deepEqual(qs.map(q => q.kind), ["short", "email", "phone", "choice", "choices", "choice", "number", "scale", "scale", "rating", "ranking", "matrix", "date", "file", "yesno", "long"]);
  assert.equal(qs[0]!.max, 80);
  assert.equal(qs[3]!.other, true);
  assert.deepEqual([qs[6]!.min, qs[6]!.max], [100, 50000]);
  assert.deepEqual([qs[7]!.from, qs[7]!.to], [0, 10]);
  assert.deepEqual([qs[8]!.from, qs[8]!.to], [1, 5]);
  assert.deepEqual(qs[11]!.rows!.map(r => r.label), ["Welcome", "Advice"]);
  assert.deepEqual(qs[11]!.options!.map(r => r.label), ["Poor", "Good", "Excellent"]);
  assert.equal(qs[15]!.help, "A few words are enough.");
  assert.deepEqual(skipped.sort(), ["logic", "payment", "picture"]);
  assert.deepEqual(problems(definition(def)), []);
});

test("a file that is neither is refused, never half-read", () => {
  for (const bad of ["not json", "[]", JSON.stringify({ hello: 1 }), "x".repeat(3 << 20)]) {
    assert.throws(() => importForm(bad), (e: unknown) => e instanceof AppError && e.code === "import_invalid");
  }
});
