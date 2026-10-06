import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { clean, day, id, limits, oneOf, paymentMethods } from "./model.ts";
import { parseAmount } from "./money.ts";

// Payments received for finalised invoices: a date, an amount, a method.
// Several make a partial payment; an invoice is paid once they (and its
// credit notes) cover its total. A payment typed by mistake is deleted, and
// the deletion undone. This is a record of what the company received from
// companies — not a cash register (see README: invoices to individuals).

export type PaymentInput = Partial<Record<"paidOn" | "amount" | "method" | "note", unknown>>;

export async function addPayment(sql: Sql, actor: Member | null, invoiceId: unknown, input: PaymentInput, today: string): Promise<{ id: string; due: number }> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  const docId = id(invoiceId);
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const paidOn = day(input.paidOn);
  if (paidOn > today) throw new AppError("date_invalid");
  const method = oneOf(paymentMethods, input.method);
  const note = clean(input.note ?? "", 200, { optional: true });
  return sql.begin(async tx => {
    const [doc] = await tx<{ id: number; type: string; status: string; gross: number; currency: string; deleted_at: Date | null }[]>`
      select id, type, status, gross, currency, deleted_at from documents where id = ${docId} for update`;
    if (!doc || doc.deleted_at || doc.type !== "invoice") throw new AppError("not_found");
    // Issued here, or imported from the previous tool.
    if (doc.status !== "final" && doc.status !== "imported") throw new AppError("not_final");
    const amount = parseAmount(input.amount, doc.currency);
    if (amount === null || amount <= 0 || amount > limits.total) throw new AppError("payment_invalid");
    const [sums] = await tx<{ paid: number; credited: number }[]>`
      select coalesce((select sum(amount) from payments where document_id = ${docId} and deleted_at is null), 0)::bigint as paid,
             coalesce((select sum(gross) from documents where invoice_id = ${docId} and type = 'credit' and status = 'final'), 0)::bigint as credited`;
    const due = doc.gross - (sums?.paid ?? 0) - (sums?.credited ?? 0);
    if (due <= 0) throw new AppError("nothing_due");
    if (amount > due) throw new AppError("payment_too_large", { due });
    const [row] = await tx<{ id: number }[]>`
      insert into payments (document_id, paid_on, amount, method, note, created_by) values (${docId}, ${paidOn}, ${amount}, ${method}, ${note}, ${actor!.id}) returning id`;
    return { id: String(row!.id), due: due - amount };
  });
}

// removePayment deletes a payment typed by mistake; restorePayment undoes it.
export async function removePayment(sql: Sql, actor: Member | null, paymentId: unknown): Promise<{ documentId: string }> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  const [row] = await sql<{ document_id: number }[]>`update payments set deleted_at = now() where id = ${id(paymentId)} and deleted_at is null returning document_id`;
  if (!row) throw new AppError("not_found");
  return { documentId: String(row.document_id) };
}

export async function restorePayment(sql: Sql, actor: Member | null, paymentId: unknown): Promise<void> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  const pid = id(paymentId);
  await sql.begin(async tx => {
    const [p] = await tx<{ document_id: number; amount: number }[]>`select document_id, amount from payments where id = ${pid} and deleted_at is not null`;
    if (!p) throw new AppError("not_found");
    const [doc] = await tx<{ gross: number }[]>`select gross from documents where id = ${p.document_id} for update`;
    const [sums] = await tx<{ paid: number; credited: number }[]>`
      select coalesce((select sum(amount) from payments where document_id = ${p.document_id} and deleted_at is null), 0)::bigint as paid,
             coalesce((select sum(gross) from documents where invoice_id = ${p.document_id} and type = 'credit' and status = 'final'), 0)::bigint as credited`;
    // A line of a bank statement recorded again meanwhile (lib/bank.ts).
    const [taken] = await tx`select 1 from payments x where x.bank_line = (select bank_line from payments where id = ${pid}) and x.deleted_at is null`;
    if (taken) throw new AppError("bank_line_used");
    if (p.amount > (doc?.gross ?? 0) - (sums?.paid ?? 0) - (sums?.credited ?? 0)) throw new AppError("payment_too_large");
    await tx`update payments set deleted_at = null where id = ${pid}`;
  });
}
