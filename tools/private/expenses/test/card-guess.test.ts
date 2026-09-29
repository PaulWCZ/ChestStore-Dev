import assert from "node:assert/strict";
import { test } from "node:test";
import { guessCategory, ruleWords } from "../lib/card-guess.ts";

const rules = [
  { words: "UBER", categoryId: "travel" },
  { words: "UBER EATS", categoryId: "meals" },
  { words: "SNCF", categoryId: "travel" },
  { words: "TOTAL", categoryId: "fuel" },
  { words: "BOULANGER", categoryId: "supplies" },
  { words: "BOULANGERIE", categoryId: "meals" },
  { words: "PEAGE", categoryId: "parking" },
];

test("a card label's category: whole words, accents and case aside, the longest rule wins", () => {
  assert.equal(guessCategory("UBER *TRIP", rules), "travel");
  assert.equal(guessCategory("UBER   *EATS PARIS", rules), "meals");
  assert.equal(guessCategory("CB SNCF-VOYAGEURS 12/09", rules), "travel");
  assert.equal(guessCategory("TOTALENERGIES ST OUEN", rules), null);
  assert.equal(guessCategory("Station total access", rules), "fuel");
  assert.equal(guessCategory("BOULANGERIE PAUL", rules), "meals");
  assert.equal(guessCategory("BOULANGER LILLE", rules), "supplies");
  assert.equal(guessCategory("Péage A1", rules), "parking");
  assert.equal(guessCategory("MONOPRIX PARIS 11", rules), null);
  assert.equal(guessCategory("", rules), null);
  assert.equal(guessCategory("UBER", []), null);
});

test("a rule is kept as plain upper-case words", () => {
  assert.equal(ruleWords("  Uber   eats "), "UBER EATS");
  assert.equal(ruleWords("Péage"), "PEAGE");
  assert.equal(ruleWords("B&B Hotels"), "B B HOTELS");
  assert.equal(ruleWords("***"), "");
});
