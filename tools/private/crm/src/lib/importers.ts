import type { Member } from "@argentic/chest-sdk/member";
import { can, canUndoImport } from "./access.ts";
import { record } from "./activities.ts";
import { parseAmount } from "../shared/amount.ts";
import { forget } from "./contacts.ts";
import { countryCode } from "./countries.ts";
import { fieldValue, guessKind, type Custom, type FieldDef, type FieldObject } from "../shared/custom.ts";
import type { Query, Sql, TransactionSql } from "./db.ts";
import { AppError } from "./errors.ts";
import { addField, listFields } from "./fields.ts";
import { fold } from "../shared/fold.ts";
import { today, zoned } from "./zone.ts";
import { clean, email as checkEmail, limits, owner as checkOwner, phone as checkPhone, siren as checkSiren, tags as checkTags, vat as checkVat, website as checkWebsite, stageName, type Stage, type StageKey } from "../shared/model.ts";
import { activityKind, checkMapping, dayOf, doneOf, endOf, firstName, isImportKind, mapRow, readTable, timeOf, type ImportKind, type Mapped, type Mapping } from "../shared/parse-import.ts";
import { between } from "../shared/position.ts";
import { listStages } from "./stages.ts";
import { checkAssignable, team } from "./team.ts";
import { parseVcards, type Card } from "../shared/vcard.ts";

// Importing what a team had elsewhere, so switching costs an afternoon: a
// spreadsheet of companies, contacts, deals or their history (calls, notes,
// to-dos), with the column mapping chosen on the page, or an address book
// (vCard). The file is read again here — the page's reading is never
// trusted —, every value checked; a row that cannot come is skipped and said
// (its line and why). Nothing is dropped silently: columns the tool does
// not know go into the notes (or the team's own fields), owners the Chest
// does not know are named in the report with who received their rows.
// Companies and contacts already here are linked, not doubled — and, when
// asked, their empty details are filled. Each import is recorded: its
// author or a manager may take back, for a day, everything it added.

export type ImportOptions = { fileName?: unknown; ownerFallback?: unknown; fillEmpty?: unknown };
export type ImportReport = {
  importId: string | null;
  created: number;
  companies: number;
  contacts: number;
  duplicates: number;
  updated: number;
  steps: number;
  skipped: { line: number; error: string; values?: Record<string, number | string> }[];
  kept: string[];
  fields: string[];
  owners: { name: string; rows: number }[];
  ownerFallback: string | null;
};

type Found = { id: string; companyId: string | null; email: string };
type Context = {
  tx: Query;
  actor: Member;
  importId: string;
  fillEmpty: boolean;
  fallback: string | null;
  owners: Map<string, string>; // folded name → member id
  unknownOwners: Map<string, { name: string; rows: number }>;
  companies: Map<string, string>; // folded name → id
  contacts: Map<string, Found>; // email or folded name → contact
  deals: Map<string, string>; // folded title → id (the latest)
  fields: FieldDef[];
  created: Map<string, FieldDef>; // "new:<column>" → the field made for it
  report: ImportReport;
  // What the current row added to the maps: undone if the row is refused.
  journal: [Map<string, unknown>, string][];
};

function remember<V>(ctx: Context, map: Map<string, V>, k: string, value: V): void {
  if (map.has(k)) return;
  map.set(k, value);
  ctx.journal.push([map as Map<string, unknown>, k]);
}

// An owner named in the file: the teammate of that name (or address), else
// the fallback chosen on the page — and the name is reported.
function ownerOf(ctx: Context, value: string | undefined): string | null {
  if (!value) return ctx.actor.id;
  const found = ctx.owners.get(fold(value));
  if (found) return found;
  const k = fold(value);
  const seen = ctx.unknownOwners.get(k) ?? { name: value.trim().slice(0, 80), rows: 0 };
  seen.rows++;
  ctx.unknownOwners.set(k, seen);
  return ctx.fallback;
}

// What a row keeps of the columns the tool does not know, as lines
// ("Lifecycle Stage: Customer"), and its values for the team's fields; a
// value a field refuses (a word in a number field) goes to the lines.
function extras(ctx: Context, m: Mapped): { lines: string; custom: Custom } {
  const lines = (m.kept ?? []).map(([h, v]) => `${h}: ${v}`);
  const custom: Custom = {};
  for (const [k, raw] of m.custom ?? []) {
    const field = k.startsWith("new:") ? ctx.created.get(k) : ctx.fields.find(f => f.id === k);
    if (!field) continue;
    try {
      const value = fieldValue(field, field.kind === "date" ? dayOf(raw) ?? raw : raw);
      if (value !== null) custom[field.id] = value;
    } catch {
      lines.push(`${field.label}: ${raw}`);
    }
  }
  return { lines: lines.join("\n"), custom };
}
const withLines = (notes: string, lines: string) => clean([notes, lines].filter(Boolean).join("\n\n").slice(0, limits.notes), limits.notes, { multiline: true, optional: true });

// A record's creation date, as the file gives it (else now).
function createdAt(m: Mapped): Date | null {
  const d = dayOf(m.createdAt);
  if (!d) return null;
  const t = timeOf(m.createdAt) ?? "12:00";
  const at = zoned(d, t);
  return at.getTime() > Date.now() ? null : at;
}

async function companyFor(ctx: Context, value: string | undefined): Promise<string | null> {
  const name = firstName(value).slice(0, limits.name);
  if (!name) return null;
  const k = fold(name);
  const known = ctx.companies.get(k);
  if (known) return known;
  const [row] = await ctx.tx<{ id: string }[]>`insert into companies (name, owner, created_by, import_id) values (${name}, ${ctx.actor.id}, ${ctx.actor.id}, ${ctx.importId}) returning id`;
  const created = String(row!.id);
  await record(ctx.tx, "created", ctx.actor.id, { companyId: created }, "", { imported: 1 });
  remember(ctx, ctx.companies, k, created);
  ctx.report.companies++;
  return created;
}

async function importCompany(ctx: Context, m: Mapped): Promise<"created" | "duplicate"> {
  const name = clean(firstName(m.name), limits.name);
  const { lines, custom } = extras(ctx, m);
  const v = {
    website: checkWebsite(m.website ?? ""),
    phone: checkPhone(m.phone ?? ""),
    email: checkEmail((m.email ?? "").split(/[;,]/u)[0] ?? ""),
    address: clean(m.address ?? "", limits.address, { multiline: true, optional: true }),
    postcode: clean(m.postcode ?? "", limits.postcode, { optional: true }),
    city: clean(m.city ?? "", limits.city, { optional: true }),
    country: m.country ? countryCode(m.country) ?? clean(m.country, limits.country, { optional: true }) : "",
    siren: checkSiren(m.siren ?? ""),
    vat: checkVat(m.vat ?? ""),
    industry: clean(m.industry ?? "", limits.industry, { optional: true }),
    notes: withLines(m.notes ?? "", lines),
    tags: checkTags(m.tags ?? ""),
  };
  const known = ctx.companies.get(fold(name));
  if (known) {
    if (ctx.fillEmpty) {
      // An address goes whole, or not at all.
      const [here] = await ctx.tx<{ address: string; city: string }[]>`select address, city from companies where id = ${known}`;
      const address = here && here.address === "" && here.city === "" ? { address: v.address, postcode: v.postcode, city: v.city } : {};
      await fill(ctx, "companies", known, {  website: v.website, phone: v.phone, email: v.email, country: v.country, siren: v.siren, vat: v.vat, industry: v.industry, notes: v.notes, ...address  } as Record<string, string>, custom);
    }
    return "duplicate";
  }
  const at = createdAt(m);
  const [row] = await ctx.tx<{ id: string }[]>`
    insert into companies (name, website, phone, email, address, postcode, city, country, siren, vat, industry, notes, tags, custom, owner, created_by, import_id, created_at)
    values (${name}, ${v.website}, ${v.phone}, ${v.email}, ${v.address}, ${v.postcode}, ${v.city}, ${v.country}, ${v.siren}, ${v.vat}, ${v.industry}, ${v.notes}, ${v.tags},
      ${ctx.tx.json(custom)}, ${ownerOf(ctx, m.owner)}, ${ctx.actor.id}, ${ctx.importId}, ${at ?? ctx.tx`now()`})
    returning id`;
  await createdRecord(ctx, { companyId: String(row!.id) }, at);
  remember(ctx, ctx.companies, fold(name), String(row!.id));
  return "created";
}

async function createdRecord(ctx: Context, anchor: { companyId?: string | null; contactId?: string | null; dealId?: string | null }, at: Date | null, data: Record<string, unknown> = {}): Promise<void> {
  const activity = await record(ctx.tx, "created", ctx.actor.id, anchor, "", { imported: 1, ...data });
  if (at) await ctx.tx`update activities set at = ${at} where id = ${activity}`;
}

// Fill what is empty on a record already here, never overwrite: says
// whether anything changed.
async function fill(ctx: Context, table: "companies" | "contacts", recordId: string, values: Record<string, string | null>, custom: Custom): Promise<void> {
  const [current] = await ctx.tx<Record<string, unknown>[]>`select * from ${ctx.tx(table)} where id = ${recordId}`;
  if (!current) return;
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const now = current[k];
    if (v !== null && v !== "" && (now === "" || now === null)) set[k] = v;
  }
  const had = (current["custom"] ?? {}) as Custom;
  const added = Object.fromEntries(Object.entries(custom).filter(([k]) => had[k] === undefined));
  if (Object.keys(added).length > 0) set["custom"] = ctx.tx.json({ ...had, ...added });
  if (Object.keys(set).length === 0) return;
  await ctx.tx`update ${ctx.tx(table)} set ${ctx.tx(set)}, updated_at = now() where id = ${recordId}`;
  ctx.report.updated++;
}

async function importContact(ctx: Context, m: Mapped | Card): Promise<"created" | "duplicate"> {
  const mapped = m as Mapped;
  const name = clean(("firstName" in mapped || "lastName" in mapped) && !mapped.name ? [mapped.firstName, mapped.lastName].filter(Boolean).join(" ") : (m.name ?? ""), limits.name);
  const address = checkEmail((m.email ?? "").split(/[;,]/u)[0] ?? "");
  const { lines, custom } = "kept" in mapped || "custom" in mapped ? extras(ctx, mapped) : { lines: "", custom: {} };
  const v = {
    phone: checkPhone((m.phone ?? "").split(/[;,]/u)[0] ?? ""),
    phone2: checkPhone((mapped.phone2 ?? "").split(/[;,]/u)[0] ?? ""),
    url: mapped.url ? checkWebsite(mapped.url) : "",
    title: clean(m.title ?? "", limits.title, { optional: true }),
    notes: withLines(m.notes ?? "", lines),
    tags: Array.isArray(m.tags) ? checkTags(m.tags) : checkTags(m.tags ?? ""),
  };
  // The same address is the same person; the same name too, unless both
  // have different addresses.
  const same = (address && ctx.contacts.get(address)) || (() => {
    const namesake = ctx.contacts.get(fold(name));
    return namesake && (!address || !namesake.email) ? namesake : null;
  })();
  if (same) {
    if (ctx.fillEmpty) {
      const companyId = same.companyId ? null : await companyFor(ctx, m.company);
      await fill(ctx, "contacts", same.id, { email: address, phone: v.phone, phone2: v.phone2, url: v.url, title: v.title, notes: v.notes, company_id: companyId }, custom);
    }
    return "duplicate";
  }
  const companyId = await companyFor(ctx, m.company);
  const at = createdAt(mapped);
  const [row] = await ctx.tx<{ id: string }[]>`
    insert into contacts (name, email, phone, phone2, url, title, company_id, notes, tags, custom, owner, created_by, import_id, created_at)
    values (${name}, ${address}, ${v.phone}, ${v.phone2}, ${v.url}, ${v.title}, ${companyId}, ${v.notes}, ${v.tags}, ${ctx.tx.json(custom)}, ${ownerOf(ctx, mapped.owner)}, ${ctx.actor.id}, ${ctx.importId}, ${at ?? ctx.tx`now()`})
    returning id`;
  const created = { id: String(row!.id), companyId, email: address };
  await createdRecord(ctx, { contactId: created.id, companyId }, at);
  if (address) remember(ctx, ctx.contacts, address, created);
  remember(ctx, ctx.contacts, fold(name), created);
  return "created";
}

async function contactFor(ctx: Context, who: string, address: string, companyId: string | null): Promise<Found | null> {
  const known = (address && ctx.contacts.get(address)) || (who && ctx.contacts.get(fold(who))) || null;
  if (known) return known;
  if (!who) return null;
  const [row] = await ctx.tx<{ id: string }[]>`insert into contacts (name, email, company_id, owner, created_by, import_id) values (${who}, ${address}, ${companyId}, ${ctx.actor.id}, ${ctx.actor.id}, ${ctx.importId}) returning id`;
  const found = { id: String(row!.id), companyId, email: address };
  await record(ctx.tx, "created", ctx.actor.id, { contactId: found.id, companyId }, "", { imported: 1 });
  remember(ctx, ctx.contacts, fold(who), found);
  if (address) remember(ctx, ctx.contacts, address, found);
  ctx.report.contacts++;
  return found;
}

async function importDeal(ctx: Context, m: Mapped, stages: Stage[], words: Record<StageKey, string>, positions: Map<string, string | null>): Promise<"created"> {
  const title = clean(m.title, limits.dealTitle);
  let companyId = await companyFor(ctx, m.company);
  let contactId: string | null = null;
  const address = m.contactEmail ? checkEmail(m.contactEmail.split(/[;,]/u)[0] ?? "") : "";
  const who = firstName(m.contact).slice(0, limits.name);
  const person = await contactFor(ctx, who, address, companyId);
  if (person) {
    contactId = person.id;
    companyId ??= person.companyId;
    if (person.companyId && companyId !== person.companyId) contactId = null;
  }
  const { lines, custom } = extras(ctx, m);
  // The stage: Won or Lost when the status or the stage says so; else the
  // stage of that name (in the importer's words or a manager's); else the
  // first open stage.
  const end = endOf(m.status) ?? endOf(m.stage);
  const named = m.stage ? stages.find(s => fold(stageName(s, words)) === fold(m.stage!) || (s.key !== null && fold(s.key) === fold(m.stage!))) : undefined;
  const stage = end ? stages.find(s => s.kind === end)! : named ?? stages.find(s => s.kind === "open")!;
  const last = positions.get(stage.id) ?? null;
  const position = between(last, null);
  positions.set(stage.id, position);
  const at = createdAt(m);
  const [row] = await ctx.tx<{ id: string }[]>`
    insert into deals (title, company_id, contact_id, value_cents, stage_id, position, expected_close, owner, reason, custom, created_by, closed_at, import_id, created_at)
    values (${title}, ${companyId}, ${contactId}, ${parseAmount(m.value ?? "")}, ${stage.id}, ${position}, ${dayOf(m.closeDate)}, ${ownerOf(ctx, m.owner)},
      ${stage.kind === "open" ? "" : clean(m.reason ?? "", limits.reason, { optional: true })}, ${ctx.tx.json(custom)}, ${ctx.actor.id}, ${stage.kind === "open" ? null : ctx.tx`now()`},
      ${ctx.importId}, ${at ?? ctx.tx`now()`})
    returning id`;
  const dealId = String(row!.id);
  await createdRecord(ctx, { dealId, companyId, contactId }, at, { stage: stage.id });
  // A deal has no notes of its own: what the tool does not know of it is
  // one note in its history.
  if (lines) {
    const note = await record(ctx.tx, "note", ctx.actor.id, { dealId, companyId, contactId }, lines.slice(0, limits.body), { imported: 1 });
    await ctx.tx`update activities set import_id = ${ctx.importId} where id = ${note}`;
  }
  remember(ctx, ctx.deals, fold(title), dealId);
  return "created";
}

// A line of history: a call, a meeting, an email, a note — or, when the
// file says it is not done and it is due from a month ago on, a next step.
async function importActivity(ctx: Context, m: Mapped): Promise<"created"> {
  const dealTitle = firstName(m.deal);
  const dealId = dealTitle ? ctx.deals.get(fold(dealTitle)) ?? null : null;
  const address = m.contactEmail ? checkEmail(m.contactEmail.split(/[;,]/u)[0] ?? "") : "";
  const who = firstName(m.contact);
  const person = (address && ctx.contacts.get(address)) || (who && ctx.contacts.get(fold(who))) || null;
  const companyName = firstName(m.company);
  let companyId = companyName ? ctx.companies.get(fold(companyName)) ?? null : null;
  if (!dealId && !person && !companyId) throw new AppError("not_found");
  const { lines } = extras(ctx, m);
  const subject = clean(m.subject ?? "", limits.step, { optional: true });
  const text = clean(m.text ?? "", limits.body, { multiline: true, optional: true });
  const body = [subject && text && !text.startsWith(subject) ? subject : "", text || (subject && !text ? subject : ""), lines].filter(Boolean).join("\n\n").slice(0, limits.body);
  const kind = activityKind(m.type);
  const done = doneOf(m.done);
  const day = dayOf(m.date);
  const time = timeOf(m.date) ?? (m.time && /^\d{1,2}:\d{2}/u.test(m.time.trim()) ? timeOf("x " + m.time.trim()) : null);
  const owner = m.owner ? ctx.owners.get(fold(m.owner)) ?? null : null;
  let anchor: { dealId: string | null; contactId: string | null; companyId: string | null };
  if (dealId) {
    const [d] = await ctx.tx<{ company_id: string | null; contact_id: string | null }[]>`select company_id, contact_id from deals where id = ${dealId}`;
    anchor = { dealId, contactId: d?.contact_id ? String(d.contact_id) : person?.id ?? null, companyId: d?.company_id ? String(d.company_id) : companyId };
  } else {
    companyId = person?.companyId ?? companyId;
    anchor = { dealId: null, contactId: person?.id ?? null, companyId };
  }
  const soon = day !== null && day >= addDaysTo(today(), -30);
  if (done === false && soon && (anchor.dealId || anchor.contactId)) {
    const stepOwner = m.owner ? ownerOf(ctx, m.owner) : ctx.actor.id;
    await ctx.tx`
      insert into steps (deal_id, contact_id, text, due_on, due_time, owner, created_by, import_id)
      values (${anchor.dealId}, ${anchor.dealId ? null : anchor.contactId}, ${(subject || text || "—").slice(0, limits.step)}, ${day}, ${time}, ${stepOwner}, ${ctx.actor.id}, ${ctx.importId})`;
    ctx.report.steps++;
    return "created";
  }
  const logged = kind === "task" ? "note" : kind;
  if (body === "" && logged === "note") throw new AppError("empty");
  const at = day ? zoned(day, time ?? "12:00") : null;
  const activity = await record(ctx.tx, logged, owner ?? ctx.actor.id, anchor, body, { imported: 1, ...(m.owner && !owner ? { by: m.owner.trim().slice(0, 80) } : {}) });
  await ctx.tx`update activities set import_id = ${ctx.importId}${at && at.getTime() <= Date.now() ? ctx.tx`, at = ${at}` : ctx.tx``} where id = ${activity}`;
  if (anchor.contactId && logged !== "note" && at && at.getTime() <= Date.now()) {
    await ctx.tx`update contacts set last_contact_at = greatest(coalesce(last_contact_at, ${at}), ${at}) where id = ${anchor.contactId}`;
  }
  return "created";
}

function addDaysTo(from: string, n: number): string {
  const d = new Date(from + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function context(tx: Query, actor: Member, importId: string, options: { fillEmpty: boolean; fallback: string | null; fields: FieldDef[] }): Promise<Context> {
  const owners = new Map<string, string>();
  for (const m of await team()) owners.set(fold(m.name), m.id);
  const companies = new Map((await tx<{ id: string; folded: string }[]>`select id, folded from companies`).map(r => [fold(r.folded), String(r.id)]));
  const contacts = new Map<string, Found>();
  for (const r of await tx<{ id: string; name: string; email: string; company_id: string | null }[]>`select id, name, email, company_id from contacts`) {
    const c = { id: String(r.id), companyId: r.company_id ? String(r.company_id) : null, email: r.email.toLowerCase() };
    if (r.email) contacts.set(r.email.toLowerCase(), c);
    if (!contacts.has(fold(r.name))) contacts.set(fold(r.name), c);
  }
  const deals = new Map((await tx<{ id: string; title: string }[]>`select id, title from deals order by created_at, id`).map(r => [fold(r.title), String(r.id)]));
  return {
    tx, actor, importId, fillEmpty: options.fillEmpty, fallback: options.fallback, owners, unknownOwners: new Map(), companies, contacts, deals, fields: options.fields, created: new Map(),
    report: { importId, created: 0, companies: 0, contacts: 0, duplicates: 0, updated: 0, steps: 0, skipped: [], kept: [], fields: [], owners: [], ownerFallback: options.fallback },
    journal: [],
  };
}

async function each<T>(ctx: Context, root: TransactionSql, rows: T[], firstLine: number, step: (row: T) => Promise<"created" | "duplicate">): Promise<void> {
  for (const [i, row] of rows.entries()) {
    ctx.journal = [];
    const counts = { companies: ctx.report.companies, contacts: ctx.report.contacts, updated: ctx.report.updated, steps: ctx.report.steps };
    const unknown = new Map([...ctx.unknownOwners].map(([k, v]) => [k, { ...v }]));
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
      ctx.unknownOwners = unknown;
      if (ctx.report.skipped.length < 200) ctx.report.skipped.push({ line: firstLine + i, error: error.code, ...(Object.keys(error.values).length ? { values: error.values } : {}) });
    } finally {
      ctx.tx = root;
    }
  }
}

// Who receives the rows of owners the Chest does not know: the importer
// ("me", the default), nobody ("none"), or someone of the team.
async function fallbackOf(actor: Member, value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === "" || value === "me") return actor.id;
  if (value === "none") return null;
  const owner = checkOwner(value);
  if (owner !== actor.id && !can(actor, "assign")) throw new AppError("forbidden");
  await checkAssignable(owner, actor.id);
  return owner;
}

async function begin(tx: Query, actor: Member, kind: ImportKind | "vcard", fileName: unknown): Promise<string> {
  const name = typeof fileName === "string" ? fileName.replace(/[\p{Cc}]/gu, "").slice(0, 200) : "";
  const [row] = await tx<{ id: string }[]>`insert into imports (kind, file_name, author) values (${kind}, ${name}, ${actor.id}) returning id`;
  return String(row!.id);
}

async function finish(tx: Query, ctx: Context): Promise<ImportReport> {
  ctx.report.owners = [...ctx.unknownOwners.values()].sort((a, b) => b.rows - a.rows).slice(0, 50);
  await tx`update imports set report = ${tx.json(ctx.report as never)} where id = ${ctx.importId}`;
  return ctx.report;
}

export async function importTable(sql: Sql, actor: Member | null, kind: unknown, text: unknown, mapping: unknown, words: Record<StageKey, string>, options: ImportOptions = {}): Promise<ImportReport> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  if (!isImportKind(kind) || typeof text !== "string") throw new AppError("import_invalid");
  const table = readTable(text);
  const object: FieldObject | null = kind === "activities" ? null : kind;
  const fields = object ? await listFields(sql, object) : [];
  const map: Mapping = checkMapping(kind, table.head, mapping, fields.map(f => f.id), can(actor, "fields"));
  const needs: Record<ImportKind, string[][]> = { companies: [["name"]], contacts: [["name"], ["firstName", "lastName"], ["email"]], deals: [["title"]], activities: [["deal", "contact", "contactEmail", "company"]] };
  if (!needs[kind].some(set => set.some(f => map.includes(f as never)))) throw new AppError("import_invalid");
  const fallback = await fallbackOf(actor!, options.ownerFallback);
  const stages = await listStages(sql);
  return sql.begin(async tx => {
    const importId = await begin(tx, actor!, kind, options.fileName);
    const ctx = await context(tx, actor!, importId, { fillEmpty: options.fillEmpty === true, fallback, fields });
    // The team's new fields a manager asked for: one per column, of the
    // kind its values look like.
    for (const [i, target] of map.entries()) {
      if (target !== "new" || !object) continue;
      const label = clean(table.head[i] || `Column ${i + 1}`, 60);
      const existing = ctx.fields.find(f => fold(f.label) === fold(label));
      const guessed = guessKind(table.rows.map(r => r[i] ?? ""));
      const field = existing ?? await addField(tx, actor, { object, label, kind: guessed.kind, options: guessed.options });
      if (!existing) {
        ctx.fields.push(field);
        ctx.report.fields.push(field.label);
      }
      ctx.created.set(`new:${i}`, field);
    }
    ctx.report.kept = map.flatMap((target, i) => (target === "keep" ? [table.head[i] ?? ""] : []));
    const positions = new Map<string, string | null>();
    for (const s of stages) {
      const [last] = await tx<{ position: string }[]>`select position from deals where stage_id = ${s.id} order by position desc limit 1`;
      positions.set(s.id, last?.position ?? null);
    }
    const rows = table.rows.map(r => mapRow(r, map, table.head));
    await each(ctx, tx, rows, 2, async m => {
      if (kind === "companies") return importCompany(ctx, m);
      if (kind === "contacts") {
        if (!m.name && !m.firstName && !m.lastName && m.email) m.name = m.email.split("@")[0] ?? "";
        return importContact(ctx, m);
      }
      if (kind === "activities") return importActivity(ctx, m);
      return importDeal(ctx, m, stages, words, positions);
    });
    return finish(tx, ctx);
  });
}

export async function importVcards(sql: Sql, actor: Member | null, text: unknown, options: ImportOptions = {}): Promise<ImportReport> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const cards = parseVcards(text, limits.importRows);
  return sql.begin(async tx => {
    const importId = await begin(tx, actor!, "vcard", options.fileName);
    const ctx = await context(tx, actor!, importId, { fillEmpty: options.fillEmpty === true, fallback: actor!.id, fields: [] });
    await each(ctx, tx, cards, 1, card => importContact(ctx, card));
    return finish(tx, ctx);
  });
}

// The names of a file's owner column the Chest does not know (shown before
// importing, so the importer chooses who receives their rows).
export async function unknownOwners(actor: Member | null, names: unknown): Promise<string[]> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  if (!Array.isArray(names)) throw new AppError("invalid");
  const known = new Set((await team()).map(m => fold(m.name)));
  return names.filter((n): n is string => typeof n === "string").slice(0, 200).filter(n => !known.has(fold(n)));
}

// The imports of the last 30 days, newest first, and whether the actor may
// still take each back.
export type ImportLine = { id: string; kind: string; fileName: string; author: string; at: string; created: number; undone: boolean; undoable: boolean };
export const undoHours = 24;
export async function recentImports(sql: Sql, actor: Member | null): Promise<ImportLine[]> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; kind: string; file_name: string; author: string; created_at: Date; report: Partial<ImportReport>; undone_at: Date | null }[]>`
    select id, kind, file_name, author, created_at, report, undone_at from imports where created_at > now() - interval '30 days' order by created_at desc, id desc limit 20`;
  return rows.map(r => ({
    id: String(r.id), kind: r.kind, fileName: r.file_name, author: r.author, at: r.created_at.toISOString(),
    created: (r.report.created ?? 0) + (r.report.companies ?? 0) + (r.report.contacts ?? 0) + (r.report.steps ?? 0),
    undone: r.undone_at !== null,
    undoable: r.undone_at === null && Date.now() - r.created_at.getTime() < undoHours * 3600e3 && canUndoImport(actor, r),
  }));
}

// undoImport takes back everything an import added — its deals, contacts,
// companies, history and next steps, with whatever was logged on them
// since — within a day. Details it filled into records already here stay.
// Says whose steps went and which stored files to delete.
export async function undoImport(sql: Sql, actor: Member | null, importId: unknown): Promise<{ removed: number; steps: { id: string; owner: string | null }[]; objects: string[] }> {
  const [row] = await sql<{ id: string; author: string; created_at: Date; undone_at: Date | null }[]>`select id, author, created_at, undone_at from imports where id = ${typeof importId === "string" && /^[1-9][0-9]{0,17}$/u.test(importId) ? importId : "0"}`;
  if (!row || row.undone_at) throw new AppError("not_found");
  if (!canUndoImport(actor, row)) throw new AppError("forbidden");
  if (Date.now() - row.created_at.getTime() >= undoHours * 3600e3) throw new AppError("too_late");
  return sql.begin(async tx => {
    const steps = await tx<{ id: string; owner: string | null }[]>`
      select id, owner from steps where done_at is null and (import_id = ${row.id} or deal_id in (select id from deals where import_id = ${row.id}) or contact_id in (select id from contacts where import_id = ${row.id}))`;
    const objects = (await tx<{ object: string }[]>`
      select object from attachments where deal_id in (select id from deals where import_id = ${row.id}) or contact_id in (select id from contacts where import_id = ${row.id}) or company_id in (select id from companies where import_id = ${row.id})`).map(r => r.object);
    let removed = 0;
    removed += (await tx`delete from steps where import_id = ${row.id}`).count;
    removed += (await tx`delete from activities where import_id = ${row.id} and kind <> 'created'`).count;
    removed += (await tx`delete from deals where import_id = ${row.id}`).count;
    for (const c of await tx<{ id: string }[]>`select id from contacts where import_id = ${row.id}`) {
      await forget(tx, String(c.id));
      removed++;
    }
    const companies = await tx<{ id: string }[]>`select id from companies where import_id = ${row.id}`;
    for (const c of companies) await tx`delete from activities where company_id = ${c.id} and deal_id is null and contact_id is null`;
    removed += (await tx`delete from companies where import_id = ${row.id}`).count;
    await tx`update imports set undone_at = now() where id = ${row.id}`;
    return { removed, steps: steps.map(s => ({ id: String(s.id), owner: s.owner })), objects };
  });
}
