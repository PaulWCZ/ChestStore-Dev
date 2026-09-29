import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { lines, fileBase, type Selection } from "./export.ts";
import { catalogue, type Locale } from "./i18n/index.ts";
import { minorDigits, recoverable } from "./money.ts";
import { nameOf } from "./people.ts";
import { memberAccounts, settings } from "./settings.ts";
import { allowanceName, categoryName } from "./words.ts";

// The accounting entries of the export, in the column layout of the French
// "fichier des écritures comptables" (FEC, art. A47 A-1 of the Livre des
// procédures fiscales: 18 columns, JournalCode … Idevise; tab-separated,
// dates as YYYYMMDD, amounts with a decimal comma) — the layout French
// accounting software imports. It is a journal of expense claims for the
// accountant to import, not the company's FEC (only its accounting
// software produces that).
//
// One balanced entry per expense, in the company's currency:
// - debit: the category's account (or the flat rate's), amount without the
//   recoverable VAT;
// - debit: the deductible VAT account, the recoverable VAT (receipts in the
//   company's currency only: foreign VAT is not deducted this way);
// - credit: the employees' account with the person's own (auxiliary)
//   account when paid with their money, the company card's account
//   otherwise.
// An expense in another currency carries its amount and currency on its
// credit line (Montantdevise, Idevise). One without a rate has no amount in
// the company's currency: it is left out, and counted.

export const fecColumns = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"] as const;

// Amounts as the FEC writes them: a decimal comma, no grouping.
export function fecAmount(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  if (digits === 0) return sign + String(abs);
  const unit = 10 ** digits;
  return `${sign}${Math.floor(abs / unit)},${String(abs % unit).padStart(digits, "0")}`;
}

const fecDate = (day: string) => day.replaceAll("-", "");
// A field never holds the separator or a line break.
const field = (text: string) => text.replace(/[\t\r\n|]+/gu, " ").trim();

export async function journalText(sql: Query, actor: Member, locale: Locale, selection: Selection): Promise<{ text: string; fileName: string; left: number }> {
  const { rows, who, currency } = await lines(sql, actor, selection);
  const [company, accounts] = await Promise.all([settings(sql), memberAccounts(sql)]);
  const t = catalogue(locale);
  const j = company.journal;
  const out: string[][] = [[...fecColumns]];
  let left = 0;
  for (const r of rows) {
    if (r.base === null || r.baseCurrency !== currency) {
      left++;
      continue;
    }
    const person = nameOf(who.get(r.owner), locale);
    const what = r.trip ? `${r.trip.from} - ${r.trip.to}` : r.flat ? allowanceName(r.flat, t) : r.merchant || categoryName({ key: r.categoryKey, name: r.categoryName }, t);
    const label = field(`${person} ${what}`).slice(0, 200);
    const vat = r.trip || r.allowance || r.vat === null || r.currency !== currency ? 0 : recoverable(r.vat, r.vatRecovery);
    const net = r.base - vat;
    const decided = r.decidedAt ? fecDate(r.decidedAt.slice(0, 10)) : "";
    const base = { num: "E" + r.id, date: fecDate(r.spentOn), piece: "E" + r.id, label, valid: decided };
    const line = (account: string, accountLabel: string, aux: string, auxLabel: string, debit: number, credit: number, foreign: [string, string] = ["", ""]) =>
      [j.code, t.journal.name, base.num, base.date, account, field(accountLabel), aux, field(auxLabel), base.piece, base.date, base.label, fecAmount(debit, currency), fecAmount(credit, currency), "", "", base.valid, ...foreign];
    const categoryLabel = r.flat ? allowanceName(r.flat, t) : categoryName({ key: r.categoryKey, name: r.categoryName }, t);
    if (net > 0) out.push(line(r.account, categoryLabel, "", "", net, 0));
    if (vat > 0) out.push(line(j.vat, t.journal.vat, "", "", vat, 0));
    const foreign: [string, string] = r.currency !== currency ? [fecAmount(r.amount, r.currency), r.currency] : ["", ""];
    if (r.paidBy === "me") out.push(line(j.employees, t.journal.employees, accounts.get(r.owner) ?? "", accounts.has(r.owner) ? person : "", 0, r.base, foreign));
    else out.push(line(j.card, t.journal.card, "", "", 0, r.base, foreign));
  }
  const text = out.map(cells => cells.join("\t")).join("\r\n") + "\r\n";
  return { text, fileName: `${fileBase(selection, who, locale)}_${t.journal.file}.txt`, left };
}
