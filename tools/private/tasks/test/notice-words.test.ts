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

// The French notice of the sweep of 6 October 2026: guillemets, an amount
// and a percentage carry no-break spaces (U+202F, U+00A0) on purpose; the
// title folds to one line, the body keeps its line breaks.
test("a French notice keeps « … », \"20,50 €\" and \"budget : 85 %\" whole, and the body its lines", () => {
  const nn = "\u202f", nb = "\u00a0";
  const title = `«${nn}Déplacement Lyon${nn}»${nn}: 20,50${nb}€`;
  const n = notice((_t, locale) => (locale === "fr"
    ? { title: ` ${title}\n`, body: `«${nn}Déplacement Lyon${nn}»  \n\nMontant${nn}: 20,50${nb}€\nbudget${nb}:${nb}85${nn}%` }
    : { title: "“Lyon trip”: €20.50", body: "Amount: €20.50\nbudget: 85%" }), { path: "/chest", key: "fr-words" });
  assert.equal(n.body, "Amount: €20.50\nbudget: 85%");
  const fr = n.translations?.["fr"];
  assert.equal(fr?.title, title);
  assert.equal(fr?.body, `«${nn}Déplacement Lyon${nn}»\nMontant${nn}: 20,50${nb}€\nbudget${nb}:${nb}85${nn}%`);
  assert.equal(cut(`budget${nb}:${nb}85${nn}%\n  de plus`, 80), `budget${nb}:${nb}85${nn}% de plus`);
  assert.equal(cutLines(`a${nb}b \t c\r\n\r\nd`, 80), `a${nb}b c\nd`);
  assert.equal(cut(`20,50${nb}€ ${"é".repeat(20)}`, 10), `20,50${nb}€ é…`);
});
