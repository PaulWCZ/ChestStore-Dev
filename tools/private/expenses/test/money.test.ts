import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, isCurrency, minorDigits, parseAmount, plainAmount, recoverable, vatInside } from "../src/shared/money.ts";

test("amounts are read as people type them, in cents", () => {
  const cases: [string, number | null][] = [
    ["12", 1200], ["12,5", 1250], ["12.50", 1250], ["0,99", 99], [",5", 50], ["1 234,56", 123456], ["1 234,56", 123456],
    ["1.234,56", 123456], ["1,234.56", 123456], ["€ 42", 4200], ["42 €", 4200], ["1,234,567", 123456700], ["1.234.567", 123456700],
    ["", null], ["abc", null], ["-5", null], ["12.345.67", null], ["1,2,3", null], ["12,505,1", null],
    // A lone separator followed by three digits: thousands for an English
    // reader, decimals for a French one — refused, never guessed.
    ["1,234", null], ["12,555", null], ["0,500", null], ["12.345", null], ["1.234", null],
  ];
  for (const [text, cents] of cases) assert.equal(parseAmount(text), cents, text);
  assert.equal(parseAmount(12 as unknown), null);
  assert.equal(parseAmount("1200", "JPY"), 1200);
  assert.equal(parseAmount("1,234", "JPY"), 1234, "no decimals: thousands");
  assert.equal(parseAmount("12,5", "JPY"), null);
  assert.equal(parseAmount("1,234", "TND"), 1234, "three decimals: 1.234 dinars");
});

test("currencies: known codes only, their decimals, written in the reader's language", () => {
  assert.ok(isCurrency("EUR") && isCurrency("JPY"));
  assert.ok(!isCurrency("eur") && !isCurrency("XYZ1") && !isCurrency(null));
  assert.equal(minorDigits("EUR"), 2);
  assert.equal(minorDigits("JPY"), 0);
  assert.equal(formatMoney(4250, "EUR", "fr").replace(/\s/gu, " "), "42,50 €");
  assert.equal(formatMoney(4250, "EUR", "en"), "€42.50");
  assert.equal(plainAmount(123456, "EUR", "fr"), "1234,56");
  assert.equal(plainAmount(123456, "EUR", "en"), "1234.56");
});

test("VAT inside an amount, and the part the company recovers", () => {
  assert.equal(vatInside(12000, 200), 2000);
  assert.equal(vatInside(1100, 100), 100);
  assert.equal(vatInside(1055, 55), 55);
  assert.equal(vatInside(999, 200), 167);
  assert.equal(recoverable(1000, 80), 800);
  assert.equal(recoverable(333, 80), 266);
  assert.equal(recoverable(1000, 0), 0);
});

test("rates are read as people type them and convert exactly, half up", async () => {
  const { convert, parseRate, rateText } = await import("../src/shared/money.ts");
  assert.equal(parseRate("1,1653"), 1_165_300);
  assert.equal(parseRate(" 0.006123 "), 6_123);
  assert.equal(parseRate("162"), 162_000_000);
  for (const bad of ["", "0", "0,000000", "1,1234567", "-1", "abc", "1.2.3"]) assert.equal(parseRate(bad), null, bad);
  assert.equal(convert(1250, "GBP", 1_165_300, "EUR"), 1457); // £12.50 → €14.566… → €14.57
  assert.equal(convert(4000, "JPY", 6_123, "EUR"), 2449); // ¥4,000 (no decimals) → €24.49
  assert.equal(convert(100, "EUR", 162_000_000, "JPY"), 162); // €1.00 → ¥162
  assert.equal(rateText(1_165_300, "fr"), "1,1653");
  assert.equal(rateText(1_000_000, "en"), "1.00");
});
