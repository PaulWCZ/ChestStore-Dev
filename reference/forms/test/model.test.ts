import assert from "node:assert/strict";
import { test } from "node:test";
import { answers, csv, definition, FormsError, limits, posted, slugOf, slugPattern, storedAnswers, storedFields } from "../lib/model.ts";

const field = (label = "Name", kind = "text", required = true) => ({ label, kind, required });
const form = (fields: unknown[] = [field()], title: unknown = "Sign-up", description: unknown = "") => ({ title, description, fields });
const invalid = (run: () => unknown) => assert.throws(run, (e: unknown) => e instanceof FormsError && e.code === "invalid");

test("a definition is a title, a description and 1 to 50 fields named by their place", () => {
  const read = definition(form([field("  Name  "), field("Email", "email", false), field("Message", "long", false)], " Title ", " Text\non two lines "));
  assert.deepEqual(read, {
    title: "Title",
    description: "Text\non two lines",
    fields: [
      { id: "f1", label: "Name", kind: "text", required: true },
      { id: "f2", label: "Email", kind: "email", required: false },
      { id: "f3", label: "Message", kind: "long", required: false },
    ],
  });
  assert.equal(definition(form(Array.from({ length: limits.fields }, () => field()))).fields.length, limits.fields);
});

test("a definition out of its bounds or its shape is refused", () => {
  invalid(() => definition(form([])));
  invalid(() => definition(form(Array.from({ length: limits.fields + 1 }, () => field()))));
  invalid(() => definition(form([field("x".repeat(limits.label + 1))])));
  invalid(() => definition(form([field("   ")])));
  invalid(() => definition(form([field("Name\u0007")])));
  invalid(() => definition(form([field("Name", "file")])));
  invalid(() => definition(form([{ ...field(), required: "yes" }])));
  invalid(() => definition(form([{ ...field(), extra: 1 }])));
  invalid(() => definition(form([field()], "x".repeat(limits.title + 1))));
  invalid(() => definition(form([field()], "")));
  invalid(() => definition(form([field()], "Title", "x".repeat(limits.description + 1))));
  invalid(() => definition({ ...form(), status: "published" }));
  invalid(() => definition(null));
  invalid(() => definition([form()]));
  // An id sent by the page is no field's: fields are named by the server.
  invalid(() => definition(form([{ id: "f9", ...field() }])));
});

test("posted text is bounded before it is parsed", () => {
  assert.deepEqual(posted(JSON.stringify(form())), form());
  invalid(() => posted("{"));
  invalid(() => posted(42));
  invalid(() => posted(" ".repeat(64 * 1024 + 1)));
});

test("answers are read for each field, by its name, and checked", () => {
  const fields = definition(form([field("Name"), field("Email", "email", false), field("Message", "long", false)])).fields;
  const sent: Record<string, unknown> = { f1: " Claire ", f2: "claire@example.test", f3: "line 1\nline 2", f9: "ignored", constructor: "x" };
  assert.deepEqual(answers(id => sent[id], fields), { ok: true, answers: { f1: "Claire", f2: "claire@example.test", f3: "line 1\nline 2" } });
  assert.deepEqual(answers(() => null, fields), { ok: false, errors: { f1: "required" } });
  const bad = answers(id => ({ f1: "x".repeat(limits.answer + 1), f2: "not-an-address", f3: "\u0000" })[id], fields);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.ok ? {} : bad.errors).sort(), ["f1", "f2", "f3"]);
  // A file, or a line break in a one-line answer, is no answer.
  assert.equal(answers(id => (id === "f1" ? new Blob(["x"]) : ""), fields).ok, false);
  assert.equal(answers(id => (id === "f1" ? "a\nb" : ""), fields).ok, false);
  assert.equal(answers(id => (id === "f1" ? "x".repeat(limits.answer) : ""), fields).ok, true);
});

test("what storage holds is read back as strictly", () => {
  const fields = definition(form([field("Name"), field("Email", "email", false)])).fields;
  assert.deepEqual(storedFields(structuredClone(fields)), fields);
  invalid(() => storedFields([{ ...fields[0], id: "f2" }]));
  invalid(() => storedFields([{ ...fields[0], kind: "script" }]));
  assert.deepEqual(storedAnswers({ f1: "Claire" }, fields), { f1: "Claire", f2: "" });
  invalid(() => storedAnswers({ f1: 3 }, fields));
});

test("a slug is ten characters of an alphabet without look-alikes", () => {
  const slug = slugOf(new Uint8Array([0, 1, 31, 32, 255, 10, 11, 12, 13, 14]));
  assert.equal(slug, "ab9a9kmnpq");
  assert.match(slug, slugPattern);
  assert.throws(() => slugOf(new Uint8Array(9)));
  assert.doesNotMatch("ab9a9kmnpl", slugPattern);
});

test("the CSV quotes what must be and never lets a cell be a formula", () => {
  const fields = definition(form([field("Name, first name"), field("Note", "long", false)])).fields;
  const text = csv(fields, [{ id: "r", at: "2026-09-25T10:00:00.000Z", answers: { f1: "=HYPERLINK(\"x\")", f2: "a\nb" } }], "Received");
  assert.equal(text, 'Received,"Name, first name",Note\r\n2026-09-25T10:00:00.000Z,"\'=HYPERLINK(""x"")","a\nb"\r\n');
});
