import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, isCurrency, minorDigits, parseAmount, plainAmount, recoverable, vatInside } from "../lib/money.ts";

test("amounts are read as people type them, in cents", () => {
  const cases: [string, number | null][] = [
    ["12", 1200], ["12,5", 1250], ["12.50", 1250], ["0,99", 99], [",5", 50], ["1 234,56", 123456], ["1 234,56", 123456],
    ["1.234,56", 123456], ["1,234.56", 123456], ["1,234", 123400], ["€ 42", 4200], ["42 €", 4200], ["1,234,567", 123456700],
    ["", null], ["abc", null], ["-5", null], ["12,555", 1255500], ["12.345.67", null], ["1,2,3", null], ["12,505,1", null],
  ];
  for (const [text, cents] of cases) assert.equal(parseAmount(text), cents, text);
  assert.equal(parseAmount(12 as unknown), null);
  assert.equal(parseAmount("1200", "JPY"), 1200);
  assert.equal(parseAmount("12,5", "JPY"), null);
  assert.equal(parseAmount("1,234", "TND"), 1234);
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
