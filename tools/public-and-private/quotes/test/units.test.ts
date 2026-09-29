import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogue } from "../lib/i18n/index.ts";
import { unitCodes, unitKey, unitText } from "../lib/units.ts";

// "10 exemplaire" was a bug: a unit reads as the quantity says, in the
// document's language.
const fr = catalogue("fr").pdf;
const en = catalogue("en").pdf;

test("known units take their plural; French keeps 1.5 singular, English does not", () => {
  assert.equal(unitText("exemplaire", 10_000, fr, "fr"), "exemplaires");
  assert.equal(unitText("exemplaire", 1000, fr, "fr"), "exemplaire");
  assert.equal(unitText("heure", 1500, fr, "fr"), "heure");
  assert.equal(unitText("jour", 2000, fr, "fr"), "jours");
  assert.equal(unitText("mois", 3000, fr, "fr"), "mois");
  assert.equal(unitText("an", 2000, fr, "fr"), "ans");
  assert.equal(unitText("Jour", 2000, fr, "fr"), "jours");
  assert.equal(unitText("copy", 3000, en, "en"), "copies");
  assert.equal(unitText("day", 1500, en, "en"), "days");
  assert.equal(unitText("day", 1000, en, "en"), "day");
  assert.equal(unitText("flat fee", 2000, en, "en"), "flat fees");
});

test("other units: the regular plural of one word, the rest as typed", () => {
  assert.equal(unitText("affiche", 50_000, fr, "fr"), "affiches");
  assert.equal(unitText("prix", 2000, fr, "fr"), "prix");
  assert.equal(unitText("m²", 12_000, fr, "fr"), "m²");
  assert.equal(unitText("h", 3000, fr, "fr"), "h");
  assert.equal(unitText("jour-homme", 3000, fr, "fr"), "jour-homme");
  assert.equal(unitText("", 3000, fr, "fr"), "");
});

test("the unit codes of a structured invoice, whatever the language it was written in", () => {
  const both = [en, fr];
  assert.equal(unitCodes[unitKey("jours", both)!], "DAY");
  assert.equal(unitCodes[unitKey("hour", both)!], "HUR");
  assert.equal(unitCodes[unitKey("exemplaire", both)!], "H87");
  assert.equal(unitCodes[unitKey("forfait", both)!], "LS");
  assert.equal(unitKey("affiche", both), null);
});
