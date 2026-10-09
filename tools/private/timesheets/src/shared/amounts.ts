// Safe in the browser: no SDK here.
import { readDuration } from "./duration.ts";

// What a manager types for a rate or a budget, read as the server reads it
// (@argentic/chest-app's field.money, the same grammar, so the form and the
// server never disagree — test/duration.test.ts holds them equal), once a
// currency sign or code is set aside ("€80", "80 €", "80 EUR"): "80",
// "80.50", "80,50", "1 200" (spaces between groups of three), "1,200.50",
// "1.200,50", "1,000,000" (money, as cents). "1,200" or "1.234" alone could
// be read both ways: "ambiguous" (the form says to write 1200 or
// 1,200.00). Null when it cannot be read.
const currency = /[€$£¥]|\b(?:eur|usd|gbp|chf|cad)\b/giu;
export const withoutCurrency = (input: string): string => input.replace(currency, "").trim();

export function readAmount(input: string): number | "ambiguous" | null {
  let s = withoutCurrency(input);
  if (/[\s\u00a0\u202f]/u.test(s)) {
    if (!/^-?\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/u.test(s)) return null;
    s = s.replace(/[\s\u00a0\u202f]/gu, "");
  }
  const plain = /^(\d{1,13})(?:[.,](\d{1,2}))?$/u.exec(s);
  const grouped = /^(\d{1,3}([.,])\d{3}(?:\2\d{3})*)([.,])(\d{1,2})$/u.exec(s);
  const whole3 = /^(\d{1,3}([.,])\d{3}(?:\2\d{3})+)$/u.exec(s);
  let whole: string, decimals: string;
  if (plain) [, whole = "", decimals = ""] = plain;
  else if (grouped && grouped[2] !== grouped[3] && !/^0[.,]/u.test(s)) {
    whole = (grouped[1] ?? "").replace(/[.,]/gu, "");
    decimals = grouped[4] ?? "";
  } else if (whole3 && !/^0[.,]/u.test(s)) {
    whole = (whole3[1] ?? "").replace(/[.,]/gu, "");
    decimals = "";
  } else if (/^[1-9]\d{0,2}[.,]\d{3}$/u.test(s)) return "ambiguous";
  else return null;
  if (whole.length > 13) return null;
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

// parseAmount: the cents, or null (unreadable or ambiguous).
export function parseAmount(input: string): number | null {
  const read = readAmount(input);
  return typeof read === "number" ? read : null;
}

// amountProblem: the refusal of what was typed, as the server would say it
// (errors.amount_ambiguous or errors.invalid), or null when it reads.
export function amountProblem(input: string): "amount_ambiguous" | "invalid" | null {
  const read = readAmount(input);
  return read === "ambiguous" ? "amount_ambiguous" : read === null ? "invalid" : null;
}

// Hours as typed for a usual week or a budget: the grid's own grammar
// (src/shared/duration.ts) — "35", "35.5", "35,5", "35:30", "7h30",
// "120h" —, without its limit of a day. Null for nothing or unreadable.
export function parseHours(input: string): number | null {
  if (input.trim() === "") return null;
  return readDuration(input, 10_000_000);
}

// The value a field shows back: 8050 → "80.50" (or "80,50"), 8000 → "80".
export function amountText(cents: number, comma: boolean): string {
  const text = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return comma ? text.replace(".", ",") : text;
}

export function hoursText(minutes: number, comma: boolean): string {
  const text = minutes % 60 === 0 ? String(minutes / 60) : String(Math.round((minutes / 60) * 100) / 100);
  return comma ? text.replace(".", ",") : text;
}
