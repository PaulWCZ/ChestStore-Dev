import type { Member } from "@argentic/chest-sdk/member";
import { can, type Ability } from "./access.ts";
import { AppError } from "./app-error.ts";
import { clientMissing, toClient, type Client } from "./clients.ts";
import { company, missing, type Company } from "./company.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, isLocale, type Locale } from "../i18n/index.ts";
import { addDays, clean, day, documentNumber, id, limits, oneOf, periodOf, vatTreatments, versioned, wholeDays, type DocumentType, type Status, type VatTreatment } from "./model.ts";
import { formatRate, isVatRate } from "./money.ts";
import { buyerOf, sellerOf, type Buyer, type Seller } from "./parties.ts";
import { lineNet, totals, depositBases, type RateTotal, type Totals } from "./totals.ts";

// Quotes, invoices and credit notes: one table, three kinds, and the rules
// that make an invoice a legal record.
//
// - A quote is a draft until it is sent: it then takes the next number of
//   the quotes' sequence ("D-2026-0001"); the client accepts or refuses it;
//   past its validity date, a sent quote is "expired". A sent quote is
//   never changed in place: changing it starts its next version ("v2",
//   lib/versions.ts), a draft again until it is sent — the client's link
//   then shows the new version, and the earlier ones stay readable.
// - An invoice (blank, or made from an accepted quote — in full, or a
//   deposit of a percentage) is a draft anyone selling may prepare. When
//   billing *finalises* it, it takes the next number of the invoices'
//   sequence of the year ("F-2026-0001"), in the same transaction that
//   holds the counter's row lock: numbers follow each other with no gap and
//   in the order of their dates. It is then frozen for good (a trigger in
//   the database refuses any change but its sending, reminders and stored
//   PDF), and never deleted.
// - A credit note ("avoir") is the only correction of a finalised invoice:
//   made from it (its lines, which may be reduced for a partial credit), it
//   has its own sequence ("A-2026-0001"), and is frozen the same way.
//
// Dates of numbering are the Chest's today (chest.today()), given by the
// caller; a document is never back-dated.

export type Line = {
  kind: "line" | "section";
  itemId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  vatRate: number;
  goods: boolean;
  net: number;
  // The deposit invoice this line takes back (the final invoice of a
  // quote), for the accountant's entries.
  depositOf?: string | null;
};

export type Doc = {
  id: string;
  type: DocumentType;
  status: Status;
  number: string | null;
  clientId: string | null;
  title: string;
  language: Locale;
  currency: string;
  issueDate: string | null;
  deliveryDate: string | null;
  validUntil: string | null;
  dueDate: string | null;
  paymentDays: number;
  vatTreatment: VatTreatment;
  franchise: boolean;
  notes: string;
  quoteId: string | null;
  depositPercent: number | null;
  invoiceId: string | null;
  net: number;
  vat: number;
  gross: number;
  rates: RateTotal[];
  seller: Seller | null;
  buyer: Buyer | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  sentAt: string | null;
  sentBy: string | null;
  emailedTo: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  finalisedAt: string | null;
  finalisedBy: string | null;
  remindedAt: string | null;
  reminders: number;
  pdfObject: string | null;
  pdfSha256: string | null;
  // The format of the stored PDF: "factur-x", "pdf" (issued before
  // Factur-X), or null until it is stored.
  pdfFormat: "pdf" | "factur-x" | null;
  deleted: boolean;
  // Made from a deal won in Clients: its title, and when it was reopened.
  crmTitle: string | null;
  crmReopenedAt: string | null;
  // A quote's version: 1, then 2 once it was changed after being sent
  // (lib/versions.ts). Invoices and credit notes stay at 1.
  version: number;
};

// What a document is now, as the lists and the pages say it.
export type State =
  | "draft" | "sent" | "expired" | "accepted" | "refused" // quotes
  | "unpaid" | "partly_paid" | "overdue" | "paid" | "credited" // invoices
  | "final"; // credit notes

type Row = {
  id: number; type: DocumentType; status: Status; number: string | null; client_id: number | null; title: string; language: string; currency: string;
  issue_date: string | null; delivery_date: string | null; valid_until: string | null; due_date: string | null; payment_days: number; vat_treatment: VatTreatment;
  franchise: boolean; notes: string; quote_id: number | null; deposit_percent: number | null; invoice_id: number | null; net: number; vat: number; gross: number;
  rates: RateTotal[]; seller: Seller | null; buyer: Buyer | null; created_by: string; created_at: Date; updated_at: Date; ready_at: Date | null; sent_at: Date | null;
  sent_by: string | null; emailed_to: string | null; decided_at: Date | null; decided_by: string | null; finalised_at: Date | null; finalised_by: string | null;
  reminded_at: Date | null; reminders: number; pdf_object: string | null; pdf_sha256: string | null; pdf_format?: "pdf" | "factur-x" | null; deleted_at: Date | null;
  crm_title: string | null; crm_reopened_at: Date | null; version?: number;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const str = (n: number | null) => (n === null ? null : String(n));

export const toDoc = (r: Row): Doc => ({
  id: String(r.id), type: r.type, status: r.status, number: r.number, clientId: str(r.client_id), title: r.title, language: isLocale(r.language) ? r.language : "en",
  currency: r.currency, issueDate: r.issue_date, deliveryDate: r.delivery_date, validUntil: r.valid_until, dueDate: r.due_date, paymentDays: r.payment_days,
  vatTreatment: r.vat_treatment, franchise: r.franchise, notes: r.notes, quoteId: str(r.quote_id), depositPercent: r.deposit_percent, invoiceId: str(r.invoice_id),
  net: r.net, vat: r.vat, gross: r.gross, rates: r.rates, seller: r.seller, buyer: r.buyer, createdBy: r.created_by, createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(), readyAt: iso(r.ready_at), sentAt: iso(r.sent_at), sentBy: r.sent_by, emailedTo: r.emailed_to, decidedAt: iso(r.decided_at),
  decidedBy: r.decided_by, finalisedAt: iso(r.finalised_at), finalisedBy: r.finalised_by, remindedAt: iso(r.reminded_at), reminders: r.reminders,
  pdfObject: r.pdf_object, pdfSha256: r.pdf_sha256, pdfFormat: r.pdf_format ?? null, deleted: r.deleted_at !== null,
  crmTitle: r.crm_title ?? null, crmReopenedAt: iso(r.crm_reopened_at ?? null), version: r.version ?? 1,
});

type LineRow = { document_id: number; kind: "line" | "section"; item_id: number | null; description: string; quantity: number; unit: string; unit_price: number; discount: number; vat_rate: number; goods: boolean; net: number; deposit_of?: number | null };
const toLine = (r: LineRow): Line => ({ kind: r.kind, itemId: str(r.item_id), description: r.description, quantity: r.quantity, unit: r.unit, unitPrice: r.unit_price, discount: r.discount, vatRate: r.vat_rate, goods: r.goods, net: r.net, depositOf: str(r.deposit_of ?? null) });

// --- States ----------------------------------------------------------------

export function stateOf(d: Pick<Doc, "type" | "status" | "validUntil" | "dueDate" | "gross">, money: { paid: number; credited: number }, today: string): State {
  if (d.type === "quote") {
    if (d.status === "sent" && d.validUntil !== null && d.validUntil < today) return "expired";
    return d.status as State;
  }
  if (d.status === "draft") return "draft";
  if (d.type === "credit") return "final";
  if (money.credited >= d.gross && d.gross > 0) return "credited";
  const due = d.gross - money.credited - money.paid;
  if (due <= 0) return "paid";
  if (d.dueDate !== null && d.dueDate < today) return "overdue";
  return money.paid > 0 ? "partly_paid" : "unpaid";
}

// An invoice whose payments are followed here: issued by this tool, or
// imported from the previous one.
export const collectable = (d: Pick<Doc, "type" | "status">): boolean => d.type === "invoice" && (d.status === "final" || d.status === "imported");

// Whether the document's lines carry VAT: not under the VAT exemption of
// small businesses, not when the buyer accounts for it.
export const noVat = (d: Pick<Doc, "franchise" | "vatTreatment">): boolean => d.franchise || d.vatTreatment === "reverse_charge";

// The kind of operation the reform's new mention names: goods, services, or
// both (from the lines).
export function operationOf(lines: readonly Pick<Line, "kind" | "goods">[]): "goods" | "services" | "mixed" {
  const kinds = new Set(lines.filter(l => l.kind === "line").map(l => l.goods));
  return kinds.size === 2 ? "mixed" : kinds.has(true) ? "goods" : "services";
}

// --- Reading ---------------------------------------------------------------

export type Payment = { id: string; paidOn: string; amount: number; method: string; note: string; createdBy: string; createdAt: string };

export type ListRow = Doc & { clientName: string; paid: number; credited: number; due: number; state: State };

async function money(sql: Query, ids: number[]): Promise<Map<number, { paid: number; credited: number }>> {
  const out = new Map<number, { paid: number; credited: number }>();
  if (ids.length === 0) return out;
  const paid = await sql<{ id: number; paid: number }[]>`select document_id as id, sum(amount)::bigint as paid from payments where document_id = any(${ids}::bigint[]) and deleted_at is null group by document_id`;
  const credited = await sql<{ id: number; credited: number }[]>`select invoice_id as id, sum(gross)::bigint as credited from documents where invoice_id = any(${ids}::bigint[]) and type = 'credit' and status = 'final' group by invoice_id`;
  for (const i of ids) out.set(i, { paid: 0, credited: 0 });
  for (const p of paid) out.get(p.id)!.paid = p.paid;
  for (const c of credited) out.get(c.id)!.credited = c.credited;
  return out;
}

export type ListOptions = { types: DocumentType[]; clientId?: string; q?: string; from?: string; to?: string; limit?: number };

export async function listDocuments(sql: Query, actor: Member | null, options: ListOptions, today: string): Promise<ListRow[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const q = typeof options.q === "string" ? options.q.trim().slice(0, 80) : "";
  const like = "%" + q.replace(/[\\%_]/gu, m => "\\" + m) + "%";
  const rows = await sql<(Row & { client_name: string | null })[]>`
    select d.*, c.name as client_name from documents d left join clients c on c.id = d.client_id
    where d.deleted_at is null and d.type = any(${options.types}::text[])
      ${options.clientId ? sql`and d.client_id = ${id(options.clientId)}` : sql``}
      ${q ? sql`and (d.number ilike ${like} or d.title ilike ${like} or c.name ilike ${like})` : sql``}
      ${options.from ? sql`and d.issue_date >= ${options.from}` : sql``}
      ${options.to ? sql`and d.issue_date <= ${options.to}` : sql``}
    order by (d.status = 'draft') desc, d.issue_date desc nulls first, d.seq desc nulls last, d.id desc
    limit ${Math.min(options.limit ?? 2000, 5000)}`;
  const m = await money(sql, rows.map(r => r.id));
  return rows.map(r => {
    const d = toDoc(r);
    const { paid, credited } = m.get(r.id)!;
    const due = collectable(d) ? Math.max(d.gross - credited - paid, 0) : 0;
    return { ...d, clientName: d.buyer?.name ?? r.client_name ?? "", paid, credited, due, state: stateOf(d, { paid, credited }, today) };
  });
}

export type Related = { id: string; type: DocumentType; number: string | null; status: Status; gross: number; depositPercent: number | null; issueDate: string | null; version: number };

export type Full = Doc & {
  lines: Line[];
  client: Client | null;
  payments: Payment[];
  paid: number;
  credited: number;
  due: number;
  state: State;
  related: Related[];
};

async function loadRow(sql: Query, documentId: string, lock = false): Promise<Row> {
  const [row] = lock
    ? await sql<Row[]>`select * from documents where id = ${documentId} for update`
    : await sql<Row[]>`select * from documents where id = ${documentId}`;
  if (!row) throw new AppError("not_found");
  return row;
}

export async function linesOf(sql: Query, documentId: string): Promise<Line[]> {
  const rows = await sql<LineRow[]>`select * from lines where document_id = ${documentId} order by position`;
  return rows.map(toLine);
}

export async function getDocument(sql: Query, actor: Member | null, documentId: unknown, today: string): Promise<Full> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const docId = id(documentId);
  const row = await loadRow(sql, docId);
  const d = toDoc(row);
  if (d.deleted) throw new AppError("not_found");
  const lines = await linesOf(sql, docId);
  const [clientRow] = d.clientId ? await sql`select * from clients where id = ${d.clientId}` : [];
  const client = clientRow ? toClient(clientRow as Parameters<typeof toClient>[0]) : null;
  const payments = (await sql<{ id: number; paid_on: string; amount: number; method: string; note: string; created_by: string; created_at: Date }[]>`
    select * from payments where document_id = ${docId} and deleted_at is null order by paid_on, id`).map(p => ({ id: String(p.id), paidOn: p.paid_on, amount: p.amount, method: p.method, note: p.note, createdBy: p.created_by, createdAt: p.created_at.toISOString() }));
  const { paid, credited } = (await money(sql, [row.id])).get(row.id)!;
  // The documents it is linked to: a quote's invoices; an invoice's quote,
  // its credit notes and the other invoices of its quote; a credit note's
  // invoice.
  const related = (await sql<Row[]>`
    select * from documents where deleted_at is null and id <> ${docId} and (
      (quote_id = ${docId}) or (invoice_id = ${docId}) or (id = ${d.quoteId ?? 0}) or (id = ${d.invoiceId ?? 0})
      or (${d.quoteId ?? 0}::bigint <> 0 and quote_id = ${d.quoteId ?? 0}))
    order by id`).map(r => ({ id: String(r.id), type: r.type, number: r.number, status: r.status, gross: r.gross, depositPercent: r.deposit_percent, issueDate: r.issue_date, version: r.version ?? 1 }));
  const due = collectable(d) ? d.gross - credited - paid : 0;
  return { ...d, lines, client, payments, paid, credited, due, state: stateOf(d, { paid, credited }, today), related };
}

// --- Rights ----------------------------------------------------------------

// Who may change a document of this kind (drafts, and sent quotes).
export function editAbility(type: DocumentType): Ability {
  return type === "quote" ? "quotes.write" : type === "invoice" ? "invoices.draft" : "invoices.issue";
}

export function editable(d: Pick<Doc, "type" | "status" | "deleted">): boolean {
  if (d.deleted) return false;
  // A sent quote is changed through its next version (lib/versions.ts),
  // never in place: the client holds what was sent.
  return d.status === "draft";
}

// --- Creating --------------------------------------------------------------

export type Defaults = { today: string; locale: Locale; currency: string };

async function clientFor(sql: Query, clientId: unknown): Promise<Client> {
  const [row] = await sql`select * from clients where id = ${id(clientId)}`;
  if (!row) throw new AppError("not_found");
  const client = toClient(row as Parameters<typeof toClient>[0]);
  if (client.archived) throw new AppError("client_archived");
  return client;
}

// createDocument starts a draft quote or invoice, for a client if one is
// named, with the company's defaults.
export async function createDocument(sql: Sql, actor: Member | null, type: unknown, clientId: unknown, defaults: Defaults): Promise<Doc> {
  const kind = oneOf(["quote", "invoice"] as const, type);
  if (!can(actor, editAbility(kind))) throw new AppError("forbidden");
  const c = await company(sql);
  const client = clientId === null || clientId === undefined || clientId === "" ? null : await clientFor(sql, clientId);
  const [row] = await sql<Row[]>`
    insert into documents ${sql({
      type: kind,
      client_id: client ? Number(client.id) : null,
      // The client's language; without a client yet, the author's own, so
      // the paper they write on speaks their language.
      language: client?.language ?? (isLocale(actor!.language) ? actor!.language : defaults.locale),
      currency: defaults.currency,
      valid_until: kind === "quote" ? addDays(defaults.today, c.validityDays) : null,
      payment_days: c.paymentDays,
      vat_treatment: client?.reverseCharge ? "reverse_charge" : "standard",
      franchise: c.franchise,
      created_by: actor!.id,
    })} returning *`;
  return toDoc(row!);
}

async function insertLines(sql: Query, documentId: number | string, lines: readonly Line[]): Promise<void> {
  if (lines.length === 0) return;
  await sql`insert into lines ${sql(lines.map((l, i) => ({
    document_id: Number(documentId), position: i + 1, kind: l.kind, item_id: l.itemId === null ? null : Number(l.itemId), description: l.description,
    quantity: l.quantity, unit: l.unit, unit_price: l.unitPrice, discount: l.discount, vat_rate: l.vatRate, goods: l.goods, net: l.kind === "line" ? lineNet(l) : 0,
    deposit_of: l.depositOf ? Number(l.depositOf) : null,
  })))}`;
}

// duplicate copies a quote or an invoice into a new draft of the same kind
// (a credit note is never copied: it belongs to its invoice).
export async function duplicate(sql: Sql, actor: Member | null, documentId: unknown, defaults: Defaults): Promise<Doc> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const source = toDoc(await loadRow(sql, id(documentId)));
  if (source.deleted) throw new AppError("not_found");
  if (source.type === "credit") throw new AppError("invalid");
  if (!can(actor, editAbility(source.type))) throw new AppError("forbidden");
  const c = await company(sql);
  const lines = await linesOf(sql, source.id);
  const [archived] = source.clientId ? await sql`select 1 from clients where id = ${source.clientId} and archived_at is not null` : [];
  return sql.begin(async tx => {
    const [row] = await tx<Row[]>`
      insert into documents ${tx({
        type: source.type,
        client_id: source.clientId && !archived ? Number(source.clientId) : null,
        title: source.title,
        language: source.language,
        currency: source.currency,
        valid_until: source.type === "quote" ? addDays(defaults.today, c.validityDays) : null,
        payment_days: source.paymentDays,
        vat_treatment: source.vatTreatment,
        franchise: c.franchise,
        notes: source.notes,
        created_by: actor!.id,
      })} returning *`;
    await insertLines(tx, row!.id, lines);
    return recompute(tx, String(row!.id));
  });
}

// recompute stores a draft's totals from its lines (and its lines' amounts).
async function recompute(sql: Query, documentId: string): Promise<Doc> {
  const d = toDoc(await loadRow(sql, documentId));
  const lines = await linesOf(sql, documentId);
  const t = totals(lines, { noVat: noVat(d) });
  const [row] = await sql<Row[]>`
    update documents set net = ${t.net}, vat = ${t.vat}, gross = ${t.gross}, rates = ${sql.json(t.rates as never)}, updated_at = now()
    where id = ${documentId} returning *`;
  return toDoc(row!);
}

// --- Editing a draft -------------------------------------------------------

export type LineInput = Partial<Record<"kind" | "itemId" | "description" | "quantity" | "unit" | "unitPrice" | "discount" | "vatRate" | "goods" | "depositOf", unknown>>;
export type DraftInput = Partial<Record<"clientId" | "title" | "language" | "deliveryDate" | "validUntil" | "paymentDays" | "vatTreatment" | "notes", unknown>> & { lines?: unknown };

const int = (value: unknown, min: number, max: number, code: "quantity_invalid" | "amount_invalid" | "discount_invalid"): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new AppError(code);
  return value;
};

export function checkLines(value: unknown): Line[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  if (value.length > limits.lines) throw new AppError("too_many", { max: limits.lines });
  return value.map((raw: LineInput) => {
    if (!raw || typeof raw !== "object") throw new AppError("invalid");
    const kind = oneOf(["line", "section"] as const, raw.kind ?? "line");
    if (kind === "section") {
      return { kind, itemId: null, description: clean(raw.description ?? "", limits.title, { optional: true }), quantity: 0, unit: "", unitPrice: 0, discount: 0, vatRate: 0, goods: false, net: 0 };
    }
    const vatRate = raw.vatRate ?? 2000;
    if (!isVatRate(vatRate)) throw new AppError("rate_invalid");
    if (raw.goods !== undefined && typeof raw.goods !== "boolean") throw new AppError("invalid");
    const itemId = raw.itemId === null || raw.itemId === undefined || raw.itemId === "" ? null : id(raw.itemId);
    const line: Line = {
      kind,
      itemId,
      description: clean(raw.description ?? "", limits.description, { optional: true, multiline: true }),
      quantity: int(raw.quantity ?? 1000, 0, limits.quantity, "quantity_invalid"),
      unit: clean(raw.unit ?? "", limits.unit, { optional: true }),
      unitPrice: int(raw.unitPrice ?? 0, -limits.unitPrice, limits.unitPrice, "amount_invalid"),
      discount: int(raw.discount ?? 0, 0, 10_000, "discount_invalid"),
      vatRate,
      goods: raw.goods === true,
      net: 0,
      depositOf: raw.depositOf === null || raw.depositOf === undefined || raw.depositOf === "" ? null : id(raw.depositOf),
    };
    line.net = lineNet(line);
    return line;
  });
}

// saveDraft replaces what the editor shows: the header's fields given, and
// all the lines when given. Returns the document with its new totals.
export async function saveDraft(sql: Sql, actor: Member | null, documentId: unknown, input: DraftInput): Promise<Doc> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const docId = id(documentId);
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const lines = input.lines === undefined ? undefined : checkLines(input.lines);
  return sql.begin(async tx => {
    const d = toDoc(await loadRow(tx, docId, true));
    if (d.deleted) throw new AppError("not_found");
    if (!can(actor, editAbility(d.type))) throw new AppError("forbidden");
    if (!editable(d)) throw new AppError(d.type === "quote" ? "wrong_status" : "not_draft");
    const set: Record<string, unknown> = {};
    if (input.clientId !== undefined) {
      if (d.type === "credit") throw new AppError("invalid");
      if (input.clientId === null || input.clientId === "") set["client_id"] = null;
      else {
        const client = await clientFor(tx, input.clientId);
        set["client_id"] = Number(client.id);
        if (String(d.clientId) !== client.id) {
          set["language"] = client.language;
          set["vat_treatment"] = client.reverseCharge ? "reverse_charge" : "standard";
        }
      }
    }
    if (input.title !== undefined) set["title"] = clean(input.title, limits.title, { optional: true });
    if (input.language !== undefined) {
      if (!isLocale(input.language)) throw new AppError("invalid");
      set["language"] = input.language;
    }
    if (input.notes !== undefined) set["notes"] = clean(input.notes, limits.notes, { optional: true, multiline: true });
    if (input.deliveryDate !== undefined) set["delivery_date"] = input.deliveryDate === null || input.deliveryDate === "" ? null : day(input.deliveryDate);
    if (input.validUntil !== undefined && d.type === "quote") set["valid_until"] = day(input.validUntil);
    if (input.paymentDays !== undefined && d.type === "invoice") set["payment_days"] = wholeDays(input.paymentDays, 0, limits.paymentDays, "terms_invalid");
    if (input.vatTreatment !== undefined) {
      if (d.type === "credit") throw new AppError("invalid");
      set["vat_treatment"] = oneOf(vatTreatments, input.vatTreatment);
    }
    // With a client, the reverse charge is the client card's (a tax matter,
    // decided once for the client, not on each paper).
    const clientNow = set["client_id"] === undefined ? d.clientId : set["client_id"] === null ? null : String(set["client_id"]);
    if (clientNow && d.type !== "credit") {
      const [row] = await tx<{ reverse_charge: boolean }[]>`select reverse_charge from clients where id = ${clientNow}`;
      if (row) set["vat_treatment"] = row.reverse_charge ? "reverse_charge" : "standard";
    }
    // A draft follows the company's VAT regime until it is numbered; a
    // credit note keeps its invoice's.
    if (d.type !== "credit") set["franchise"] = (await company(tx)).franchise;
    if (Object.keys(set).length > 0) await tx`update documents set ${tx(set)} where id = ${docId}`;
    if (lines !== undefined) {
      // A line may only take back a deposit invoice of this invoice's own
      // quote; any other mark is dropped.
      const marked = [...new Set(lines.map(l => l.depositOf).filter((x): x is string => !!x))];
      const deposits = marked.length === 0 || d.type !== "invoice" || !d.quoteId ? new Set<string>()
        : new Set((await tx<{ id: number }[]>`select id from documents where id = any(${marked.map(Number)}::bigint[]) and type = 'invoice' and quote_id = ${d.quoteId} and deposit_percent is not null`).map(r => String(r.id)));
      for (const l of lines) if (l.depositOf && !deposits.has(l.depositOf)) l.depositOf = null;
      await tx`delete from lines where document_id = ${docId}`;
      await insertLines(tx, docId, lines);
    }
    const saved = await recompute(tx, docId);
    if (Math.abs(saved.gross) > limits.total || Math.abs(saved.net) > limits.total) throw new AppError("total_too_large");
    return saved;
  });
}

// removeDraft deletes a draft (undone by restoreDraft); drafts deleted more
// than 30 days ago go for good. A numbered document is never deleted.
export async function removeDraft(sql: Sql, actor: Member | null, documentId: unknown): Promise<Doc> {
  const docId = id(documentId);
  const d = toDoc(await loadRow(sql, docId));
  if (d.deleted || !can(actor, "read")) throw new AppError("not_found");
  if (!can(actor, editAbility(d.type))) throw new AppError("forbidden");
  if (d.status !== "draft") throw new AppError("not_draft");
  // The next version of a sent quote is discarded (lib/versions.ts), never
  // deleted: the quote was sent under its number.
  if (d.version > 1) throw new AppError("wrong_status");
  await sql`update documents set deleted_at = now(), updated_at = now() where id = ${docId} and status = 'draft'`;
  await sql`delete from documents where deleted_at < now() - interval '30 days' and status = 'draft' and not exists (select 1 from documents x where x.quote_id = documents.id or x.invoice_id = documents.id)`;
  return d;
}

export async function restoreDraft(sql: Sql, actor: Member | null, documentId: unknown): Promise<void> {
  const docId = id(documentId);
  const d = toDoc(await loadRow(sql, docId));
  if (!can(actor, editAbility(d.type))) throw new AppError("forbidden");
  await sql`update documents set deleted_at = null, updated_at = now() where id = ${docId} and status = 'draft'`;
}

// --- Numbering -------------------------------------------------------------

// nextNumber gives the next number of a sequence, inside the caller's
// transaction: the counter's row stays locked until it commits, so two
// numberings wait for each other, and a transaction that fails gives its
// number back. No gap, no duplicate. The period is the year, or 0 for
// numbers that never restart (company.number_format).
export async function nextNumber(tx: Query, type: DocumentType, period: number, prefixText: string): Promise<{ seq: number; number: string }> {
  await tx`insert into counters (type, year, last) values (${type}, ${period}, 0) on conflict (type, year) do nothing`;
  const [row] = await tx<{ last: number }[]>`update counters set last = last + 1 where type = ${type} and year = ${period} returning last`;
  const seq = row!.last;
  return { seq, number: documentNumber(prefixText, period, seq) };
}

export const prefixOf = (c: Pick<Company, "quotePrefix" | "invoicePrefix" | "creditPrefix">, type: DocumentType): string =>
  type === "quote" ? c.quotePrefix : type === "invoice" ? c.invoicePrefix : c.creditPrefix;

// The number a document would take if numbered now: shown in the message
// the send dialog prepares (sendDocument puts the true one if another
// document took it meanwhile).
export async function upcomingNumber(sql: Query, type: DocumentType, today: string): Promise<string> {
  const c = await company(sql);
  const period = periodOf(c.numberFormat, today);
  const [row] = await sql<{ last: number }[]>`select last from counters where type = ${type} and year = ${period}`;
  return documentNumber(prefixOf(c, type), period, (row?.last ?? 0) + 1);
}

// What a document must hold before it is numbered. Under reverse charge
// the buyer is identified by its VAT number (or, in France, its SIREN):
// the law prints it, and the structured invoice cannot go without it
// (EN 16931, BR-AE-02).
function ready(c: Company, client: Client | null, lines: readonly Line[], vatTreatment: VatTreatment = "standard"): void {
  const gaps = missing(c);
  if (gaps.length > 0) throw new AppError("company_incomplete", { fields: gaps.join(",") });
  if (!client) throw new AppError("no_client");
  const clientGaps = clientMissing(client);
  if (vatTreatment === "reverse_charge" && !c.franchise && !client.vatNumber && !client.siren) clientGaps.push("vatNumber");
  if (clientGaps.length > 0) throw new AppError("client_incomplete", { fields: clientGaps.join(",") });
  const items = lines.filter(l => l.kind === "line");
  if (items.length === 0) throw new AppError("no_lines");
  const empty = lines.findIndex(l => l.kind === "line" && l.description === "");
  if (empty >= 0) throw new AppError("line_empty", { line: empty + 1 });
}

// --- Quotes ------------------------------------------------------------------

// sendQuote marks a quote sent (numbering a draft), by email to an address
// or by the member's own means (null). A quote past its validity date gets
// a new one from today.
export async function sendQuote(sql: Sql, actor: Member | null, documentId: unknown, emailedTo: string | null, today: string): Promise<Doc> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const docId = id(documentId);
  return sql.begin(async tx => {
    const d = toDoc(await loadRow(tx, docId, true));
    if (d.deleted || d.type !== "quote") throw new AppError("not_found");
    if (d.status === "refused") throw new AppError("wrong_status");
    const c = await company(tx);
    const client = d.clientId ? await clientFor(tx, d.clientId).catch(e => { if (e instanceof AppError && e.code === "client_archived") return null; throw e; }) : null;
    const lines = await linesOf(tx, docId);
    ready(c, client, lines, d.vatTreatment);
    const set: Record<string, unknown> = { seller: tx.json(sellerOf(c) as never), buyer: tx.json(buyerOf(client!) as never), franchise: c.franchise, sent_at: new Date(), sent_by: actor!.id, emailed_to: emailedTo };
    if (d.status === "draft" && d.number !== null) Object.assign(set, { status: "sent", issue_date: today });
    else if (d.status === "draft") {
      const year = periodOf(c.numberFormat, today);
      const { seq, number } = await nextNumber(tx, "quote", year, c.quotePrefix);
      Object.assign(set, { status: "sent", number, seq, year, issue_date: today });
    }
    if (d.validUntil === null || d.validUntil < today) set["valid_until"] = addDays(today, c.validityDays);
    await tx`update documents set ${tx(set)}, updated_at = now() where id = ${docId}`;
    return recompute(tx, docId);
  });
}

// decideQuote records the client's answer — "accepted" or "refused" — or
// takes it back ("sent"): a quote already invoiced stays accepted.
export async function decideQuote(sql: Sql, actor: Member | null, documentId: unknown, decision: unknown): Promise<Doc> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const docId = id(documentId);
  const next = oneOf(["accepted", "refused", "sent"] as const, decision);
  return sql.begin(async tx => {
    const d = toDoc(await loadRow(tx, docId, true));
    if (d.deleted || d.type !== "quote") throw new AppError("not_found");
    if (d.status === "draft") throw new AppError("wrong_status");
    if (next !== "sent" && d.status !== "sent") throw new AppError("wrong_status");
    if (next === "sent") {
      if (d.status === "sent") throw new AppError("wrong_status");
      const [invoiced] = await tx`select 1 from documents where quote_id = ${docId} and deleted_at is null limit 1`;
      if (invoiced) throw new AppError("wrong_status");
    }
    const [row] = await tx<Row[]>`
      update documents set status = ${next}, decided_at = ${next === "sent" ? null : new Date()}, decided_by = ${next === "sent" ? null : actor!.id}, updated_at = now()
      where id = ${docId} returning *`;
    return toDoc(row!);
  });
}

// --- Invoices from quotes -------------------------------------------------------

// invoiceFromQuote prepares an invoice draft from an accepted quote: a
// deposit ("acompte") of a percentage (hundredths of a percent) — one line
// per VAT rate, each its share of the quote's base at that rate —, or the
// whole quote, less the deposits already invoiced (and not credited).
export async function invoiceFromQuote(sql: Sql, actor: Member | null, quoteId: unknown, deposit: unknown): Promise<Doc> {
  if (!can(actor, "invoices.draft")) throw new AppError("forbidden");
  const qid = id(quoteId);
  const percent = deposit === null || deposit === undefined ? null : deposit;
  if (percent !== null && (typeof percent !== "number" || !Number.isInteger(percent) || percent < 1 || percent > 9_999)) throw new AppError("deposit_invalid");
  return sql.begin(async tx => {
    const quote = toDoc(await loadRow(tx, qid, true));
    if (quote.deleted || quote.type !== "quote") throw new AppError("not_found");
    if (quote.status !== "accepted") throw new AppError("wrong_status");
    const client = quote.clientId ? await clientFor(tx, quote.clientId) : null;
    if (!client) throw new AppError("no_client");
    const c = await company(tx);
    const quoteLines = await linesOf(tx, qid);
    const quoteTotals = totals(quoteLines, { noVat: noVat(quote) });
    const invoices = await tx<{ id: number; number: string | null; status: Status; deposit_percent: number | null; gross: number }[]>`
      select id, number, status, deposit_percent, gross from documents where quote_id = ${qid} and type = 'invoice' and deleted_at is null order by id`;
    const credits = await tx<{ invoice_id: number; gross: number }[]>`
      select invoice_id, sum(gross)::bigint as gross from documents where type = 'credit' and status = 'final' and invoice_id = any(${invoices.map(i => i.id)}::bigint[]) group by invoice_id`;
    const creditedGross = new Map(credits.map(x => [x.invoice_id, x.gross]));
    const t = catalogue(quote.language).lines;
    let lines: Line[];
    if (percent !== null) {
      const alreadyFull = invoices.some(i => i.deposit_percent === null);
      const used = invoices.filter(i => i.deposit_percent !== null).reduce((s, i) => s + (i.deposit_percent ?? 0), 0);
      if (alreadyFull) throw new AppError("nothing_left");
      if (used + percent > 10_000) throw new AppError("deposit_invalid", { left: 10_000 - used });
      const bases = depositBases(quoteTotals, percent);
      const multi = bases.length > 1;
      lines = bases.map(b => ({
        kind: "line" as const, itemId: null,
        description: format(multi ? t.depositOfRate : t.deposit, { percent: formatRate(percent, quote.language), number: versioned(quote.number, quote.version) ?? "", rate: formatRate(b.rate, quote.language) }),
        quantity: 1000, unit: "", unitPrice: b.base, discount: 0, vatRate: isVatRate(b.rate) ? b.rate : 0, goods: false, net: b.base,
      }));
      if (lines.length === 0) throw new AppError("nothing_left");
    } else {
      // A whole invoice already made (and not cancelled by a credit note).
      if (invoices.some(i => i.deposit_percent === null && !(i.status === "final" && (creditedGross.get(i.id) ?? 0) >= i.gross))) throw new AppError("nothing_left");
      lines = quoteLines.map(l => ({ ...l }));
      // The deposits already invoiced (finalised), less what was credited.
      for (const inv of invoices.filter(i => i.deposit_percent !== null && i.status === "final")) {
        const invLines = await linesOf(tx, String(inv.id));
        const invDoc = toDoc(await loadRow(tx, String(inv.id)));
        const byRate = new Map(totals(invLines, { noVat: noVat(invDoc) }).rates.map(r => [r.rate, r.base]));
        const creditRows = await tx<{ id: number }[]>`select id from documents where type = 'credit' and status = 'final' and invoice_id = ${inv.id}`;
        for (const cr of creditRows) {
          const crDoc = toDoc(await loadRow(tx, String(cr.id)));
          for (const r of totals(await linesOf(tx, String(cr.id)), { noVat: noVat(crDoc) }).rates) byRate.set(r.rate, (byRate.get(r.rate) ?? 0) - r.base);
        }
        const multi = [...byRate.values()].filter(v => v !== 0).length > 1;
        for (const [rate, base] of byRate) {
          if (base === 0) continue;
          lines.push({
            kind: "line", itemId: null,
            description: format(multi ? t.deductionOfRate : t.deduction, { number: inv.number ?? "", rate: formatRate(rate, quote.language) }),
            quantity: 1000, unit: "", unitPrice: -base, discount: 0, vatRate: isVatRate(rate) ? rate : 0, goods: false, net: -base, depositOf: String(inv.id),
          });
        }
      }
    }
    const [row] = await tx<Row[]>`
      insert into documents ${tx({
        type: "invoice",
        client_id: Number(client.id),
        title: quote.title,
        language: quote.language,
        currency: quote.currency,
        payment_days: c.paymentDays,
        vat_treatment: quote.vatTreatment,
        franchise: c.franchise,
        quote_id: Number(qid),
        deposit_percent: percent,
        delivery_date: null,
        created_by: actor!.id,
      })} returning *`;
    await insertLines(tx, row!.id, lines);
    return recompute(tx, String(row!.id));
  });
}

// --- Finalising --------------------------------------------------------------

// markReady hands an invoice draft to billing (who hear of it in the bell).
export async function markReady(sql: Sql, actor: Member | null, documentId: unknown): Promise<Doc> {
  if (!can(actor, "invoices.draft")) throw new AppError("forbidden");
  const docId = id(documentId);
  const [row] = await sql<Row[]>`update documents set ready_at = now(), updated_at = now() where id = ${docId} and type = 'invoice' and status = 'draft' and deleted_at is null returning *`;
  if (!row) throw new AppError("not_draft");
  return toDoc(row);
}

// finalise numbers an invoice or a credit note and freezes it, in one
// transaction: the document's row is locked (a second finalisation of the
// same draft waits, then finds it final), then the counter's.
export async function finalise(sql: Sql, actor: Member | null, documentId: unknown, today: string): Promise<Doc> {
  if (!can(actor, "invoices.issue")) throw new AppError("forbidden");
  const docId = id(documentId);
  day(today);
  return sql.begin(async tx => {
    const d = toDoc(await loadRow(tx, docId, true));
    if (d.deleted || d.type === "quote") throw new AppError("not_found");
    if (d.status !== "draft") throw new AppError("not_draft");
    const c = await company(tx);
    const [clientRow] = d.clientId ? await tx`select * from clients where id = ${d.clientId}` : [];
    const client = clientRow ? toClient(clientRow as Parameters<typeof toClient>[0]) : null;
    const lines = await linesOf(tx, docId);
    ready(c, client, lines, d.vatTreatment);
    const franchise = d.type === "credit" ? d.franchise : c.franchise;
    const t = totals(lines, { noVat: franchise || d.vatTreatment === "reverse_charge" });
    if (d.type === "invoice" && t.gross < 0) throw new AppError("negative_total");
    if (d.type === "credit") {
      if (t.gross <= 0) throw new AppError("negative_total");
      const invoice = d.invoiceId ? toDoc(await loadRow(tx, d.invoiceId, true)) : null;
      if (!invoice || invoice.status !== "final") throw new AppError("not_final");
      const [done] = await tx<{ gross: number }[]>`select coalesce(sum(gross), 0)::bigint as gross from documents where type = 'credit' and status = 'final' and invoice_id = ${invoice.id}`;
      const left = invoice.gross - (done?.gross ?? 0);
      if (t.gross > left) throw new AppError("credit_too_large", { left });
    }
    // Numbers follow the dates: never a date before the last one issued.
    const [last] = await tx<{ day: string | null }[]>`select max(issue_date) as day from documents where type = ${d.type} and status = 'final'`;
    if (last?.day && last.day > today) throw new AppError("date_invalid");
    const year = periodOf(c.numberFormat, today);
    const { seq, number } = await nextNumber(tx, d.type, year, prefixOf(c, d.type));
    for (const [i, l] of lines.entries()) await tx`update lines set net = ${l.kind === "line" ? lineNet(l) : 0} where document_id = ${docId} and position = ${i + 1}`;
    const [row] = await tx<Row[]>`
      update documents set ${tx({
        status: "final", number, seq, year, issue_date: today,
        due_date: d.type === "invoice" ? addDays(today, d.paymentDays) : null,
        seller: tx.json(sellerOf(c) as never), buyer: tx.json(buyerOf(client!) as never), franchise,
        net: t.net, vat: t.vat, gross: t.gross, rates: tx.json(t.rates as never),
        finalised_at: new Date(), finalised_by: actor!.id,
      })}, updated_at = now()
      where id = ${docId} returning *`;
    return toDoc(row!);
  });
}

// startCreditNote prepares the credit note of a finalised invoice: its
// lines, to reduce for a partial credit. Its client, language, currency and
// VAT treatment are the invoice's.
export async function startCreditNote(sql: Sql, actor: Member | null, invoiceId: unknown): Promise<Doc> {
  if (!can(actor, "invoices.issue")) throw new AppError("forbidden");
  const iid = id(invoiceId);
  return sql.begin(async tx => {
    const invoice = toDoc(await loadRow(tx, iid, true));
    if (invoice.deleted || invoice.type !== "invoice") throw new AppError("not_found");
    if (invoice.status !== "final") throw new AppError("not_final");
    const [done] = await tx<{ gross: number }[]>`select coalesce(sum(gross), 0)::bigint as gross from documents where type = 'credit' and status = 'final' and invoice_id = ${iid}`;
    if (invoice.gross - (done?.gross ?? 0) <= 0) throw new AppError("nothing_left");
    const [row] = await tx<Row[]>`
      insert into documents ${tx({
        type: "credit", client_id: invoice.clientId === null ? null : Number(invoice.clientId), title: invoice.title, language: invoice.language, currency: invoice.currency,
        payment_days: 0, vat_treatment: invoice.vatTreatment, franchise: invoice.franchise, invoice_id: Number(iid), created_by: actor!.id,
      })} returning *`;
    await insertLines(tx, row!.id, await linesOf(tx, iid));
    return recompute(tx, String(row!.id));
  });
}

// recordSent notes that a numbered document went to the client: by email
// (the address) or by the member's own means (null).
export async function recordSent(sql: Query, actor: Member | null, documentId: unknown, emailedTo: string | null): Promise<void> {
  if (!can(actor, "invoices.issue")) throw new AppError("forbidden");
  const rows = await sql`update documents set sent_at = now(), sent_by = ${actor!.id}, emailed_to = ${emailedTo}, updated_at = now() where id = ${id(documentId)} and type <> 'quote' and status = 'final' returning id`;
  if (rows.length === 0) throw new AppError("not_final");
}

export async function recordReminder(sql: Query, actor: Member | null, documentId: unknown, emailedTo: string | null): Promise<void> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  const rows = await sql`update documents set reminded_at = now(), reminders = reminders + 1, emailed_to = coalesce(${emailedTo}, emailed_to), updated_at = now() where id = ${id(documentId)} and type = 'invoice' and status in ('final', 'imported') returning id`;
  if (rows.length === 0) throw new AppError("not_final");
}

// --- The collection -------------------------------------------------------------

// receivables: the finalised invoices not paid in full, the oldest due first.
export async function receivables(sql: Query, actor: Member | null, today: string): Promise<ListRow[]> {
  const rows = await listDocuments(sql, actor, { types: ["invoice"] }, today);
  return rows.filter(r => collectable(r) && r.due > 0 && r.state !== "credited").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || Number(a.id) - Number(b.id));
}

// Invoices past their due date and not paid in full.
export async function overdueCount(sql: Query, today: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from documents d
    where d.type = 'invoice' and d.status in ('final', 'imported') and d.due_date < ${today} and d.deleted_at is null
      and d.gross > coalesce((select sum(amount) from payments p where p.document_id = d.id and p.deleted_at is null), 0)
                  + coalesce((select sum(gross) from documents x where x.invoice_id = d.id and x.type = 'credit' and x.status = 'final'), 0)`;
  return row?.n ?? 0;
}

// The count billing sees on the tool's tile: drafts handed to them, and
// invoices overdue.
export async function issuerCount(sql: Query, today: string): Promise<number> {
  const [readyCount] = await sql<{ n: number }[]>`select count(*)::int as n from documents where type = 'invoice' and status = 'draft' and ready_at is not null and deleted_at is null`;
  return (readyCount?.n ?? 0) + (await overdueCount(sql, today));
}

export type { Totals };
