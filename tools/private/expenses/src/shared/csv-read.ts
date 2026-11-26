// Safe in the browser: no SDK here.
// Reading a CSV another tool exported (Expensify, N2F, a spreadsheet): the
// separator found from the first line (comma, semicolon or tab), quoted
// fields with doubled quotes and line breaks (RFC 4180), a byte-order mark
// dropped. Then a guess of which column is which, from the headers people
// find in those exports; the accountant checks it before anything happens.

export function detectSeparator(text: string): string {
  const first = text.split(/\r?\n/u, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map(sep => ({ sep, n: first.split(sep).length - 1 }));
  return counts.sort((a, b) => b.n - a.n)[0]!.n > 0 ? counts[0]!.sep : ",";
}

export function parseCsv(input: string, maxRows = 5001): string[][] {
  const text = input.replace(/^﻿/u, "");
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length >= maxRows) return rows;
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

// The fields an imported line can fill.
export const importFields = ["date", "person", "amount", "currency", "category", "merchant", "note"] as const;
export type ImportField = (typeof importFields)[number];
export type Mapping = Partial<Record<ImportField, number>>;

// Header words, lower case without accents, as the exports write them
// (Expensify's "Basic export" and its expense-level templates; N2F's and
// most French tools' column names; a plain spreadsheet's).
const hints: Record<ImportField, string[]> = {
  date: ["date", "timestamp", "transaction date", "date de la depense", "date depense", "jour"],
  person: ["person", "employee", "submitter", "name", "reporter", "salarie", "collaborateur", "nom", "personne", "utilisateur", "user", "email", "e-mail"],
  amount: ["amount", "total", "montant ttc", "montant", "ttc", "amount (converted)", "converted amount", "prix"],
  currency: ["currency", "original currency", "devise", "monnaie"],
  category: ["category", "categorie", "nature", "type de depense", "type", "expense type"],
  merchant: ["merchant", "vendor", "fournisseur", "commercant", "lieu", "etablissement", "where"],
  note: ["comment", "description", "note", "commentaire", "memo", "motif", "details"],
};

const plain = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const heads = headers.map(plain);
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const field of importFields) {
    // An exact header first, then one that starts with the word.
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
  return mapping;
}

// Dates as exports write them: 2026-03-14, 14/03/2026 (day first, as in
// France) or 03/14/2026 (month first, as Expensify in the US); the order
// is guessed from the column (a first number above 12), else day first.
export type DateOrder = "ymd" | "dmy" | "mdy";

export function guessDateOrder(values: string[]): DateOrder {
  if (values.every(v => /^\s*\d{4}-\d{1,2}-\d{1,2}/u.test(v) || v.trim() === "")) return "ymd";
  const pairs = values.map(v => /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/u.exec(v)).filter((m): m is RegExpExecArray => m !== null);
  if (pairs.some(m => Number(m[2]) > 12)) return "mdy";
  return "dmy";
}

export function readDate(value: string, order: DateOrder): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/u.exec(v);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else {
    const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/u.exec(v);
    if (!parts) return null;
    const a = Number(parts[1]), b = Number(parts[2]);
    y = Number(parts[3]);
    if (y < 100) y += 2000;
    [d, m] = order === "mdy" ? [b, a] : [a, b];
  }
  const text = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const date = new Date(text + "T00:00:00Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

// A person's name as compared: case, accents and spaces aside.
export const personKey = plain;
