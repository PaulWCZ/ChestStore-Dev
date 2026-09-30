import { randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { openIban, sealedAccounts, type Address } from "./bank.ts";
import type { Query, Sql } from "./db.ts";
import { expensesByIds, type Decision } from "./expenses.ts";
import { catalogue, format, type Locale } from "./i18n/index.ts";
import { needsAddress, sepaCountry } from "./iban.ts";
import { chest } from "@argentic/chest-sdk/chest";
import { day } from "./model.ts";
import { today } from "./today.ts";
import { nameOf, people } from "./people.ts";
import { pain001 } from "./sepa.ts";
import { settings } from "./settings.ts";

// Paying back by transfer file: the accountant picks the day the bank
// should pay; every approved expense paid with someone's own money, in euros
// (or with its amount in euros), of the people whose bank details are in
// the SEPA zone, goes into one batch: one transfer per person. The batch
// marks them paid on that day (Undo cancels it) and keeps what the file
// says, so it can be downloaded again, identical.

type FileTransfer = { member: string; iban: string; bic: string | null; holder: string; amount: number; ids: string[]; address?: Address | null };
type FileBody = { payer: { iban: string; bic: string | null; name: string; address?: Address | null }; transfers: FileTransfer[] };

// Why a person is not in a transfer file: no account in the SEPA zone; an
// account outside the EEA without its postal address; or the company's
// own address missing (it goes with those transfers); or the person left
// the company (paid on their final pay slip, then "Mark paid": a transfer
// to a former employee's account is exactly what a diversion would ask
// for). Paid by hand, or once the details are there.
export type SkipReason = "no_bank" | "address" | "company_address" | "left";
// leftAt: for "left", when they left the Chest (null when it does not say).
export type Skipped = { member: string; reason: SkipReason; leftAt?: string | null };

export type Run = { id: string; messageId: string; executionDate: string; count: number; total: number; currency: string; createdAt: string; createdBy: string; cancelled: boolean };
type RunRow = { id: string; message_id: string; execution_date: string; count: number; total_cents: string; currency: string; created_at: Date; created_by: string; cancelled_at: Date | null; file: FileBody };
const toRun = (r: RunRow): Run => ({ id: String(r.id), messageId: r.message_id, executionDate: r.execution_date, count: r.count, total: Number(r.total_cents), currency: r.currency, createdAt: r.created_at.toISOString(), createdBy: r.created_by, cancelled: r.cancelled_at !== null });

// What a transfer file needs before it can be made: the company's account,
// its name, euros. Codes the page turns into words.
export async function readiness(sql: Query, actor: Member | null): Promise<"ready" | "sepa_currency" | "no_company_bank"> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const company = await settings(sql);
  if (company.currency !== "EUR") return "sepa_currency";
  const [account] = await sql<{ country: string }[]>`select country from bank_accounts where owner = 'company'`;
  if (!account || !sepaCountry(account.country) || company.payer === "") return "no_company_bank";
  return "ready";
}

// The day a transfer may be asked for: from today, two months ahead.
function executionDay(value: unknown, now = today()): string {
  const d = day(value);
  const last = new Date(Date.parse(now + "T00:00:00Z") + 62 * 86400000).toISOString().slice(0, 10);
  if (d < now || d > last) throw new AppError("date_invalid");
  return d;
}

export type Created = { run: Run; decisions: Decision[]; skipped: Skipped[] };

// createRun makes the batch for the people chosen (all when none is named)
// and marks their expenses paid on the execution day. People without bank
// details in the SEPA zone, or without the postal address a transfer
// outside the EEA carries, are skipped (and named, with the reason: paid by
// hand, or later).
export async function createRun(sql: Sql, actor: Member | null, input: { members?: unknown; executionDate?: unknown }): Promise<Created> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const ready = await readiness(sql, actor);
  if (ready !== "ready") throw new AppError(ready);
  const execution = executionDay(input.executionDate);
  const chosen = input.members === undefined || input.members === null ? null : Array.isArray(input.members) && input.members.every(m => typeof m === "string") ? input.members as string[] : null;
  if (input.members !== undefined && input.members !== null && chosen === null) throw new AppError("invalid");
  const company = await settings(sql);
  return sql.begin(async tx => {
    const rows = await tx<{ id: string; member_id: string; base_cents: string }[]>`
      select id, member_id, base_cents from expenses
      where status = 'approved' and paid_by = 'me' and deleted_at is null and base_cents is not null and base_currency = 'EUR' and member_id <> 'erased'
        ${chosen ? tx`and member_id = any(${chosen}::text[])` : tx``}
      order by member_id, spent_on, id for update`;
    const accounts = await sealedAccounts(tx, ["company", ...new Set(rows.map(r => r.member_id))]);
    const who = await people(new Set(rows.map(r => r.member_id)));
    const gone = (member: string) => who.get(member)?.status === "former" || who.get(member)?.status === "erased";
    const payer = accounts.get("company");
    if (!payer) throw new AppError("no_company_bank");
    const byMember = new Map<string, { amount: number; ids: string[] }>();
    for (const r of rows) {
      const line = byMember.get(r.member_id) ?? { amount: 0, ids: [] };
      line.amount += Number(r.base_cents);
      line.ids.push(String(r.id));
      byMember.set(r.member_id, line);
    }
    const transfers: FileTransfer[] = [];
    const skipped: Skipped[] = [];
    for (const [member, line] of byMember) {
      if (gone(member)) {
        skipped.push({ member, reason: "left", leftAt: who.get(member)?.leftAt ?? null });
        continue;
      }
      const account = accounts.get(member);
      if (!account || !sepaCountry(account.country)) {
        skipped.push({ member, reason: "no_bank" });
        continue;
      }
      const far = needsAddress(account.country);
      if (far && !account.address) {
        skipped.push({ member, reason: "address" });
        continue;
      }
      if (far && !payer.address) {
        skipped.push({ member, reason: "company_address" });
        continue;
      }
      transfers.push({ member, iban: account.iban, bic: account.bic, holder: account.holder, amount: line.amount, ids: line.ids, address: far ? account.address : null });
    }
    if (transfers.length === 0) {
      if (byMember.size === 0 || skipped.every(s => s.reason === "left")) throw new AppError("nothing_to_pay");
      throw new AppError(skipped.every(s => s.reason === "no_bank" || s.reason === "left") ? "no_bank_details" : "address_needed");
    }
    const total = transfers.reduce((sum, t) => sum + t.amount, 0);
    // The payer's address goes in the file when a transfer leaves the EEA.
    const file: FileBody = { payer: { iban: payer.iban, bic: payer.bic, name: company.payer, address: transfers.some(t => t.address) ? payer.address : null }, transfers };
    // The message id names the batch for good (a bank refuses a second file
    // with the same one): the day and a random part, unique here.
    const messageId = `EXP-${execution.replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [created] = await tx<RunRow[]>`
      insert into payment_runs (message_id, created_by, execution_date, currency, count, total_cents, file)
      values (${messageId}, ${actor!.id}, ${execution}, 'EUR', ${transfers.length}, ${total}, ${tx.json(file as never)})
      returning id, message_id, to_char(execution_date, 'YYYY-MM-DD') as execution_date, count, total_cents, currency, created_at, created_by, cancelled_at, file`;
    const ids = transfers.flatMap(t => t.ids);
    await tx`update expenses set status = 'paid', paid_on = ${execution}, paid_marked_by = ${actor!.id}, payment_run_id = ${created!.id} where id = any(${ids}::bigint[])`;
    for (const id of ids) await tx`insert into history (expense_id, actor, kind, detail) values (${id}, ${actor!.id}, 'paid', ${execution})`;
    const paid = await expensesByIds(tx, ids);
    const decisions = transfers.map(t => ({ owner: t.member, expenses: paid.filter(e => e.owner === t.member) }));
    return { run: toRun(created!), decisions, skipped };
  });
}

// cancelRun: the file was not sent to the bank after all (Undo). Its
// expenses go back to "to pay back"; the batch stays, marked cancelled.
export async function cancelRun(sql: Sql, actor: Member | null, runValue: unknown): Promise<string[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const runId = typeof runValue === "string" && /^[1-9][0-9]{0,17}$/u.test(runValue) ? runValue : null;
  if (!runId) throw new AppError("not_found");
  return sql.begin(async tx => {
    const [run] = await tx<{ id: string; cancelled_at: Date | null }[]>`select id, cancelled_at from payment_runs where id = ${runId} for update`;
    if (!run || run.cancelled_at !== null) throw new AppError("not_found");
    await tx`update payment_runs set cancelled_at = now(), cancelled_by = ${actor!.id} where id = ${runId}`;
    const back = await tx<{ id: string; member_id: string }[]>`
      update expenses set status = 'approved', paid_on = null, paid_marked_by = null, payment_run_id = null
      where payment_run_id = ${runId} and status = 'paid' returning id, member_id`;
    for (const e of back) await tx`insert into history (expense_id, actor, kind) values (${e.id}, ${actor!.id}, 'unpaid')`;
    return [...new Set(back.map(e => e.member_id))];
  });
}

// The batches of the last 90 days, newest first.
export async function runs(sql: Query, actor: Member | null): Promise<Run[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const rows = await sql<RunRow[]>`
    select id, message_id, to_char(execution_date, 'YYYY-MM-DD') as execution_date, count, total_cents, currency, created_at, created_by, cancelled_at, file
    from payment_runs where created_at > now() - interval '90 days' order by created_at desc, id desc limit 50`;
  return rows.map(toRun);
}

// runFile writes the batch's file again, exactly as it was made (the same
// message id: a bank refuses a file it already received). The names are
// the account holder's when given, else the person's in the Chest; the
// remittance text says which expenses, in the company's language (the one
// its bank statements speak: Settings → Company).
export async function runFile(sql: Query, actor: Member | null, runValue: unknown): Promise<{ xml: string; fileName: string }> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const runId = typeof runValue === "string" && /^[1-9][0-9]{0,17}$/u.test(runValue) ? runValue : null;
  if (!runId) throw new AppError("not_found");
  const [row] = await sql<RunRow[]>`
    select id, message_id, to_char(execution_date, 'YYYY-MM-DD') as execution_date, count, total_cents, currency, created_at, created_by, cancelled_at, file
    from payment_runs where id = ${runId}`;
  if (!row || row.cancelled_at !== null) throw new AppError("not_found");
  const file = row.file;
  if (file.transfers.some(t => t.member === "erased" || t.iban === "")) throw new AppError("file_gone");
  const who = await people(file.transfers.map(t => t.member));
  const { bankLocale } = await settings(sql);
  const transfers = file.transfers.map((t, i) => {
    const person = who.get(t.member);
    const refs = t.ids.map(id => "E" + id).join(" ");
    return {
      endToEnd: `${row.message_id}-${i + 1}`,
      amount: t.amount,
      name: t.holder || nameOf(person, bankLocale),
      iban: openIban(t.iban, t.member),
      bic: t.bic,
      address: t.address ?? null,
      text: remittance(bankLocale, refs),
    };
  });
  const xml = pain001({ messageId: row.message_id, createdAt: row.created_at, payer: { name: file.payer.name, iban: openIban(file.payer.iban, "company"), bic: file.payer.bic, address: file.payer.address ?? null }, executionDate: row.execution_date, transfers }, chest.timeZone);
  return { xml, fileName: `${row.message_id}.xml` };
}

// The text on the payee's bank statement ("Notes de frais E6 E7"), in the
// language chosen for the bank (140 characters at most in the file).
export function remittance(locale: Locale, refs: string): string {
  return format(catalogue(locale).pay.remittance, { refs });
}

// An erased person's account leaves the batches too: those files can no
// longer be written again (the bank already has them).
export async function forgetInRuns(sql: Query, member: string): Promise<void> {
  const rows = await sql<{ id: string; file: FileBody }[]>`select id, file from payment_runs where file -> 'transfers' @> ${sql.json([{ member }] as never)}`;
  for (const r of rows) {
    const file = { ...r.file, transfers: r.file.transfers.map(t => (t.member === member ? { ...t, member: "erased", iban: "", holder: "", address: null } : t)) };
    await sql`update payment_runs set file = ${sql.json(file as never)} where id = ${r.id}`;
  }
}
