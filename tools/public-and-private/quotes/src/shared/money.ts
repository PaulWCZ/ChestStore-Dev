// Safe in the browser: no SDK here.
// Money as integers of the currency's smallest unit (cents for the euro),
// never floating euros: sums and VAT stay exact. Quantities in thousandths
// (1.5 days is 1500), percentages and VAT rates in hundredths of a percent
// (20 % is 2000, 5.5 % is 550). The words come from Intl.
import { intl, numberFormat } from "../i18n/format.ts";

// How many decimals a currency has (2 for the euro, 0 for the yen).
// Known once per currency (a code the runtime does not know: 2).
const digitsOf = new Map<string, number>();
export function minorDigits(currency: string): number {
  let digits = digitsOf.get(currency);
  if (digits === undefined) {
    try {
      digits = numberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
    if (digitsOf.size < 300) digitsOf.set(currency, digits);
  }
  return digits;
}

// parseAmount reads what a person types — "12,50", "12.5", "1 234,56",
// "1,234.56", "1.234,56", "1'234.50", "€ 42", "42 EUR", "-100" (when
// negative amounts are allowed) — as minor units; null when it is not one
// amount, said exactly, never guessed (the same rules as Expenses'
// parseAmount, tools/private/expenses/src/shared/money.ts):
// - only spaces (any: no-break, narrow), apostrophes (groups), a currency
//   sign or ISO code at either end may stand beside the digits; any other
//   letter ("12a50", "1e3", "0x10", "1O0") is refused, and a minus unless
//   negative amounts are allowed;
// - groups are of three digits ("1,2.34", "12 34" refused);
// - a lone "." or "," followed by exactly three digits ("1,234") is a
//   thousand for one reader and one euro twenty-three for another: typed
//   in a form (`reading: "typed"`, the default) it is refused —
//   ambiguousAmount() says so, the forms answer `amount_ambiguous` — except
//   in a currency without decimals (JPY "1,234" is 1234). A file says which
//   mark it uses: an import reads it with the file's dominant decimal mark
//   (`reading: ","` or `"."`, dominantMark()), or as thousands when the
//   file gives no clue (`reading: "thousands"`). Otherwise a lone mark is
//   the decimal separator. The same rule as Expenses, Timesheets and the
//   package's field.money for typed amounts.
const anySpace = /[\s    ]+/gu;
const knownCurrencies = new Set<string>(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["EUR", "USD", "GBP", "CHF", "JPY", "KWD"]);
const grouped = { ",": /^\d{1,3}(?:,\d{3})*$/u, ".": /^\d{1,3}(?:\.\d{3})*$/u } as const;
const groupsOf = (whole: string, mark: "," | ".") => grouped[mark].test(whole);
export type DecimalMark = "," | ".";
export type AmountReading = "typed" | "thousands" | DecimalMark;
export function parseAmount(text: unknown, currency = "EUR", options: { negative?: boolean; reading?: AmountReading } = {}): number | null {
  const reading = options.reading ?? "typed";
  if (typeof text === "number") return Number.isSafeInteger(text) && (options.negative || text >= 0) ? text : null;
  if (typeof text !== "string" || text.length > 64) return null;
  let s = text.replace(anySpace, " ").replace(/[’ʼ]/gu, "'").replace(/[−–]/gu, "-").trim();
  let sign = 1;
  const minus = () => {
    if (!s.startsWith("-")) return true;
    if (!options.negative || sign === -1) return false;
    sign = -1;
    s = s.slice(1).trim();
    return true;
  };
  // A sign before or after the currency's mark ("-€42", "€ -42").
  if (!minus()) return null;
  s = s.replace(/^\p{Sc}\s?|\s?\p{Sc}$/u, "").trim();
  const code = /^([A-Za-z]{3})\s?(?=[\d-])|(?<=\d)\s?([A-Za-z]{3})$/u.exec(s);
  if (code) {
    if (!knownCurrencies.has((code[1] ?? code[2] ?? "").toUpperCase())) return null;
    s = s.replace(code[0], "").trim();
  }
  if (!minus()) return null;
  if (!/^\d(?:[\d .,']*\d)?$/u.test(s)) return null;
  // Spaces and apostrophes only ever group thousands.
  if (/[ ']/u.test(s)) {
    const m = /^(\d{1,3}(?:[ ']\d{3})+)([.,]\d+)?$/u.exec(s);
    if (!m) return null;
    s = m[1]!.replace(/[ ']/gu, "") + (m[2] ?? "");
  }
  const digits = minorDigits(currency);
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let whole = s, fraction = "";
  if (lastComma >= 0 && lastDot >= 0) {
    const mark: "," | "." = lastComma > lastDot ? "," : ".";
    const at = s.lastIndexOf(mark);
    whole = s.slice(0, at);
    fraction = s.slice(at + 1);
    if (!groupsOf(whole, mark === "," ? "." : ",")) return null;
    whole = whole.replace(/[.,]/gu, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const mark: "," | "." = lastComma >= 0 ? "," : ".";
    const parts = s.split(mark);
    const tail = parts.at(-1) ?? "";
    let isDecimal = parts.length === 2 && tail.length !== 3;
    if (parts.length === 2 && tail.length === 3) {
      // "1,234": which reading?
      if (digits === 0) isDecimal = false;
      else if (reading === "typed") return null;
      else isDecimal = reading === mark;
    }
    if (isDecimal) [whole = "", fraction = ""] = parts;
    else {
      if (!groupsOf(s, mark)) return null;
      whole = parts.join("");
    }
  }
  if (!/^\d+$/u.test(whole) || !/^\d*$/u.test(fraction) || whole.length > 13) return null;
  if (fraction.length > digits) return null;
  const value = Number(whole) * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits) || "0");
  return Number.isSafeInteger(value) ? sign * value || 0 : null;
}

// A decimal number with at most `places` decimals, as an integer of
// 10^-places: "1,5" → 1500 (places 3). Either "," or "." is the decimal
// separator (a quantity of "1,500" is one and a half, not fifteen hundred);
// spaces group thousands. Null when it is not such a number.
export function parseDecimal(text: unknown, places: number): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? Math.round(text * 10 ** places) : null;
  if (typeof text !== "string") return null;
  let s = text.replace(/[\s  ']/gu, "").replace(/%$/u, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  const decimal = Math.max(lastComma, lastDot);
  if (decimal >= 0) {
    const whole = s.slice(0, decimal).replace(/[.,]/gu, "");
    s = whole + "." + s.slice(decimal + 1);
  }
  const m = /^(\d*)(?:\.(\d*))?$/u.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  const fraction = m[2] ?? "";
  if (fraction.length > places) return null;
  const value = Number(m[1] || "0") * 10 ** places + Number((fraction + "0".repeat(places)).slice(0, places) || "0");
  return Number.isSafeInteger(value) ? value : null;
}

// A quantity typed ("1,5") in thousandths (1500).
export const parseQuantity = (text: unknown): number | null => parseDecimal(text, 3);
// A percentage typed ("12,5 %") in hundredths of a percent (1250).
export const parsePercent = (text: unknown): number | null => parseDecimal(text, 2);

// formatMoney writes minor units in the reader's language: "1 234,50 €",
// "€1,234.50".
export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  return numberFormat(intl(locale), { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
}

// The amount alone, without the symbol, grouped: "1 234,50" / "1,234.50".
export function formatNumber(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  return numberFormat(intl(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
}

// The amount as a spreadsheet of that language reads it ("1234,50" in
// French, "1234.50" in English): no grouping, no symbol.
export function plainAmount(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  return numberFormat(intl(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(minor / 10 ** digits);
}

// The amount as an input shows it for editing ("1234,50" / "1234.50").
export const inputAmount = plainAmount;

// A quantity in thousandths as people write it: 1500 → "1,5" / "1.5".
export function formatQuantity(milli: number, locale: string, grouping = true): string {
  return numberFormat(intl(locale), { maximumFractionDigits: 3, useGrouping: grouping }).format(milli / 1000);
}

// A rate in hundredths of a percent: 550 → "5,5 %" / "5.5%".
export function formatRate(bp: number, locale: string): string {
  return numberFormat(intl(locale), { style: "percent", maximumFractionDigits: 2 }).format(bp / 10000);
}

// The number alone, for an input: 550 → "5,5" / "5.5".
export function inputPercent(bp: number, locale: string): string {
  return numberFormat(intl(locale), { maximumFractionDigits: 2, useGrouping: false }).format(bp / 100);
}

// The VAT rates of France, in hundredths of a percent: standard 20 %,
// intermediate 10 %, reduced 5.5 %, special 2.1 %, and 0 % (exempt, export,
// reverse charge).
export const vatRates = [2000, 1000, 550, 210, 0] as const;
export type VatRate = (typeof vatRates)[number];
export function isVatRate(value: unknown): value is VatRate {
  return typeof value === "number" && (vatRates as readonly number[]).includes(value);
}

// The VAT of a document in another currency, in euro cents, at its rate
// (units of the currency for one euro, in millionths): rounded once, half
// away from zero, exact (BigInt: no float on the way).
export function inEuros(minor: number, currency: string, eurRate: number): number {
  const digits = minorDigits(currency);
  // minor × 10^(2 − digits) / (rate / 10^6), in cents.
  let num = BigInt(minor) * 1_000_000n * 100n;
  let den = BigInt(eurRate) * 10n ** BigInt(digits);
  if (den < 0n) [num, den] = [-num, -den];
  const negative = num < 0n;
  const abs = negative ? -num : num;
  const q = (abs * 2n + den) / (2n * den);
  return Number(negative ? -q : q);
}

// A rate written for people: "1,0823" (up to six decimals, no trailing zeros).
export function formatEurRate(eurRate: number, locale: string): string {
  return numberFormat(intl(locale), { maximumFractionDigits: 6 }).format(eurRate / 1_000_000);
}

// Whether a currency can travel in a Factur-X: EN 16931 allows at most two
// decimals in amounts (BR-DEC-*); a currency of three (KWD, BHD…) is issued
// as a PDF without the e-invoice data.
export const facturxCurrency = (currency: string): boolean => minorDigits(currency) <= 2;

// Whether a typed amount is refused only for being ambiguous ("1,234",
// "0.500" in a currency with decimals): the form then says "write 1234 or
// 1,23" rather than "not an amount".
export function ambiguousAmount(text: unknown, currency = "EUR", options: { negative?: boolean } = {}): boolean {
  return typeof text === "string" && parseAmount(text, currency, options) === null && parseAmount(text, currency, { ...options, reading: "thousands" }) !== null;
}

// The decimal mark a file's amounts use: the one its amounts show beyond
// doubt (a mark followed by one or two digits at the end, "12,5", "3.40";
// or the last of two marks, "1.234,56"), when most of them agree; null
// when the file gives no clue.
export function dominantMark(values: readonly string[]): DecimalMark | null {
  let comma = 0, point = 0;
  for (const raw of values) {
    const v = raw.replace(/[^\d.,]/gu, "");
    const both = v.includes(",") && v.includes(".");
    const last = both ? (v.lastIndexOf(",") > v.lastIndexOf(".") ? "," : ".") : /,\d{1,2}$/u.test(v) ? "," : /\.\d{1,2}$/u.test(v) ? "." : null;
    if (last === ",") comma++;
    else if (last === ".") point++;
  }
  return comma > point ? "," : point > comma ? "." : null;
}
