// Safe in the browser: no SDK here.
// What a manager types for a rate or a budget: "80", "80.50", "80,50",
// "1 200", "1,200.50" (money, as cents); "120", "120.5", "120:30" (hours,
// as minutes). Null when it cannot be read.

export function parseAmount(input: string): number | null {
  let text = input.trim().replace(/[\s  ]/gu, "").replace(/[€$£]|chf|eur|usd|gbp|cad/giu, "");
  if (text === "") return null;
  // "1,200.50" / "1.200,50": the last separator is the decimal one when
  // two decimals or fewer follow it.
  const last = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
  if (last >= 0) {
    const decimals = text.slice(last + 1);
    const whole = text.slice(0, last).replace(/[.,]/gu, "");
    text = decimals.length <= 2 ? `${whole}.${decimals}` : whole + decimals;
  }
  if (!/^\d+(\.\d{0,2})?$/u.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function parseHours(input: string): number | null {
  const text = input.trim().replace(/\s+/gu, "").replace(/h$/iu, "");
  if (text === "") return null;
  let m = /^(\d{1,6}):([0-5]\d)$/u.exec(text);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,6})(?:[.,](\d{1,2}))?$/u.exec(text);
  if (m) return Math.round(Number(`${m[1]}.${m[2] ?? "0"}`) * 60);
  return null;
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
