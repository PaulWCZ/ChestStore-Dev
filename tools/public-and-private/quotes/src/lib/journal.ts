import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { company, type Accounts } from "./company.ts";
import { separatorFor, toCsv } from "../shared/csv.ts";
import type { Query } from "./db.ts";
import { linesOf, noVat, type Line } from "./documents.ts";
import type { Period } from "./export.ts";
import { catalogue, type Locale } from "../i18n/index.ts";
import { limits } from "../shared/model.ts";
import { plainAmount } from "../shared/money.ts";
import { lineNet, totals } from "../shared/totals.ts";

// The accountant's entries: the sales journal of a period, one entry per
// invoice or credit note, balanced — the client's account debited with the
// total, the sales (services or goods) and the VAT collected (per rate)
// credited; a credit note the other way round. A deposit invoice credits
// the deposits received account (4191), and the final invoice's lines that
// take deposits back debit it; a credit note of a deposit invoice debits
// it too (it cancels a deposit, not a sale): 4191 returns to zero. In the columns of the French "fichier des
// écritures comptables" (article A47 A-1 of the Livre des procédures
// fiscales: JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum,
// CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib,
// Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise),
// so accounting software imports them without re-keying. It is this
// tool's sales journal, not a whole FEC: the accountant's books hold the
// rest. The account numbers are the company's (Settings); a client's own
// account code (its card) is its auxiliary account, else "C" and its
// number here (C00012).

export type Entry = {
  account: string;
  label: "client" | "services" | "goods" | "deposits" | "vat";
  auxiliary: string;
  auxiliaryName: string;
  debit: number;
  credit: number;
  rate?: number;
};

export type JournalDoc = {
  type: "invoice" | "credit";
  franchise: boolean;
  vatTreatment: "standard" | "reverse_charge";
  depositPercent: number | null;
  // A credit note of a deposit invoice.
  creditOfDeposit?: boolean;
  clientId: string | null;
  clientAccount: string;
  buyerName: string;
};

export const auxiliaryOf = (clientId: string | null, account: string): string => account || (clientId ? "C" + clientId.padStart(5, "0") : "C00000");

// entriesOf: one document's balanced lines.
export function entriesOf(doc: JournalDoc, lines: readonly Line[], accounts: Accounts): Entry[] {
  const sign = doc.type === "credit" ? -1 : 1;
  const withoutVat = noVat(doc);
  const t = totals(lines, { noVat: withoutVat });
  const aux = auxiliaryOf(doc.clientId, doc.clientAccount);
  const out: Entry[] = [];
  const side = (amount: number) => (amount >= 0 ? { debit: 0, credit: amount } : { debit: -amount, credit: 0 });
  // The client owes the total (or is owed it back).
  out.push({ account: accounts.client, label: "client", auxiliary: aux, auxiliaryName: doc.buyerName, ...side(-sign * t.gross) });
  // Sales, per account.
  const byAccount = new Map<string, { label: Entry["label"]; amount: number }>();
  for (const l of lines) {
    if (l.kind !== "line") continue;
    const label: Entry["label"] = doc.depositPercent !== null || doc.creditOfDeposit === true || l.depositOf ? "deposits" : l.goods ? "goods" : "services";
    const account = label === "deposits" ? accounts.deposits : label === "goods" ? accounts.goods : accounts.services;
    const current = byAccount.get(account) ?? { label, amount: 0 };
    current.amount += lineNet(l);
    byAccount.set(account, current);
  }
  for (const [account, { label, amount }] of byAccount) if (amount !== 0) out.push({ account, label, auxiliary: "", auxiliaryName: "", ...side(sign * amount) });
  // VAT collected, per rate.
  for (const r of t.rates) {
    if (r.vat === 0) continue;
    out.push({ account: accounts.vat[String(r.rate)] ?? accounts.vat["2000"]!, label: "vat", rate: r.rate, auxiliary: "", auxiliaryName: "", ...side(sign * r.vat) });
  }
  return out;
}

type Row = { id: number; type: "invoice" | "credit"; number: string; issue_date: string; currency: string; franchise: boolean; vat_treatment: "standard" | "reverse_charge"; deposit_percent: number | null; of_deposit: boolean; client_id: number | null; account: string | null; buyer: { name?: string } | null; client_name: string | null };

export async function exportJournal(sql: Query, actor: Member | null, locale: Locale, p: Period): Promise<{ text: string; fileName: string; count: number }> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const c = await company(sql);
  const t = catalogue(locale);
  const j = t.journal;
  const docs = await sql<Row[]>`
    select d.id, d.type, d.number, d.issue_date, d.currency, d.franchise, d.vat_treatment, d.deposit_percent, d.client_id, cl.account, d.buyer, cl.name as client_name,
           (d.type = 'credit' and inv.deposit_percent is not null) as of_deposit
    from documents d left join clients cl on cl.id = d.client_id left join documents inv on inv.id = d.invoice_id
    where d.type in ('invoice', 'credit') and d.status = 'final' and d.issue_date >= ${p.from} and d.issue_date <= ${p.to}
    order by d.issue_date, d.type desc, d.seq
    limit ${limits.exportRows + 1}`;
  if (docs.length > limits.exportRows) throw new AppError("export_too_large");
  const ymd = (d: string) => d.replaceAll("-", "");
  const header = [j.columns.journalCode, j.columns.journalLib, j.columns.entryNum, j.columns.entryDate, j.columns.account, j.columns.accountLib, j.columns.auxNum, j.columns.auxLib,
    j.columns.pieceRef, j.columns.pieceDate, j.columns.entryLib, j.columns.debit, j.columns.credit, j.columns.letter, j.columns.letterDate, j.columns.validDate, j.columns.foreignAmount, j.columns.currency];
  const body: string[][] = [];
  for (const d of docs) {
    const lines = await linesOf(sql, String(d.id));
    const buyerName = d.buyer?.name ?? d.client_name ?? "";
    const entries = entriesOf({ type: d.type, franchise: d.franchise, vatTreatment: d.vat_treatment, depositPercent: d.deposit_percent, creditOfDeposit: d.of_deposit, clientId: d.client_id === null ? null : String(d.client_id), clientAccount: d.account ?? "", buyerName }, lines, c.accounts);
    const kind = d.type === "credit" ? t.types.credit : d.deposit_percent !== null ? t.types.deposit : t.types.invoice;
    // The amounts are in the document's currency (the Chest's): named in
    // Idevise when it is not the euro.
    const foreign = d.currency !== "EUR";
    const amount = (minor: number) => plainAmount(minor, d.currency, locale);
    for (const e of entries) {
      body.push([
        c.accounts.journal, j.label, d.number, ymd(d.issue_date), e.account, j.accounts[e.label], e.auxiliary, e.auxiliaryName, d.number, ymd(d.issue_date),
        `${kind} ${d.number} ${buyerName}`.trim(), amount(e.debit), amount(e.credit), "", "", ymd(d.issue_date),
        foreign ? amount(e.debit || e.credit) : "", foreign ? d.currency : "",
      ]);
    }
  }
  return { text: toCsv([header, ...body], separatorFor(locale)), fileName: `${j.file}_${p.from}_${p.to}.csv`, count: docs.length };
}
