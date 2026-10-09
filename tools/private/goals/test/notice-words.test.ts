import assert from "node:assert/strict";
import { test } from "node:test";
import { cut, cutLines, notice } from "../src/lib/notify.ts";

// The French notice of the sweep of 6 October 2026: guillemets, an amount
// and a percentage carry no-break spaces (U+202F, U+00A0) on purpose; the
// title folds to one line, the body keeps its line breaks.
test("a French notice keeps « … », \"20,50 €\" and \"budget : 85 %\" whole, and the body its lines", () => {
  const nn = "\u202f", nb = "\u00a0";
  const title = `«${nn}Déplacement Lyon${nn}»${nn}: 20,50${nb}€`;
  const n = notice((_t, locale) => (locale === "fr"
    ? { title: ` ${title}\n`, body: `«${nn}Déplacement Lyon${nn}»  \n\nMontant${nn}: 20,50${nb}€\nbudget${nb}:${nb}85${nn}%` }
    : { title: "“Lyon trip”: €20.50", body: "Amount: €20.50\nbudget: 85%" }));
  assert.equal(n.body, "Amount: €20.50\nbudget: 85%");
  const fr = n.translations?.["fr"];
  assert.equal(fr?.title, title);
  assert.equal(fr?.body, `«${nn}Déplacement Lyon${nn}»\nMontant${nn}: 20,50${nb}€\nbudget${nb}:${nb}85${nn}%`);
  assert.equal(cut(`budget${nb}:${nb}85${nn}%\n  de plus`, 80), `budget${nb}:${nb}85${nn}% de plus`);
  assert.equal(cutLines(`a${nb}b \t c\r\n\r\nd`, 80), `a${nb}b c\nd`);
  assert.equal(cut(`20,50${nb}€ ${"é".repeat(20)}`, 10), `20,50${nb}€ é…`);
});
