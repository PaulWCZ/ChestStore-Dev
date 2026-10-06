// Safe in the browser: no SDK here.
// Money as integers of the currency's smallest unit (cents for the euro),
// never floating euros: sums and VAT stay exact. The words come from Intl.
import { numberFormat } from "../i18n/format.ts";

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
    return numberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

// parseAmount reads what a person types — "12,50", "12.5", "1 234,56",
// "1,234.56", "1.234,56", "1'234.50", "€ 42", "42 EUR" — as minor units of
// the currency; null when it is not one amount, said exactly, never
// guessed:
// - only spaces (any: no-break, narrow), apostrophes (groups), a currency
//   sign or the ISO code at either end may stand beside the digits; any
//   other letter ("1O,50", "12x5", "1e3") or sign, a minus of any kind
//   ("-5", "−12,50": an expense is never negative), is refused;
// - groups are of three digits ("1,2.34" refused);
// - a "." or "," followed by exactly three digits and nothing else
//   ("1,234", "0,500", "12.345") is a thousand for one reader and a decimal
//   for another: refused — also for a currency of three decimals (KWD
//   "1,000"); only a currency without decimals (JPY) reads it as thousands;
//   several groups ("1,234,567", "1.000.000") are thousands.
// The same rules as the package's field.money for a currency of two
// decimals (test/money.test.ts holds them equal), plus the currency's own
// number of decimals.
const anySpace = /[\s\u00a0\u202f\u2009\u2007]+/gu;
export function parseAmount(text: unknown, currency = defaultCurrency): number | null {
  if (typeof text !== "string" || text.length > 64) return null;
  let s = text.replace(anySpace, " ").replace(/[’ʼ]/gu, "'").trim();
  // A currency's sign or code, at the start or the end only.
  s = s.replace(/^\p{Sc}\s?|\s?\p{Sc}$/u, "").trim();
  const code = /^([A-Za-z]{3})\s?(?=\d)|(?<=\d)\s?([A-Za-z]{3})$/u.exec(s);
  if (code) {
    if (!isCurrency((code[1] ?? code[2] ?? "").toUpperCase())) return null;
    s = s.replace(code[0], "").trim();
  }
  const digits = minorDigits(currency);
  const decimals = digits > 0 ? `(?:([.,])(\\d{1,${digits}}))?` : "";
  let whole: string, fraction = "";
  // Grouped by spaces or apostrophes: never ambiguous.
  let m = new RegExp(`^(\\d{1,3}(?:[ ']\\d{3})+)${decimals}$`, "u").exec(s);
  if (m) {
    whole = m[1]!.replace(/[ ']/gu, "");
    fraction = m[3] ?? "";
  } else if ((m = new RegExp(`^(\\d+)${decimals}$`, "u").exec(s))) {
    whole = m[1]!;
    fraction = m[3] ?? "";
    // "1,234", "0,500": a thousand, or a decimal? (three decimals' currencies too)
    if (fraction.length === 3) return null;
  } else if ((m = /^(\d{1,3}(?:([.,])\d{3})+)(?:([.,])(\d+))?$/u.exec(s))) {
    // Grouped by "." or ",": with a decimal part of the other mark
    // ("1.234,56", "1,234.56"); without one, two groups at least
    // ("1,234,567": a decimal mark is never repeated), or one for a
    // currency without decimals ("1,234" yen).
    const [, grouped = "", group = "", mark, part = ""] = m;
    if (mark !== undefined ? mark === group || part.length > digits || /^0[.,]/u.test(s) : digits > 0 && grouped.split(group).length < 3) return null;
    whole = grouped.replace(/[.,]/gu, "");
    fraction = part;
  } else return null;
  if (whole.length > 13) return null;
  const value = Number(whole) * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits) || "0");
  return Number.isSafeInteger(value) ? value : null;
}

// ambiguousAmount says why parseAmount refused a text when it is the one
// refusal that needs explaining: a lone "." or "," before three digits
// ("1,234", "0,500"), a thousand for one reader and a decimal for another.
export function ambiguousAmount(text: unknown, currency = defaultCurrency): boolean {
  if (typeof text !== "string" || minorDigits(currency) === 0) return false;
  const s = text.replace(anySpace, "").replace(/^\p{Sc}|\p{Sc}$/u, "").replace(/^[A-Za-z]{3}|[A-Za-z]{3}$/u, "");
  return /^\d+[.,]\d{3}$/u.test(s);
}

// The code an amount that is no amount is refused with.
export const amountRefusal = (text: unknown, currency = defaultCurrency): "amount_ambiguous" | "amount_invalid" => (ambiguousAmount(text, currency) ? "amount_ambiguous" : "amount_invalid");

// formatMoney writes minor units in the reader's language: "42,50 €",
// "€42.50".
// The short sign ("£", not French's "£GB") unless it is shared by several
// currencies ("$", "kr", "¥"): then the language's own ("$US", "$CA").
export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  const options = { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits } as const;
  const narrow = numberFormat(locale, { ...options, currencyDisplay: "narrowSymbol" });
  const sign = narrow.formatToParts(0).find(p => p.type === "currency")?.value ?? "";
  const formatter = sharedSigns.has(sign) ? numberFormat(locale, options) : narrow;
  return formatter.format(minor / 10 ** digits);
}
const sharedSigns = new Set(["$", "kr", "¥", "₩", "Rs"]);

// The amount alone, without the symbol, as a spreadsheet of that language
// reads it ("42,50" in French, "42.50" in English), no grouping.
export function plainAmount(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  return numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(minor / 10 ** digits);
}

// The currency's sign in a language ("€", "£", "$US"), for an amount field.
export function currencySign(currency: string, locale: string): string {
  try {
    return numberFormat(locale, { style: "currency", currency }).formatToParts(0).find(p => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
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
  return numberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6, useGrouping: false }).format(micro / 1_000_000);
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
