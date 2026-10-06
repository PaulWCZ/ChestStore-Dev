import assert from "node:assert/strict";
import { test } from "node:test";
import { cut, cutLines, notice } from "../src/lib/notify.ts";

// French typography carries no-break spaces on purpose: U+202F before « : »
// and inside « », U+00A0 in "20,50 €". A notice keeps them, and its body
// keeps its line breaks (the Chest shows them); only other runs of white
// space fold to one space.
const nnbsp = " ", nbsp = " ";
const french = `«${nnbsp}Payer le traiteur${nnbsp}»${nnbsp}: 20,50${nbsp}€`;

test("a French notice keeps its no-break spaces and the body its line breaks", () => {
  const n = notice((_t, locale) => (locale === "fr"
    ? { title: `  ${french}  `, body: `Première ligne${nnbsp}:  ok\n\n  ${french}\n` }
    : { title: "Pay the caterer: €20.50", body: "First line\nSecond line" }), { path: "/chest", key: "k" });
  assert.equal(n.title, "Pay the caterer: €20.50");
  assert.equal(n.body, "First line\nSecond line");
  const fr = n.translations?.["fr"];
  assert.equal(fr?.title, french);
  assert.equal(fr?.body, `Première ligne${nnbsp}: ok\n${french}`);
});

test("cut folds to one line; cutLines keeps lines; both count characters and keep no-break spaces", () => {
  assert.equal(cut(`a \t\n b${nbsp}c`, 80), `a b${nbsp}c`);
  assert.equal(cutLines("a  b\n\n\nc", 80), "a b\nc");
  assert.equal(cut("é".repeat(10), 5), "éééé…");
  assert.equal(cutLines(`${"é".repeat(6)}\n${"é".repeat(6)}`, 9), "éééééé\né…");
  assert.equal(cut(french, 200), french);
});
