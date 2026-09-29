// Safe in the browser: no SDK here.
// Reading a company card statement: the CSV a bank or a card provider
// exports (a line per payment: a date, a label, an amount, sometimes a
// currency and the card holder). The file is read in the browser with
// lib/csv-read.ts; this guesses its columns, and reads each line as a card
// payment, a refund or credit (left out), or a line it cannot read.
//
// The shapes relied on (README, "Card statements"): French bank exports
// write `Date;Libellé;Montant` with a semicolon, a comma for decimals and
// spending as negative amounts (or separate `Débit` / `Crédit` columns);
// Qonto's exports offer a settlement date, a counterparty name and a total
// amount, in CSV with a comma or a semicolon. The accountant checks the
// guess before anything happens; nothing else is assumed.
import { guessDateOrder, readDate, type DateOrder } from "./csv-read.ts";
import { parseAmount } from "./money.ts";

export const cardFields = ["date", "label", "amount", "debit", "currency", "holder"] as const;
export type CardField = (typeof cardFields)[number];
export type CardMapping = Partial<Record<CardField, number>>;

// Header words, lower case without accents. The first that fits wins, an
// exact header before one that starts with the word.
const hints: Record<CardField, string[]> = {
  date: ["date operation", "date de l'operation", "date de l operation", "operation date", "operation date (utc)", "date", "transaction date", "settlement date", "settlement date (utc)", "date de comptabilisation", "booking date", "date de valeur"],
  label: ["libelle", "libelle operation", "libelle de l'operation", "counterparty name", "counterparty", "contrepartie", "nom de la contrepartie", "description", "label", "merchant", "commercant", "intitule", "details"],
  amount: ["montant", "amount", "total amount", "total amount (incl. vat)", "montant total", "montant (eur)", "montant(euros)", "montant ttc"],
  debit: ["debit", "debit (eur)", "debit euros", "montant debit", "sortie"],
  currency: ["devise", "currency", "monnaie", "code devise"],
  holder: ["porteur", "porteur de la carte", "titulaire", "titulaire de la carte", "card holder", "cardholder", "card holder name", "initiator", "initiateur", "utilisateur", "user", "membre", "employee", "salarie"],
};

const plain = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").replace(/’/gu, "'").toLowerCase().replace(/\s+/gu, " ").trim();

export function guessCardMapping(headers: string[]): CardMapping {
  const heads = headers.map(plain);
  const mapping: CardMapping = {};
  const used = new Set<number>();
  for (const field of cardFields) {
    for (const exact of [true, false]) {
      if (mapping[field] !== undefined) break;
      for (const hint of hints[field]) {
        const index = heads.findIndex((h, i) => !used.has(i) && (exact ? h === hint : h.startsWith(hint + " ") || h.startsWith(hint + "(")));
        if (index >= 0) {
          mapping[field] = index;
          used.add(index);
          break;
        }
      }
    }
  }
  // An amount column and a debit column: the debit says it better.
  if (mapping.debit !== undefined && mapping.amount !== undefined) delete mapping.amount;
  return mapping;
}

// A signed amount as statements write it: "-42,50", "−42.50", "42,50-",
// "(42.50)", "1 234,56 €". Minor units; null when it is not an amount.
export function readSigned(text: string, currency: string): number | null {
  let s = text.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/u.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[−–]/gu, "-");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  else if (s.endsWith("-")) { negative = !negative; s = s.slice(0, -1); }
  else if (s.startsWith("+")) s = s.slice(1);
  const value = parseAmount(s, currency);
  return value === null ? null : negative ? -value : value;
}

export type CardRow = { row: number; date: string; label: string; amount: number; currency: string; holder: string };
export type CardReading = { lines: CardRow[]; refunds: number; unreadable: number[] };

// readCardLines reads the rows (without the header) with the mapping. A
// signed amount column: payments are the negative amounts, and the
// positive ones refunds or credits — unless no amount is negative (an
// export of spending only). A debit column: payments are its amounts, lines
// without one are credits. A line without a readable date or amount is
// counted apart (its row number, 1 = the first line after the header).
export function readCardLines(rows: string[][], mapping: CardMapping, order: DateOrder, currency: string): CardReading {
  const cell = (r: string[], f: CardField) => (mapping[f] === undefined ? "" : (r[mapping[f]!] ?? "").trim());
  const useDebit = mapping.debit !== undefined;
  const signed = rows.map(r => {
    const code = cell(r, "currency").toUpperCase();
    const own = /^[A-Z]{3}$/u.test(code) ? code : currency;
    return { own, value: readSigned(cell(r, useDebit ? "debit" : "amount"), own) };
  });
  const anyNegative = !useDebit && signed.some(s => s.value !== null && s.value < 0);
  const out: CardReading = { lines: [], refunds: 0, unreadable: [] };
  rows.forEach((r, i) => {
    const { own, value } = signed[i]!;
    const date = readDate(cell(r, "date"), order);
    if (useDebit && cell(r, "debit") === "") { out.refunds++; return; }
    if (value === null || date === null) { out.unreadable.push(i + 1); return; }
    if (value === 0) { out.refunds++; return; }
    const spent = useDebit ? Math.abs(value) : anyNegative ? (value < 0 ? -value : null) : value;
    if (spent === null || spent <= 0) { out.refunds++; return; }
    out.lines.push({ row: i + 1, date, label: cell(r, "label"), amount: spent, currency: own, holder: cell(r, "holder") });
  });
  return out;
}

// The date order of the mapped date column (day first by default).
export function cardDateOrder(rows: string[][], mapping: CardMapping): DateOrder {
  return mapping.date === undefined ? "dmy" : guessDateOrder(rows.slice(0, 200).map(r => r[mapping.date!] ?? ""));
}

export const holderKey = plain;
