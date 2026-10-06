// Safe in the browser: no SDK here.
// What a manager types for a rate or a budget, read as the server reads it
// (@argentic/chest-app's field.money, the same grammar, so the form and the
// server never disagree — test/duration.test.ts holds them equal): "80",
// "80.50", "80,50", "1 200" (any space), "1,200.50", "1.200,50" (money, as
// cents); a group separator only with decimals after it: "1,200" or
// "12.345" alone (which one was meant?) are refused. "120", "120.5",
// "120,5", "120:30" (hours, as minutes). Null when it cannot be read.

export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s\u00a0\u202f]/gu, "");
  const plain = /^(\d{1,13})(?:[.,](\d{1,2}))?$/u.exec(s);
  const grouped = /^(\d{1,3}(?:([.,])\d{3})+)([.,])(\d{1,2})$/u.exec(s);
  let whole: string, decimals: string;
  if (plain) [, whole = "", decimals = ""] = plain;
  else if (grouped && grouped[2] !== grouped[3] && !/^0[.,]/u.test(s)) {
    whole = (grouped[1] ?? "").replace(/[.,]/gu, "");
    decimals = grouped[4] ?? "";
  } else return null;
  if (whole.length > 13) return null;
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
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
