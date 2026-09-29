// Safe in the browser: no SDK here.
// Money as integers of the currency's smallest unit (cents for the euro),
// never floating euros: sums and VAT stay exact. The words come from Intl.
import { intl } from "./i18n/format.ts";

export const defaultCurrency = "EUR";
// The currencies offered first in the picker; any ISO 4217 code Intl knows
// is accepted.
export const commonCurrencies = ["EUR", "USD", "GBP", "CHF", "CAD", "JPY", "SEK", "DKK", "PLN", "MAD"] as const;

const knownCurrencies = new Set<string>(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : commonCurrencies);

export function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/u.test(value) && knownCurrencies.has(value);
}

// How many decimals a currency has (2 for the euro, 0 for the yen).
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

// parseAmount reads what a person types — "12,50", "12.5", "1 234,56",
// "1,234.56", "€ 42" — as minor units; null when it is not an amount.
// A lone separator followed by exactly three digits groups thousands
// ("1,234" is 1234), otherwise it is the decimal separator.
export function parseAmount(text: unknown, currency = defaultCurrency): number | null {
  if (typeof text !== "string") return null;
  let s = text.replace(/[\s  ']/gu, "").replace(/[^\d.,-]/gu, "");
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
  return Number.isSafeInteger(value) ? value : null;
}

// formatMoney writes minor units in the reader's language: "42,50 €",
// "€42.50".
export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(intl(locale), { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
}

// The amount alone, without the symbol, as a spreadsheet of that language
// reads it ("42,50" in French, "42.50" in English), no grouping.
export function plainAmount(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(intl(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(minor / 10 ** digits);
}

// The amount as the input shows it for editing ("42,50" / "42.50").
export function inputAmount(minor: number, currency: string, locale: string): string {
  return plainAmount(minor, currency, locale);
}

// The VAT inside an amount that includes it, at a rate in tenths of a
// percent (200 = 20 %, 55 = 5.5 %): total × r / (1000 + r), rounded half up.
export function vatInside(total: number, rateTenths: number): number {
  return Math.round((total * rateTenths) / (1000 + rateTenths));
}

// The French VAT rates offered as one-tap choices, in tenths of a percent.
export const vatRates = [200, 100, 55, 21] as const;

// The recoverable part of a VAT amount, at a percentage (0 to 100).
export function recoverable(vat: number, percent: number): number {
  return Math.round((vat * percent) / 100);
}

// Exchange rates: how many units of the company's currency one unit of
// another is worth, kept in millionths ("1,1653" → 1165300), as people read
// them on a card statement or the ECB's page. Six decimals at most.
export function parseRate(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const s = text.trim().replace(/\s/gu, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,6})?$/u.test(s)) return null;
  const [whole = "0", fraction = ""] = s.split(".");
  const micro = Number(whole) * 1_000_000 + Number((fraction + "000000").slice(0, 6));
  return micro > 0 ? micro : null;
}

export function rateText(micro: number, locale: string): string {
  return new Intl.NumberFormat(intl(locale), { minimumFractionDigits: 2, maximumFractionDigits: 6, useGrouping: false }).format(micro / 1_000_000);
}

// convert gives an amount (minor units of `from`) in minor units of `to` at
// a rate in millionths, rounded half up, exact (BigInt: no float drift).
export function convert(amount: number, from: string, rateMicro: number, to: string): number {
  const shift = minorDigits(to) - minorDigits(from);
  let numerator = BigInt(amount) * BigInt(rateMicro);
  let denominator = 1_000_000n;
  if (shift > 0) numerator *= 10n ** BigInt(shift);
  else if (shift < 0) denominator *= 10n ** BigInt(-shift);
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}
