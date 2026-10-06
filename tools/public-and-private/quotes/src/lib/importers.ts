import { randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { fold } from "../shared/fold.ts";
import { accountCode, addDays, clean, country as checkCountry, email as checkEmail, limits, siren as checkSiren, siret as checkSiret, vatNumber as checkVat } from "../shared/model.ts";
import { buyerOf } from "../shared/parties.ts";
import type { DecimalMark } from "../shared/money.ts";
import { amountMarkOf, checkMapping, clientKindOf, countryOf, dateOf, goodsOf, isImportKind, languageOf, mapRow, mappingReady, priceOf, readTable, vatRateOf, type ImportKind, type Mapped } from "../shared/parse-import.ts";
import { toClient } from "./clients.ts";
import { roundDiv } from "../shared/totals.ts";

// Bringing the clients and the catalogue from the previous tool, so
// switching costs an afternoon, not a week of typing: a spreadsheet (CSV)
// with its columns matched on the page. The file is read again here — the
// page's reading is never trusted —, every value checked as if typed by
// hand (SIREN and VAT keys, email, country, price, French VAT rate); a row
// that cannot come is left out and said (its line and why). What is here
// already is not doubled: a client with the same SIREN (or, without one,
// the same name), an item of the same name.

// For invoices: how many clients were added for them, how many rows were
// left out because already paid in full, and the import's reference (to
// undo it).
export type ImportReport = { created: number; duplicates: number; skipped: { line: number; error: string; values?: Record<string, number | string> }[]; clients?: number; paid?: number; batch?: string };

type Context = { tx: Query; actor: Member; currency: string; mark: DecimalMark | null; defaultLanguage: "en" | "fr"; today: string; names: Set<string>; sirens: Set<string>; count: number;
  // Invoices: the numbers already imported, the clients by SIREN and name,
  // the payment terms, this import's reference.
  numbers: Set<string>; clientBySiren: Map<string, number>; clientByName: Map<string, number>; paymentDays: number; batch: string; clientsAdded: number };

const frenchSpeaking = new Set(["FR", "BE", "CH", "LU", "MC"]);

async function importClient(ctx: Context, m: Mapped): Promise<"created" | "duplicate"> {
  const person = [m.firstName, m.lastName].filter(Boolean).join(" ");
  const kind = clientKindOf(m.kind) ?? (!m.name && person ? "person" : "company");
  const name = clean(m.name ?? person, limits.name);
  // A SIRET gives the SIREN it starts with.
  const siretDigits = m.siret ? checkSiret(m.siret) : "";
  const sirenDigits = m.siren ? checkSiren(m.siren) : siretDigits.slice(0, 9);
  if (sirenDigits ? ctx.sirens.has(sirenDigits) : ctx.names.has(fold(name))) return "duplicate";
  if (ctx.count >= limits.clients) throw new AppError("too_many", { max: limits.clients });
  const countryCode = m.country ? countryOf(m.country) ?? checkCountry(m.country) : "FR";
  const address = [m.address, m.address2].filter(Boolean).join("\n");
  // A company's contact: the contact column, with the first name when the
  // sheet splits it ("Prénom du contact", "Nom du contact").
  const contact = kind === "person" ? m.contact ?? ""
    : m.contact ? (m.firstName && !m.contact.startsWith(m.firstName) ? `${m.firstName} ${m.contact}` : m.contact)
    : m.name && person ? person : "";
  const [row] = await ctx.tx<{ id: number }[]>`
    insert into clients ${ctx.tx({
      kind,
      name,
      contact: clean(contact, limits.contact, { optional: true }),
      email: checkEmail((m.email ?? "").split(/[;,\s]+/u)[0] ?? ""),
      phone: clean(m.phone ?? "", limits.phone, { optional: true }),
      address: clean(address, limits.address, { optional: true, multiline: true }),
      postcode: clean(m.postcode ?? "", limits.postcode, { optional: true }),
      city: clean(m.city ?? "", limits.city, { optional: true }),
      country: checkCountry(countryCode),
      delivery_address: clean(m.deliveryAddress ?? "", limits.address, { optional: true, multiline: true }),
      siren: sirenDigits,
      vat_number: checkVat(m.vatNumber ?? ""),
      language: languageOf(m.language) ?? (m.country ? (frenchSpeaking.has(countryCode) ? "fr" : "en") : ctx.defaultLanguage),
      account: accountCode(m.account),
      notes: clean(m.notes ?? "", limits.notes, { optional: true, multiline: true }),
      created_by: ctx.actor.id,
    })} returning id`;
  ctx.names.add(fold(name));
  if (sirenDigits) ctx.sirens.add(sirenDigits);
  ctx.count++;
  return row ? "created" : "duplicate";
}

async function importItem(ctx: Context, m: Mapped): Promise<"created" | "duplicate"> {
  const name = clean(m.name, limits.name);
  if (ctx.names.has(fold(name))) return "duplicate";
  if (ctx.count >= limits.items) throw new AppError("too_many", { max: limits.items });
  const rate = m.vatRate === undefined ? 2000 : vatRateOf(m.vatRate);
  if (rate === null) throw new AppError("rate_invalid");
  let price = m.unitPrice === undefined ? null : priceOf(m.unitPrice, ctx.currency, ctx.mark);
  if (m.unitPrice !== undefined && price === null) throw new AppError("amount_invalid");
  if (price === null && m.priceInclVat !== undefined) {
    const gross = priceOf(m.priceInclVat, ctx.currency, ctx.mark);
    if (gross === null) throw new AppError("amount_invalid");
    // Excluding VAT from a price including it: rounded once, to the cent.
    price = Number(roundDiv(BigInt(gross) * 10_000n, BigInt(10_000 + rate)));
  }
  if (price !== null && Math.abs(price) > limits.unitPrice) throw new AppError("amount_invalid");
  await ctx.tx`
    insert into items ${ctx.tx({
      name,
      description: clean(m.description ?? "", limits.description, { optional: true, multiline: true }),
      unit: clean(m.unit ?? "", limits.unit, { optional: true }),
      unit_price: price ?? 0,
      vat_rate: rate,
      goods: goodsOf(m.kind) ?? false,
      created_by: ctx.actor.id,
    })}`;
  ctx.names.add(fold(name));
  ctx.count++;
  return "created";
}

// An invoice the previous tool issued, still to collect: kept with its own
// number (the imported series — never renumbered, outside this tool's
// gap-free sequences), its dates, its client (found by SIREN, else by name,
// else added), its total and what was paid before. Its PDF stays in the
// previous tool; here it is only collected (payments, reminders). A row
// already paid in full is left out.
const numberText = /^[\p{L}\p{N}][\p{L}\p{N} ._/#-]{0,39}$/u;
async function importInvoice(ctx: Context, m: Mapped): Promise<"created" | "duplicate" | "paid"> {
  const number = clean(m.number, 40);
  if (!numberText.test(number)) throw new AppError("import_number_invalid");
  if (ctx.numbers.has(number.toLowerCase())) return "duplicate";
  const issueDate = dateOf(m.issueDate);
  if (!issueDate || issueDate > ctx.today) throw new AppError("date_invalid");
  const dueDate = m.dueDate === undefined ? addDays(issueDate, ctx.paymentDays) : dateOf(m.dueDate);
  if (!dueDate || dueDate < issueDate) throw new AppError("date_invalid");
  const gross = priceOf(m.gross, ctx.currency, ctx.mark);
  if (gross === null || gross <= 0 || gross > limits.total) throw new AppError("amount_invalid");
  const net = m.net === undefined ? gross : priceOf(m.net, ctx.currency, ctx.mark);
  if (net === null || net < 0 || net > gross) throw new AppError("amount_invalid");
  let paid = 0;
  if (m.paid !== undefined) {
    const value = priceOf(m.paid, ctx.currency, ctx.mark);
    if (value === null || value < 0) throw new AppError("amount_invalid");
    paid = value;
  } else if (m.left !== undefined) {
    const value = priceOf(m.left, ctx.currency, ctx.mark);
    if (value === null || value < 0 || value > gross) throw new AppError("amount_invalid");
    paid = gross - value;
  }
  if (paid >= gross) return "paid";
  // The client: by SIREN, else by name, else added (a company; its card is
  // completed later, before any document of this tool is sent to it).
  const siren = m.siren ? checkSiren(m.siren) : "";
  const name = clean(m.client, limits.name);
  let clientId = (siren ? ctx.clientBySiren.get(siren) : undefined) ?? ctx.clientByName.get(fold(name));
  if (clientId === undefined) {
    if (ctx.count >= limits.clients) throw new AppError("too_many", { max: limits.clients });
    const [row] = await ctx.tx<{ id: number }[]>`
      insert into clients ${ctx.tx({ kind: "company", name, siren, email: checkEmail((m.email ?? "").split(/[;,\s]+/u)[0] ?? ""), language: ctx.defaultLanguage, created_by: ctx.actor.id })} returning id`;
    clientId = row!.id;
    ctx.clientByName.set(fold(name), clientId);
    if (siren) ctx.clientBySiren.set(siren, clientId);
    ctx.count++;
    ctx.clientsAdded++;
  }
  const [clientRow] = await ctx.tx`select * from clients where id = ${clientId}`;
  const client = toClient(clientRow as Parameters<typeof toClient>[0]);
  const [doc] = await ctx.tx<{ id: number }[]>`
    insert into documents ${ctx.tx({
      type: "invoice", status: "imported", number, client_id: clientId,
      title: clean(m.title ?? "", limits.title, { optional: true }),
      language: client.language, currency: ctx.currency,
      issue_date: issueDate, due_date: dueDate, payment_days: Math.min(Math.max(Math.round((Date.parse(dueDate) - Date.parse(issueDate)) / 86_400_000), 0), 3650),
      net, vat: gross - net, gross, buyer: ctx.tx.json(buyerOf(client) as never),
      created_by: ctx.actor.id, import_batch: ctx.batch,
    })} returning id`;
  // What was paid before the switch, as one payment of the import's day.
  if (paid > 0) await ctx.tx`insert into payments (document_id, paid_on, amount, method, note, created_by) values (${doc!.id}, ${ctx.today}, ${paid}, 'imported', '', ${ctx.actor.id})`;
  ctx.numbers.add(number.toLowerCase());
  return "created";
}

// importTable brings the rows of a file into the clients or the catalogue.
// Each row in its own savepoint: a refused row leaves the others.
export async function importTable(sql: Sql, actor: Member | null, kind: unknown, text: unknown, mapping: unknown, options: { currency: string; defaultLanguage: "en" | "fr"; today: string }): Promise<ImportReport> {
  if (!isImportKind(kind)) throw new AppError("import_invalid");
  if (!can(actor, importAbility[kind])) throw new AppError("forbidden");
  if (typeof text !== "string") throw new AppError("import_invalid");
  const table = readTable(text);
  const map = checkMapping(kind, table.head, mapping);
  if (!mappingReady(kind, map)) throw new AppError("import_invalid");
  return sql.begin(async tx => {
    const ctx = await context(tx, actor!, kind, options);
    ctx.mark = amountMarkOf(table, map);
    const report: ImportReport = { created: 0, duplicates: 0, skipped: [], ...(kind === "invoices" ? { clients: 0, paid: 0, batch: ctx.batch } : {}) };
    for (const [i, raw] of table.rows.entries()) {
      const m = mapRow(raw, map);
      if (Object.keys(m).length === 0) continue;
      const before = { names: new Set(ctx.names), sirens: new Set(ctx.sirens), count: ctx.count, numbers: new Set(ctx.numbers), clientBySiren: new Map(ctx.clientBySiren), clientByName: new Map(ctx.clientByName), clientsAdded: ctx.clientsAdded };
      try {
        const done = await tx.savepoint(async sp => {
          ctx.tx = sp;
          return kind === "clients" ? importClient(ctx, m) : kind === "items" ? importItem(ctx, m) : importInvoice(ctx, m);
        });
        if (done === "created") report.created++;
        else if (done === "paid") report.paid = (report.paid ?? 0) + 1;
        else report.duplicates++;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        Object.assign(ctx, before);
        if (report.skipped.length < 200) report.skipped.push({ line: i + 2, error: error.code, ...(Object.keys(error.values).length ? { values: error.values } : {}) });
      } finally {
        ctx.tx = tx;
      }
    }
    if (kind === "invoices") report.clients = ctx.clientsAdded;
    return report;
  });
}

// Who may bring what: the invoices to collect are billing's (they follow
// the money).
const importAbility = { clients: "clients.write", items: "catalogue.write", invoices: "invoices.issue" } as const;
export const canImport = (actor: Member | null, kind: ImportKind): boolean => can(actor, importAbility[kind]);

// undoImport takes an import of invoices back, while nothing happened to
// them here (no payment recorded, no reminder): they go, with the payments
// the import itself recorded. The clients it added stay (they may already
// be used).
export async function undoImport(sql: Sql, actor: Member | null, batch: unknown): Promise<{ removed: number }> {
  if (!can(actor, "invoices.issue")) throw new AppError("forbidden");
  if (typeof batch !== "string" || !/^[a-z0-9]{16}$/u.test(batch)) throw new AppError("not_found");
  return sql.begin(async tx => {
    const docs = await tx<{ id: number; reminders: number }[]>`select id, reminders from documents where import_batch = ${batch} and status = 'imported' for update`;
    if (docs.length === 0) throw new AppError("not_found");
    const ids = docs.map(d => d.id);
    const [touched] = await tx`
      select 1 from documents d where d.id = any(${ids}::bigint[]) and (d.reminders > 0
        or exists (select 1 from payments p where p.document_id = d.id and p.method <> 'imported')
        or exists (select 1 from reminder_steps r where r.document_id = d.id and r.channel <> 'none'))
      limit 1`;
    if (touched) throw new AppError("import_used");
    await tx`delete from reminder_steps where document_id = any(${ids}::bigint[])`;
    await tx`delete from payments where document_id = any(${ids}::bigint[])`;
    await tx`delete from documents where id = any(${ids}::bigint[])`;
    return { removed: ids.length };
  });
}

// The invoices of an import (to show them after it), by reference.
export async function importedIds(sql: Query, actor: Member | null, batch: unknown): Promise<string[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  if (typeof batch !== "string" || !/^[a-z0-9]{16}$/u.test(batch)) return [];
  return (await sql<{ id: number }[]>`select id from documents where import_batch = ${batch} order by id`).map(r => String(r.id));
}

async function context(tx: Query, actor: Member, kind: ImportKind, options: { currency: string; defaultLanguage: "en" | "fr"; today: string }): Promise<Context> {
  const base = { mark: null as DecimalMark | null, tx, actor, ...options, numbers: new Set<string>(), clientBySiren: new Map<string, number>(), clientByName: new Map<string, number>(), paymentDays: 30, batch: "", clientsAdded: 0 };
  if (kind === "clients") {
    const rows = await tx<{ name: string; siren: string }[]>`select name, siren from clients`;
    return { ...base, names: new Set(rows.map(r => fold(r.name))), sirens: new Set(rows.map(r => r.siren).filter(Boolean)), count: rows.length };
  }
  if (kind === "invoices") {
    const clients = await tx<{ id: number; name: string; siren: string }[]>`select id, name, siren from clients where archived_at is null order by id`;
    const numbers = await tx<{ number: string }[]>`select number from documents where status = 'imported'`;
    const [c] = await tx<{ payment_days: number }[]>`select payment_days from company where id = 1`;
    const byName = new Map<string, number>(), bySiren = new Map<string, number>();
    for (const r of clients) {
      if (!byName.has(fold(r.name))) byName.set(fold(r.name), r.id);
      if (r.siren && !bySiren.has(r.siren)) bySiren.set(r.siren, r.id);
    }
    return { ...base, names: new Set(), sirens: new Set(), count: clients.length, numbers: new Set(numbers.map(n => n.number.toLowerCase())), clientByName: byName, clientBySiren: bySiren,
      paymentDays: c?.payment_days ?? 30, batch: randomBytes(12).toString("base64url").toLowerCase().replace(/[^a-z0-9]/gu, "0").slice(0, 16) };
  }
  const rows = await tx<{ name: string; archived: boolean }[]>`select name, archived_at is not null as archived from items`;
  return { ...base, names: new Set(rows.map(r => fold(r.name))), sirens: new Set(), count: rows.filter(r => !r.archived).length };
}
