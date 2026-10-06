import assert from "node:assert/strict";
import { test } from "node:test";
import { formatEurRate, formatMoney, formatQuantity, formatRate, inEuros, parseAmount, parsePercent, parseQuantity, plainAmount } from "../src/shared/money.ts";
import { depositBases, lineNet, roundDiv, share, totals, vatOf, type LineAmounts } from "../src/shared/totals.ts";

const l = (quantity: number, unitPrice: number, vatRate = 2000, discount = 0): LineAmounts => ({ kind: "line", quantity, unitPrice, vatRate, discount });

test("rounding is half away from zero, on exact integers", () => {
  assert.equal(roundDiv(5n, 2n), 3n);
  assert.equal(roundDiv(-5n, 2n), -3n);
  assert.equal(roundDiv(4n, 3n), 1n);
  assert.equal(roundDiv(-4n, 3n), -1n);
  assert.equal(roundDiv(0n, 7n), 0n);
});

test("a line: quantity × unit price × (1 − discount), rounded once to the cent", () => {
  assert.equal(lineNet(l(1000, 12345)), 12345);
  assert.equal(lineNet(l(1500, 45000)), 67500); // 1.5 days at 450.00
  assert.equal(lineNet(l(3000, 333)), 999);
  assert.equal(lineNet(l(333, 100)), 33); // 0.333 × 1.00 = 0.333 → 0.33
  assert.equal(lineNet(l(335, 100)), 34); // 0.335 → 0.34 (half up)
  assert.equal(lineNet(l(1000, 1999, 2000, 1250)), 1749); // 19.99 − 12.5 % = 17.49125 → 17.49
  assert.equal(lineNet(l(1000, 1990, 2000, 2500)), 1493); // 14.925 → 14.93? no: 19.90 × 0.75 = 14.925 → 14.93
  assert.equal(lineNet(l(1000, -10000)), -10000);
  assert.equal(lineNet(l(1000, -1005, 2000, 5000)), -503); // −5.025 → −5.03
  // Large figures stay exact (BigInt): 1,000,000 units at 99,999,999.99.
  assert.equal(lineNet(l(1_000_000_000, 9_999_999_999)), 9_999_999_999_000_000);
});

test("VAT per rate on the sum of the rounded lines, never line by line", () => {
  // Three lines of 0.33 at 20 %: VAT on 0.99 is 0.198 → 0.20 (line by line
  // it would be 3 × 0.066 → 3 × 0.07 = 0.21).
  const t = totals([l(1000, 33), l(1000, 33), l(1000, 33)]);
  assert.deepEqual(t, { net: 99, vat: 20, gross: 119, rates: [{ rate: 2000, base: 99, vat: 20 }] });
  const mixed = totals([l(2000, 12050, 2000), { kind: "section", quantity: 0, unitPrice: 0, vatRate: 0, discount: 0 }, l(1000, 999, 550), l(4000, 250, 1000), l(1000, 5000, 0)]);
  assert.deepEqual(mixed.rates, [
    { rate: 2000, base: 24100, vat: 4820 },
    { rate: 1000, base: 1000, vat: 100 },
    { rate: 550, base: 999, vat: 55 }, // 54.945 → 55
    { rate: 0, base: 5000, vat: 0 },
  ]);
  assert.equal(mixed.net, 31099);
  assert.equal(mixed.vat, 4975);
  assert.equal(mixed.gross, 36074);
  assert.equal(vatOf(1, 2100), 0);
  assert.equal(vatOf(24, 210), 1); // 0.504 → 0.01
});

test("without VAT (exemption or reverse charge), every line goes to one base at 0 %", () => {
  const t = totals([l(1000, 10000, 2000), l(1000, 5000, 550)], { noVat: true });
  assert.deepEqual(t, { net: 15000, vat: 0, gross: 15000, rates: [{ rate: 0, base: 15000, vat: 0 }] });
});

test("a deposit takes its share of each rate's base", () => {
  const quote = totals([l(1000, 100000, 2000), l(1000, 33333, 1000)]);
  assert.deepEqual(depositBases(quote, 3000), [{ rate: 2000, base: 30000 }, { rate: 1000, base: 10000 }]); // 3,333.33 × 30 % = 99.9999 → 100.00
  assert.equal(share(1, 5000), 1);
  assert.equal(share(-3, 5000), -2);
});

test("amounts, quantities and percentages as people type them", () => {
  assert.equal(parseAmount("1 234,56"), 123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount("12,5"), 1250);
  assert.equal(parseAmount("€ 42"), 4200);
  assert.equal(parseAmount("1.234"), 123400);
  assert.equal(parseAmount("-100"), null);
  assert.equal(parseAmount("-100", "EUR", { negative: true }), -10000);
  assert.equal(parseAmount("−12,50", "EUR", { negative: true }), -1250);
  assert.equal(parseAmount("12,345"), 1234500);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("1,2,3"), null);
  // Letters are refused, never dropped (review S5).
  for (const typed of ["12a50", "1e3", "0x10", "1O0", "12x5", "1O,50", "12,5O", "EUR", "€", "12 €€", "12 XYZ", "1-2", "--5", "+5", "1,2.34", "12 34", "1 2345", "1,23,456", "1.234.56", ".5", "5.", "1 234 ,50"]) {
    assert.equal(parseAmount(typed), null, typed);
  }
  // Spaces of every kind, apostrophes, a sign or a code at either end.
  assert.equal(parseAmount("1\u202f234,56"), 123456);
  assert.equal(parseAmount("1\u00a0234,56 €"), 123456);
  assert.equal(parseAmount("1'234.50"), 123450);
  assert.equal(parseAmount("42 EUR"), 4200);
  assert.equal(parseAmount("CHF 42"), 4200);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("1,234,567"), 123456700);
  assert.equal(parseAmount("-€42", "EUR", { negative: true }), -4200);
  assert.equal(parseAmount("€ -42", "EUR", { negative: true }), -4200);
  assert.equal(parseAmount("-€42"), null);
  assert.equal(parseAmount(-500), null, "a negative number too, unless allowed");
  assert.equal(parseAmount(-500, "EUR", { negative: true }), -500);
  // 0, 2 and 3 decimals.
  assert.equal(parseAmount("1 234", "JPY"), 1234);
  assert.equal(parseAmount("1,5", "JPY"), null);
  assert.equal(parseAmount("1,234", "KWD"), 1234);
  assert.equal(parseAmount("12,5", "KWD"), 12500);
  assert.equal(parseAmount("1.234,567", "KWD"), 1234567);
  assert.equal(parseAmount("1,2345", "KWD"), null);
  assert.equal(parseQuantity("1,5"), 1500);
  assert.equal(parseQuantity("1.500"), 1500);
  assert.equal(parseQuantity("0,125"), 125);
  assert.equal(parseQuantity("1 000"), 1_000_000);
  assert.equal(parseQuantity("0,1234"), null);
  assert.equal(parseQuantity("-1"), null);
  assert.equal(parsePercent("5,5"), 550);
  assert.equal(parsePercent("12.5 %"), 1250);
  assert.equal(parsePercent("20"), 2000);
});

test("money, quantities and rates written in each language", () => {
  assert.equal(formatMoney(123456, "EUR", "fr").replace(/\s/gu, " "), "1 234,56 €");
  assert.equal(formatMoney(123456, "EUR", "en"), "€1,234.56");
  assert.equal(plainAmount(-123456, "EUR", "fr"), "-1234,56");
  assert.equal(formatQuantity(1500, "fr"), "1,5");
  assert.equal(formatQuantity(1500, "en"), "1.5");
  assert.equal(formatRate(550, "fr").replace(/\s/gu, " "), "5,5 %");
  assert.equal(formatRate(2000, "en"), "20%");
});

test("an amount in another currency, in euro cents at the ECB's rate: rounded once, half away from zero", () => {
  assert.equal(inEuros(20000, "USD", 1_082_300), 18479); // 200.00 / 1.0823 = 184.7916…
  assert.equal(inEuros(-20000, "USD", 1_082_300), -18479);
  assert.equal(inEuros(16243, "JPY", 162_430_000), 10000); // 16,243 yen at 162.43: 100.00 €
  assert.equal(inEuros(100, "USD", 2_000_000), 50);
  assert.equal(inEuros(1, "USD", 2_000_000), 1, "0.5 cent: away from zero");
  assert.equal(formatEurRate(1_082_300, "fr"), "1,0823");
  assert.equal(formatEurRate(162_430_000, "en"), "162.43");
});
