import { AppError } from "./app-error.ts";
import { limits } from "./model.ts";

// Safe in the browser: no SDK here.
// parseAmount reads money as people and spreadsheets write it — "12500",
// "12 500,50 €", "€12,500.50", "12.500,50", "12k" — into whole cents.
// Nothing is a float on the way: the digits are read as text. Empty is 0.
export function parseAmount(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new AppError("bad_amount");
    return bounded(Math.round(value * 100));
  }
  if (value === null || value === undefined) return 0;
  if (typeof value !== "string") throw new AppError("bad_amount");
  let text = value.normalize("NFKC").toLowerCase().replace(/eur(os?)?|€|\s| |'/gu, "");
  if (text === "") return 0;
  let factor = 1n;
  if (/k$/u.test(text)) {
    factor = 1000n;
    text = text.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/u.test(text)) throw new AppError("bad_amount");
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let whole = text;
  let fraction = "";
  const decimalAt = (() => {
    if (lastDot >= 0 && lastComma >= 0) return Math.max(lastDot, lastComma);
    const at = Math.max(lastDot, lastComma);
    if (at < 0) return -1;
    const sep = text[at]!;
    const after = text.length - at - 1;
    // One separator seen once with 1, 2 digits after it is a decimal point
    // ("12,5", "12.50"); three digits after it, or seen twice, groups
    // thousands ("12,500", "1.250.000").
    if (text.split(sep).length > 2) return -1;
    return after === 3 ? -1 : at;
  })();
  if (decimalAt >= 0) {
    whole = text.slice(0, decimalAt);
    fraction = text.slice(decimalAt + 1);
    if (!/^\d{1,2}$/u.test(fraction)) throw new AppError("bad_amount");
  }
  // Grouped thousands: one kind of separator, groups of three.
  if (/[.,]/u.test(whole) && !/^\d{1,3}(\.\d{3})+$|^\d{1,3}(,\d{3})+$/u.test(whole)) throw new AppError("bad_amount");
  whole = whole.replace(/[.,]/gu, "");
  if (!/^\d+$/u.test(whole) || whole.length > 15) throw new AppError("bad_amount");
  const cents = (BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2))) * factor;
  if (cents > BigInt(limits.maxCents)) throw new AppError("bad_amount");
  return Number(cents);
}

function bounded(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > limits.maxCents) throw new AppError("bad_amount");
  return cents;
}

// The amount as a form shows it back: "12500" or "12500.5" — no grouping,
// a dot, so that parseAmount reads it again unchanged.
export function amountInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
}
