import assert from "node:assert/strict";
import { test } from "node:test";
import { fill, localeOf, locales, messagesFor } from "../lib/i18n.ts";

test("the language is the first the browser prefers that the tool speaks, English otherwise", () => {
  assert.equal(localeOf(null), "en");
  assert.equal(localeOf(""), "en");
  assert.equal(localeOf("fr-FR,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(localeOf("en-US,en;q=0.9,fr;q=0.8"), "en");
  assert.equal(localeOf("de-DE,de;q=0.9,fr;q=0.5"), "fr");
  assert.equal(localeOf("de, es"), "en");
  assert.equal(localeOf("en;q=0.2, fr;q=0.7"), "fr");
  assert.equal(localeOf("fr;q=0, en"), "en");
  assert.equal(localeOf("*"), "en");
});

// Every catalogue has the words of every other, none empty.
test("every catalogue says everything", () => {
  const shape = (value: unknown, path = ""): string[] =>
    value !== null && typeof value === "object"
      ? Object.entries(value).flatMap(([key, inner]) => shape(inner, path + "." + key))
      : [path + ":" + typeof value];
  const [first, ...others] = locales.map(messagesFor);
  for (const other of others) assert.deepEqual(shape(other).sort(), shape(first).sort());
  const empty = (value: unknown): boolean => (typeof value === "string" ? value === "" : value !== null && typeof value === "object" && Object.values(value).some(empty));
  for (const locale of locales) assert.ok(!empty(messagesFor(locale)), locale);
});

test("fill replaces the names it is given and keeps the others", () => {
  assert.equal(fill("{count} of {max} at most.", { count: 3, max: 50 }), "3 of 50 at most.");
  assert.equal(fill("Label of field {n}", {}), "Label of field {n}");
});
