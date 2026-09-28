import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { record } from "./activities.ts";
import { parseAmount } from "./amount.ts";
import type { Query, Sql, TransactionSql } from "./db.ts";
import { AppError } from "./errors.ts";
import { fold } from "./fold.ts";
import { clean, email as checkEmail, limits, phone as checkPhone, tags as checkTags, website as checkWebsite, stageName, type Stage, type StageKey } from "./model.ts";
import { checkMapping, dayOf, endOf, firstName, isImportKind, mapRow, readTable, type ImportKind, type Mapped } from "./parse-import.ts";
import { between } from "./position.ts";
import { listStages } from "./stages.ts";
import { parseVcards, type Card } from "./vcard.ts";
import { team } from "./team.ts";

// Importing what a team had elsewhere, so switching costs an afternoon: a
// spreadsheet of companies, contacts or deals (with the column mapping
// chosen on the page), or an address book (vCard). The file is read again
// here — the page's reading is never trusted —, every value checked; a row
// that cannot come is skipped and said (its line and why). Companies and
// contacts already here are linked, not doubled: same name for a company,
// same address (or name, without an address) for a contact.

export type ImportReport = { created: number; companies: number; contacts: number; duplicates: number; skipped: { line: number; error: string; values?: Record<string, number | string> }[] };

type Context = {
  tx: Query;
  actor: Member;
  owners: Map<string, string>; // folded name or address → member id
  companies: Map<string, string>; // folded name → id
  contacts: Map<string, { id: string; companyId: string | null; email: string }>; // email or folded name → contact
  report: ImportReport;
  // What the current row added to the maps: undone if the row is refused.
  journal: [Map<string, unknown>, string][];
};

function remember<V>(ctx: Context, map: Map<string, V>, k: string, value: V): void {
  if (map.has(k)) return;
  map.set(k, value);
  ctx.journal.push([map as Map<string, unknown>, k]);
}

function ownerOf(ctx: Context, value: string | undefined): string {
  if (!value) return ctx.actor.id;
  return ctx.owners.get(fold(value)) ?? ctx.actor.id;
}

async function companyFor(ctx: Context, value: string | undefined): Promise<string | null> {
  const name = firstName(value).slice(0, limits.name);
  if (!name) return null;
  const k = fold(name);
  const known = ctx.companies.get(k);
  if (known) return known;
  const [row] = await ctx.tx<{ id: string }[]>`insert into companies (name, owner, created_by) values (${name}, ${ctx.actor.id}, ${ctx.actor.id}) returning id`;
  const created = String(row!.id);
  await record(ctx.tx, "created", ctx.actor.id, { companyId: created }, "", { imported: 1 });
  remember(ctx, ctx.companies, k, created);
  ctx.report.companies++;
  return created;
}

const joinAddress = (m: Mapped): string =>
  [m.address, [m.postcode, m.city].filter(Boolean).join(" "), m.country].filter(Boolean).join(", ");

async function importCompany(ctx: Context, m: Mapped): Promise<"created" | "duplicate"> {
  const name = clean(firstName(m.name), limits.name);
  if (ctx.companies.has(fold(name))) return "duplicate";
  const address = clean(joinAddress(m), limits.address, { optional: true });
  const [row] = await ctx.tx<{ id: string }[]>`
    insert into companies (name, website, phone, address, industry, notes, tags, owner, created_by)
    values (${name}, ${checkWebsite(m.website ?? "")}, ${checkPhone(m.phone ?? "")}, ${address}, ${clean(m.industry ?? "", limits.industry, { optional: true })},
      ${clean(m.notes ?? "", limits.notes, { multiline: true, optional: true })}, ${checkTags(m.tags ?? "")}, ${ownerOf(ctx, m.owner)}, ${ctx.actor.id})
    returning id`;
  await record(ctx.tx, "created", ctx.actor.id, { companyId: String(row!.id) }, "", { imported: 1 });
  remember(ctx, ctx.companies, fold(name), String(row!.id));
  return "created";
}

async function importContact(ctx: Context, m: Mapped | Card): Promise<"created" | "duplicate"> {
  const mapped = m as Mapped;
  const name = clean(("firstName" in mapped || "lastName" in mapped) && !mapped.name ? [mapped.firstName, mapped.lastName].filter(Boolean).join(" ") : (m.name ?? ""), limits.name);
  const address = checkEmail((m.email ?? "").split(/[;,]/u)[0] ?? "");
  // The same address is the same person; the same name too, unless both
  // have different addresses.
  if (address && ctx.contacts.has(address)) return "duplicate";
  const namesake = ctx.contacts.get(fold(name));
  if (namesake && (!address || !namesake.email)) return "duplicate";
  const companyId = await companyFor(ctx, m.company);
  const tags = Array.isArray(m.tags) ? checkTags(m.tags) : checkTags(m.tags ?? "");
  const [row] = await ctx.tx<{ id: string }[]>`
    insert into contacts (name, email, phone, title, company_id, notes, tags, owner, created_by)
    values (${name}, ${address}, ${checkPhone((m.phone ?? "").split(/[;,]/u)[0] ?? "")}, ${clean(m.title ?? "", limits.title, { optional: true })}, ${companyId},
      ${clean(m.notes ?? "", limits.notes, { multiline: true, optional: true })}, ${tags}, ${ownerOf(ctx, mapped.owner)}, ${ctx.actor.id})
    returning id`;
  const created = { id: String(row!.id), companyId, email: address };
  await record(ctx.tx, "created", ctx.actor.id, { contactId: created.id, companyId }, "", { imported: 1 });
  if (address) remember(ctx, ctx.contacts, address, created);
  remember(ctx, ctx.contacts, fold(name), created);
  return "created";
}

async function importDeal(ctx: Context, m: Mapped, stages: Stage[], words: Record<StageKey, string>, positions: Map<string, string | null>): Promise<"created"> {
  const title = clean(m.title, limits.dealTitle);
  let companyId = await companyFor(ctx, m.company);
  let contactId: string | null = null;
  const address = m.contactEmail ? checkEmail(m.contactEmail.split(/[;,]/u)[0] ?? "") : "";
  const who = firstName(m.contact).slice(0, limits.name);
  const known = (address && ctx.contacts.get(address)) || (who && ctx.contacts.get(fold(who))) || null;
  if (known) {
    contactId = known.id;
    companyId ??= known.companyId;
    if (known.companyId && companyId !== known.companyId) contactId = null;
  } else if (who) {
    const [row] = await ctx.tx<{ id: string }[]>`insert into contacts (name, email, company_id, owner, created_by) values (${who}, ${address}, ${companyId}, ${ctx.actor.id}, ${ctx.actor.id}) returning id`;
    contactId = String(row!.id);
    await record(ctx.tx, "created", ctx.actor.id, { contactId, companyId }, "", { imported: 1 });
    remember(ctx, ctx.contacts, fold(who), { id: contactId, companyId, email: address });
    if (address) remember(ctx, ctx.contacts, address, { id: contactId, companyId, email: address });
    ctx.report.contacts++;
  }
  // The stage: Won or Lost when the status or the stage says so; else the
  // stage of that name (in the importer's words or a manager's); else the
  // first open stage.
  const end = endOf(m.status) ?? endOf(m.stage);
  const named = m.stage ? stages.find(s => fold(stageName(s, words)) === fold(m.stage!) || (s.key !== null && fold(s.key) === fold(m.stage!))) : undefined;
  const stage = end ? stages.find(s => s.kind === end)! : named ?? stages.find(s => s.kind === "open")!;
  const last = positions.get(stage.id) ?? null;
  const position = between(last, null);
  positions.set(stage.id, position);
  const [row] = await ctx.tx<{ id: string }[]>`
    insert into deals (title, company_id, contact_id, value_cents, stage_id, position, expected_close, owner, reason, created_by, closed_at)
    values (${title}, ${companyId}, ${contactId}, ${parseAmount(m.value ?? "")}, ${stage.id}, ${position}, ${dayOf(m.closeDate)}, ${ownerOf(ctx, m.owner)},
      ${stage.kind === "open" ? "" : clean(m.reason ?? "", limits.reason, { optional: true })}, ${ctx.actor.id}, ${stage.kind === "open" ? null : ctx.tx`now()`})
    returning id`;
  await record(ctx.tx, "created", ctx.actor.id, { dealId: String(row!.id), companyId, contactId }, "", { imported: 1, stage: stage.id });
  return "created";
}

async function context(tx: Query, actor: Member): Promise<Context> {
  const owners = new Map<string, string>();
  for (const m of await team()) owners.set(fold(m.name), m.id);
  const companies = new Map((await tx<{ id: string; folded: string }[]>`select id, folded from companies`).map(r => [fold(r.folded), String(r.id)]));
  const contacts = new Map<string, { id: string; companyId: string | null; email: string }>();
  for (const r of await tx<{ id: string; name: string; email: string; company_id: string | null }[]>`select id, name, email, company_id from contacts`) {
    const c = { id: String(r.id), companyId: r.company_id ? String(r.company_id) : null, email: r.email.toLowerCase() };
    if (r.email) contacts.set(r.email.toLowerCase(), c);
    if (!contacts.has(fold(r.name))) contacts.set(fold(r.name), c);
  }
  return { tx, actor, owners, companies, contacts, report: { created: 0, companies: 0, contacts: 0, duplicates: 0, skipped: [] }, journal: [] };
}

async function each<T>(ctx: Context, root: TransactionSql, rows: T[], firstLine: number, step: (row: T) => Promise<"created" | "duplicate">): Promise<void> {
  for (const [i, row] of rows.entries()) {
    ctx.journal = [];
    const counts = { companies: ctx.report.companies, contacts: ctx.report.contacts };
    try {
      // Each row in its own savepoint: a refused row leaves the others.
      const done = await root.savepoint(async sp => {
        ctx.tx = sp;
        return step(row);
      });
      if (done === "created") ctx.report.created++;
      else ctx.report.duplicates++;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      for (const [map, k] of ctx.journal) map.delete(k);
      Object.assign(ctx.report, counts);
      if (ctx.report.skipped.length < 200) ctx.report.skipped.push({ line: firstLine + i, error: error.code, ...(Object.keys(error.values).length ? { values: error.values } : {}) });
    } finally {
      ctx.tx = root;
    }
  }
}

export async function importTable(sql: Sql, actor: Member | null, kind: unknown, text: unknown, mapping: unknown, words: Record<StageKey, string>): Promise<ImportReport> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  if (!isImportKind(kind) || typeof text !== "string") throw new AppError("import_invalid");
  const table = readTable(text);
  const map = checkMapping(kind, table.head, mapping);
  const needs: Record<ImportKind, string[][]> = { companies: [["name"]], contacts: [["name"], ["firstName", "lastName"], ["email"]], deals: [["title"]] };
  if (!needs[kind].some(set => set.some(f => map.includes(f as never)))) throw new AppError("import_invalid");
  const stages = await listStages(sql);
  return sql.begin(async tx => {
    const ctx = await context(tx, actor!);
    const positions = new Map<string, string | null>();
    for (const s of stages) {
      const [last] = await tx<{ position: string }[]>`select position from deals where stage_id = ${s.id} order by position desc limit 1`;
      positions.set(s.id, last?.position ?? null);
    }
    const rows = table.rows.map(r => mapRow(r, map));
    await each(ctx, tx, rows, 2, async m => {
      if (kind === "companies") return importCompany(ctx, m);
      if (kind === "contacts") {
        if (!m.name && !m.firstName && !m.lastName && m.email) m.name = m.email.split("@")[0];
        return importContact(ctx, m);
      }
      return importDeal(ctx, m, stages, words, positions);
    });
    return ctx.report;
  });
}

export async function importVcards(sql: Sql, actor: Member | null, text: unknown): Promise<ImportReport> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const cards = parseVcards(text, limits.importRows);
  return sql.begin(async tx => {
    const ctx = await context(tx, actor!);
    await each(ctx, tx, cards, 1, card => importContact(ctx, card));
    return ctx.report;
  });
}

