// Safe in the browser: no SDK here.
// Reading a bank statement exported as CSV into its lines: a date, the
// words of the line, and the money in (a payment received) or out. Pure:
// the page reads the file to show the columns it recognised; the server
// reads it again with the columns chosen (lib/bank.ts).
//
// Which files: a bank's CSV export as the French banks' online spaces give
// it — a few lines about the account first, then a header row, then one
// line per operation, ";" and decimal commas — or any spreadsheet with a
// date, a label and either one signed amount or a credit and a debit
// column. The headers below are the usual French and English words for
// those columns; the studio could not read the banks' own documentation of
// their exports (see README, "Bank statements"): where a header is not
// known, the person matches the column on the page. CAMT.053 and OFX are
// not read.
import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import { key } from "./fold.ts";
import { dominantMark, parseAmount, type DecimalMark } from "./money.ts";

export const bankLimits = { rows: 5000, bytes: 2 * 1024 * 1024, headerSearch: 30 } as const;

export const bankFields = ["date", "valueDate", "label", "reference", "amount", "credit", "debit"] as const;
export type BankField = (typeof bankFields)[number];
export type BankMapping = (BankField | "")[];

const words: Record<BankField, string[]> = {
  date: ["date", "dateoperation", "datedoperation", "datedeloperation", "dateope", "datecomptable", "datecompta", "datedecomptabilisation", "bookingdate", "transactiondate",
    "dateeffet", "jour", "datetransaction", "postingdate", "operationdate"],
  valueDate: ["datevaleur", "datedevaleur", "valuedate", "valeur"],
  label: ["libelle", "libelleoperation", "libelledeloperation", "libellesimplifie", "libellecourt", "intitule", "operation", "description", "label", "wording", "nature",
    "naturedeloperation", "designation", "transaction", "details", "narrative", "payee", "contrepartie", "counterparty", "tiers", "beneficiaire"],
  reference: ["reference", "ref", "referencedeloperation", "libelleetendu", "libellecomplet", "informationscomplementaires", "infocomplementaire", "complement", "detail",
    "motif", "communication", "remittanceinformation", "memo", "note", "notes", "referenceclient", "referencedebitsepa", "endtoendid"],
  amount: ["montant", "montanteur", "montanteuros", "montantenedeuros", "montantdeloperation", "amount", "somme", "valeureur", "montantoperation", "transactionamount"],
  credit: ["credit", "crediteur", "crediteuros", "creditseur", "credits", "encaissement", "encaissements", "recette", "recettes", "montantcredit", "creditamount", "moneyin", "paidin", "entree", "entrees"],
  debit: ["debit", "debiteur", "debiteuros", "debits", "decaissement", "decaissements", "depense", "depenses", "montantdebit", "debitamount", "moneyout", "paidout", "sortie", "sorties"],
};
const byWord: Record<string, BankField> = {};
for (const [field, list] of Object.entries(words) as [BankField, string[]][]) for (const w of list) byWord[w] ??= field;

export const guessBankField = (header: string): BankField | "" => byWord[key(header)] ?? "";

export function guessBankMapping(head: string[]): BankMapping {
  const used = new Set<BankField>();
  return head.map(h => {
    const f = guessBankField(h);
    if (!f || used.has(f)) return "";
    used.add(f);
    return f;
  });
}

// A mapping reads a statement when it has a date and either a signed
// amount or a credit column.
export const bankMappingReady = (m: BankMapping): boolean => m.includes("date") && (m.includes("amount") || m.includes("credit"));

export type Statement = { head: string[]; rows: string[][]; skippedAbove: number };

// readStatement finds the header row (the first of the first lines that
// names a date and money columns — a bank writes the account's details
// above it), and the lines below it.
export function readStatement(text: string): Statement {
  if (typeof text !== "string") throw new AppError("import_invalid");
  if (text.length > bankLimits.bytes) throw new AppError("import_too_large");
  const source = text.replace(/^﻿/u, "");
  const lines = source.split(/\r?\n/u);
  let at = -1;
  for (let i = 0; i < Math.min(lines.length, bankLimits.headerSearch); i++) {
    const cells = parseCsv(lines[i]!, 1)[0] ?? [];
    if (cells.length >= 2 && bankMappingReady(guessBankMapping(cells.map(c => c.trim())))) { at = i; break; }
  }
  // No header recognised: the first line names the columns, as in any
  // spreadsheet (the person matches them).
  const start = at < 0 ? 0 : at;
  const all = parseCsv(lines.slice(start).join("\n"), bankLimits.rows + 1);
  if (all.length === 0 || all[0]!.length < 2) throw new AppError("import_invalid");
  if (all.length < 2) throw new AppError("import_empty");
  const [head, ...rows] = all;
  if (rows.length > bankLimits.rows) throw new AppError("import_too_large");
  return { head: head!.map(h => h.trim()), rows, skippedAbove: start };
}

export function checkBankMapping(head: string[], mapping: unknown): BankMapping {
  if (!Array.isArray(mapping) || mapping.length !== head.length) throw new AppError("import_invalid");
  const used = new Set<string>();
  const out = mapping.map(m => {
    if (m === "" || m === null) return "";
    if (typeof m !== "string" || !(bankFields as readonly string[]).includes(m) || used.has(m)) throw new AppError("import_invalid");
    used.add(m);
    return m as BankField;
  });
  if (!bankMappingReady(out)) throw new AppError("import_invalid");
  return out;
}

// A day as banks write it: 28/09/2026, 28/09/26, 28.09.2026, 28-09-2026,
// 2026-09-28. Null when it is none of these, or not a day of the calendar.
export function bankDay(text: string): string | null {
  const s = text.trim();
  let y: number, m: number, d: number;
  let found = /^(\d{4})-(\d{1,2})-(\d{1,2})/u.exec(s);
  if (found) [y, m, d] = [Number(found[1]), Number(found[2]), Number(found[3])];
  else {
    found = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/u.exec(s);
    if (!found) return null;
    [d, m, y] = [Number(found[1]), Number(found[2]), Number(found[3])];
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// A line of the statement: money in is positive, money out negative.
export type BankLine = { line: number; date: string; label: string; reference: string; amount: number; occurrence: number };
export type BankProblem = { line: number; error: "date_invalid" | "amount_invalid" };

// linesOf reads each row with the mapping: the date (else the value
// date), the label and the reference, the money (a signed amount, or credit
// less debit). A row with no money (a balance line) is left aside; a row
// whose date or amount cannot be read is said. Two identical lines keep
// their order (`occurrence`), so the same statement read again finds them
// as they were.
export function linesOf(statement: Statement, mapping: BankMapping, currency = "EUR"): { lines: BankLine[]; problems: BankProblem[] } {
  const col = (f: BankField) => mapping.indexOf(f);
  const [cDate, cValue, cLabel, cRef, cAmount, cCredit, cDebit] = (["date", "valueDate", "label", "reference", "amount", "credit", "debit"] as const).map(col) as [number, number, number, number, number, number, number];
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  // A lone mark before three digits ("1,234") read with the statement's own
  // decimal mark (bankMarkOf), as thousands when it gives no clue.
  const reading = bankMarkOf(statement, mapping) ?? "thousands";
  const money = (text: string) => (text === "" ? 0 : parseAmount(text.replace(/^\+/u, ""), currency, { negative: true, reading }));
  const lines: BankLine[] = [];
  const problems: BankProblem[] = [];
  const seen = new Map<string, number>();
  statement.rows.forEach((row, i) => {
    const line = statement.skippedAbove + i + 2;
    let amount: number | null;
    if (cAmount >= 0 && cell(row, cAmount) !== "") amount = money(cell(row, cAmount));
    else {
      const credit = money(cell(row, cCredit));
      const debit = money(cell(row, cDebit));
      amount = credit === null || debit === null ? null : Math.abs(credit) - Math.abs(debit);
    }
    const dateText = cell(row, cDate) || cell(row, cValue);
    if (amount === 0 && dateText === "") return;
    if (amount === null) { problems.push({ line, error: "amount_invalid" }); return; }
    if (amount === 0) return;
    const date = bankDay(dateText) ?? bankDay(cell(row, cValue));
    if (!date) { problems.push({ line, error: "date_invalid" }); return; }
    const label = cell(row, cLabel).replace(/\s+/gu, " ").slice(0, 300);
    const reference = cell(row, cRef).replace(/\s+/gu, " ").slice(0, 300);
    const sameAs = [date, amount, label, reference].join("\u0000");
    const occurrence = (seen.get(sameAs) ?? 0) + 1;
    seen.set(sameAs, occurrence);
    lines.push({ line, date, label, reference, amount, occurrence });
  });
  return { lines, problems };
}

// Text in a browser: UTF-8, else Windows-1252 (what many banks still
// write, "Libellé" in Latin-1).
export function decodeStatement(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// The decimal mark a statement's amounts use (amount, credit, debit
// columns); null when it gives no clue. Said under its columns.
export function bankMarkOf(statement: Statement, mapping: BankMapping): DecimalMark | null {
  const columns = mapping.flatMap((f, i) => (f === "amount" || f === "credit" || f === "debit" ? [i] : []));
  return columns.length === 0 ? null : dominantMark(statement.rows.flatMap(row => columns.map(i => row[i] ?? "")));
}
