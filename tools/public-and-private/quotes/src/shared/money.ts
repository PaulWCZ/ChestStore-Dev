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
// "1,234.56", "€ 42", "-100" (when negative amounts are allowed) — as minor
// units; null when it is not an amount. A lone separator followed by
// exactly three digits groups thousands ("1,234" is 1234), otherwise it is
// the decimal separator.
export function parseAmount(text: unknown, currency = "EUR", options: { negative?: boolean } = {}): number | null {
  if (typeof text === "number") return Number.isSafeInteger(text) ? text : null;
  if (typeof text !== "string") return null;
  let s = text.replace(/[\s  ']/gu, "").replace(/[−–]/gu, "-").replace(/[^\d.,-]/gu, "");
  let sign = 1;
  if (s.startsWith("-")) {
    if (!options.negative) return null;
    sign = -1;
    s = s.slice(1);
  }
  if (s === "" || s.includes("-")) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let decimal: string | null = null;
  if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? "," : ".";
  else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts.at(-1) ?? "";
    decimal = parts.length === 2 && tail.length !== 3 ? sep : parts.length === 2 && tail.length === 3 && minorDigits(currency) === 3 ? sep : null;
    if (parts.length > 2 && tail.length !== 3) return null;
  }
  const group = decimal === "," ? "." : decimal === "." ? "," : null;
  if (group) s = s.split(group).join("");
  else s = s.replace(/[.,]/gu, "");
  const [whole = "", fraction = ""] = decimal ? s.split(decimal) : [s, ""];
  if (!/^\d*$/u.test(whole) || !/^\d*$/u.test(fraction) || (whole === "" && fraction === "")) return null;
  const digits = minorDigits(currency);
  if (fraction.length > digits) return null;
  const value = Number(whole || "0") * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits) || "0");
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
