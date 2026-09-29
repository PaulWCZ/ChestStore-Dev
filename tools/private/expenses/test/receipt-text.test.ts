import assert from "node:assert/strict";
import { test } from "node:test";
import { readReceiptText } from "../lib/receipt-text.ts";

// What the OCR gave for two photos of the same till receipt (tesseract.js
// 7.0.0, French model best_int, 2026-09-29): a clean one, and a blurred,
// skewed, badly lit one. The suggestion takes what is sure and leaves the
// rest empty.
const clean = `CAFÉ KITSUNÉ
51 Galerie de Montpensier
75001 Paris
28/09/2026 13:42 - Table 4
2 x Plat du jour ... 36,00
2 x Café ..…......... 5,00
TOTAL TTC ....... 41,00 €
dont TVA 10% .....- 3,73
MERCI !`;

const blurred = `caré KITSUNÉ
51 Galerie de Montpensier
75001 Paris
28/09/2026 13:42 - Table 4
2 x Plat du Jour «+. 36,00
2 x Coté ..oncone0tt BU ÿ
20 ne BE
OTAL TTC + 000005 SUIS
dont TVA 10% <0000<5 3,3
MERCI *`;

test("a clean receipt: total, day, VAT and shop", () => {
  assert.deepEqual(readReceiptText(clean, "2026-09-29"), { amount: "41,00", date: "2026-09-28", vat: "3,73", merchant: "CAFÉ KITSUNÉ" });
});

test("a blurred receipt: only what was read for sure (the day)", () => {
  const guess = readReceiptText(blurred, "2026-09-29");
  assert.equal(guess.amount, null);
  assert.equal(guess.vat, null);
  assert.equal(guess.date, "2026-09-28");
});

test("totals as receipts write them: TTC over HT, the card line, thousands, English", () => {
  assert.equal(readReceiptText("RESTAURANT\nTOTAL HT 35,00\nTVA 20% 7,00\nTOTAL TTC 42,00\nCB 42,00", "2026-09-29").amount, "42,00");
  assert.equal(readReceiptText("RESTAURANT\nTOTAL HT 35,00\nTVA 20% 7,00\nTOTAL TTC 42,00", "2026-09-29").vat, "7,00");
  assert.equal(readReceiptText("HOTEL DU PARC\nNET A PAYER 1 234,56 EUR", "2026-09-29").amount, "1234,56");
  const tesco = readReceiptText("TESCO EXPRESS\n12 High Street\nSUBTOTAL 21.50\nVAT 20% 3.58\nTOTAL DUE 21.50\nVISA 21.50\n14/03/2026 18:02", "2026-09-29");
  assert.deepEqual(tesco, { amount: "21,50", date: "2026-03-14", vat: "3,58", merchant: "TESCO EXPRESS" });
  assert.equal(readReceiptText("MERCI\n2 x Cafe 5,00", "2026-09-29").amount, null); // no line says "total"
});

test("dates: day first, year first, two-digit years; never in the future nor years back", () => {
  assert.equal(readReceiptText("Le 03.09.26 à 12h", "2026-09-29").date, "2026-09-03");
  assert.equal(readReceiptText("2026-09-01T10:00", "2026-09-29").date, "2026-09-01");
  assert.equal(readReceiptText("Valable jusqu'au 31/12/2026\nle 02/09/2026", "2026-09-29").date, "2026-09-02");
  assert.equal(readReceiptText("01/01/2020", "2026-09-29").date, null);
  assert.equal(readReceiptText("31/02/2026", "2026-09-29").date, null);
});
