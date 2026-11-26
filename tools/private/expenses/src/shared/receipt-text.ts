// Safe in the browser: no SDK here.
// What a receipt's text says, as a suggestion: the total, the day, the VAT
// and the shop, read from the text the phone's OCR gave (components/ocr.ts).
// Nothing here is trusted: every value fills an empty field only, and the
// person sees it before saving. When the text is unclear, nothing is
// suggested rather than a guess.

export type ReceiptGuess = { amount: string | null; date: string | null; vat: string | null; merchant: string | null };

// An amount as receipts print it: 41,00 / 41.00 / 1 234,56 / 1,234.56.
const amountPattern = /(\d{1,3}(?:[ .,  ]\d{3})*|\d+)[.,](\d{2})(?!\d)/gu;

function amounts(line: string): string[] {
  return [...line.matchAll(amountPattern)].map(m => `${m[1]!.replace(/[ .,  ]/gu, "")},${m[2]}`);
}

const plain = (line: string) => line.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toUpperCase();

// The total: the amount of a line that says so (TOTAL TTC, NET A PAYER,
// TOTAL DUE…), never a subtotal, a line without VAT (HT) or the VAT itself.
// When several say so, the largest (a TOTAL before a tip, or a CB line).
function total(lines: string[]): string | null {
  const found: string[] = [];
  for (const line of lines) {
    const p = plain(line);
    if (!/\b(TOTAL|TTC|NET A PAYER|A PAYER|MONTANT|AMOUNT DUE|BALANCE DUE|GRAND TOTAL|CB|CARTE|VISA|MASTERCARD|PAYE)\b/u.test(p)) continue;
    if (/\b(HT|H\.T|SOUS[- ]TOTAL|SUBTOTAL|TVA|VAT|TAX|RENDU|CHANGE|REMISE)\b/u.test(p) && !/\bTTC\b/u.test(p)) continue;
    const last = amounts(line).at(-1);
    if (last) found.push(last);
  }
  if (found.length === 0) return null;
  return found.sort((a, b) => Number(b.replace(",", ".")) - Number(a.replace(",", ".")))[0]!;
}

// The VAT: one line naming it with an amount smaller than the total.
function vat(lines: string[], totalText: string | null): string | null {
  const values = lines.filter(l => /\b(TVA|VAT)\b/u.test(plain(l)) && !/\bTTC\b/u.test(plain(l))).map(l => amounts(l).at(-1)).filter((v): v is string => v !== undefined);
  if (values.length !== 1) return null;
  const v = values[0]!;
  const n = Number(v.replace(",", "."));
  return totalText !== null && n > 0 && n < Number(totalText.replace(",", ".")) ? v : null;
}

// The day: the first date written day first (as in France), or year first;
// not in the future, not more than two years back.
function date(text: string, today: string): string | null {
  const candidates: string[] = [];
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/gu)) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    candidates.push(`${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  for (const m of text.matchAll(/(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/gu)) candidates.push(`${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`);
  const earliest = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  for (const d of candidates) {
    const parsed = new Date(d + "T00:00:00Z");
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d && d <= today && d >= earliest) return d;
  }
  return null;
}

// The shop: the first line that is mostly letters (the name printed on
// top), not an address, a date or an amount.
function merchant(lines: string[]): string | null {
  for (const line of lines.slice(0, 5)) {
    const text = line.trim();
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters < text.replace(/\s/gu, "").length * 0.7) continue;
    if (/\d{5}/u.test(text) || /\b(RUE|AVENUE|BD|BOULEVARD|PLACE|STREET|ROAD|TEL|SIRET)\b/u.test(plain(text))) continue;
    return text.replace(/\s+/gu, " ").slice(0, 60);
  }
  return null;
}

export function readReceiptText(text: string, today: string): ReceiptGuess {
  const lines = text.split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
  const amount = total(lines);
  return { amount, date: date(text, today), vat: vat(lines, amount), merchant: merchant(lines) };
}
