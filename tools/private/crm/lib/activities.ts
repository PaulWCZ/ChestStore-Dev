import type { Member } from "@argentic/chest-sdk/member";
import { can, canChangeActivity } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, id, isLoggedKind, limits, type ActivityKind } from "./model.ts";

// What happened, on a deal, a contact or a company: logged by a person (a
// call, a meeting, an email, a note) or recorded by the tool (created,
// stage, won, lost, owner, a next step done). An activity on a deal also
// carries its company and contact, on a contact its company: each page's
// timeline is one query, newest first.

export type Activity = {
  id: string;
  kind: ActivityKind;
  body: string;
  data: Record<string, string | number | null>;
  author: string;
  at: string;
  deal: { id: string; title: string } | null;
  contact: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
};

export type Anchor = { dealId?: string | null; contactId?: string | null; companyId?: string | null };

export async function record(sql: Query, kind: ActivityKind, author: string, anchor: Anchor, body = "", data: Record<string, unknown> = {}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into activities (kind, body, data, deal_id, contact_id, company_id, author)
    values (${kind}, ${body}, ${sql.json(data as never)}, ${anchor.dealId ?? null}, ${anchor.contactId ?? null}, ${anchor.companyId ?? null}, ${author})
    returning id`;
  return String(row!.id);
}

// The anchor of what is logged on one record: its own id, and the records
// it belongs to.
export async function anchorOf(sql: Query, on: { deal?: unknown; contact?: unknown; company?: unknown }): Promise<Anchor> {
  if (on.deal !== undefined && on.deal !== null && on.deal !== "") {
    const [d] = await sql<{ id: string; company_id: string | null; contact_id: string | null }[]>`select id, company_id, contact_id from deals where id = ${id(on.deal)}`;
    if (!d) throw new AppError("not_found");
    return { dealId: String(d.id), contactId: d.contact_id ? String(d.contact_id) : null, companyId: d.company_id ? String(d.company_id) : null };
  }
  if (on.contact !== undefined && on.contact !== null && on.contact !== "") {
    const [c] = await sql<{ id: string; company_id: string | null }[]>`select id, company_id from contacts where id = ${id(on.contact)}`;
    if (!c) throw new AppError("not_found");
    return { contactId: String(c.id), companyId: c.company_id ? String(c.company_id) : null };
  }
  if (on.company !== undefined && on.company !== null && on.company !== "") {
    const [c] = await sql<{ id: string }[]>`select id from companies where id = ${id(on.company)}`;
    if (!c) throw new AppError("not_found");
    return { companyId: String(c.id) };
  }
  throw new AppError("not_found");
}

// log: what a person says happened. A call, a meeting or an email may be
// logged with no words (one tap); a note needs some. A call, a meeting or
// an email with a contact counts as being in touch with them (their last
// contact, for the prospects' three-year rule).
export async function log(sql: Sql, actor: Member | null, on: { deal?: unknown; contact?: unknown; company?: unknown }, kind: unknown, body: unknown): Promise<Activity> {
  if (!can(actor, "activities.log")) throw new AppError("forbidden");
  if (!isLoggedKind(kind)) throw new AppError("invalid");
  const text = clean(body ?? "", limits.body, { multiline: true, optional: kind !== "note" });
  const anchor = await anchorOf(sql, on);
  const created = await sql.begin(async tx => {
    const key = await record(tx, kind, actor!.id, anchor, text);
    if (anchor.contactId && kind !== "note") await tx`update contacts set last_contact_at = now() where id = ${anchor.contactId}`;
    return key;
  });
  const [a] = await timeline(sql, { activityId: created });
  return a!;
}

async function own(sql: Sql, actor: Member | null, activityId: unknown, change: "edit" | "remove", removed = false): Promise<{ id: string; kind: string }> {
  const [a] = await sql<{ id: string; kind: string; author: string; removed_at: Date | null }[]>`select id, kind, author, removed_at from activities where id = ${id(activityId)}`;
  if (!a || (a.removed_at !== null) !== removed) throw new AppError("not_found");
  if (!isLoggedKind(a.kind)) throw new AppError("forbidden");
  if (!canChangeActivity(actor, a, change)) throw new AppError("forbidden");
  return { id: String(a.id), kind: a.kind };
}

export async function edit(sql: Sql, actor: Member | null, activityId: unknown, body: unknown): Promise<void> {
  const a = await own(sql, actor, activityId, "edit");
  const text = clean(body ?? "", limits.body, { multiline: true, optional: a.kind !== "note" });
  await sql`update activities set body = ${text} where id = ${a.id}`;
}

// remove takes what was logged off the timeline; restore (the page's
// "Undo") puts it back as it was. Removed items are purged after a day.
export async function remove(sql: Sql, actor: Member | null, activityId: unknown): Promise<void> {
  const a = await own(sql, actor, activityId, "remove");
  await sql`update activities set removed_at = now() where id = ${a.id} and removed_at is null`;
}

export async function restore(sql: Sql, actor: Member | null, activityId: unknown): Promise<void> {
  const a = await own(sql, actor, activityId, "remove", true);
  await sql`update activities set removed_at = null where id = ${a.id}`;
}

type Row = { id: string; kind: ActivityKind; body: string; data: Record<string, string | number | null>; author: string; at: Date; deal_id: string | null; deal_title: string | null; contact_id: string | null; contact_name: string | null; company_id: string | null; company_name: string | null };

// timeline: the newest first, of one record (or one activity).
export async function timeline(sql: Query, of: { dealId?: string; contactId?: string; companyId?: string; activityId?: string }, limit = 100): Promise<Activity[]> {
  const where = of.activityId ? sql`a.id = ${of.activityId}`
    : of.dealId ? sql`a.deal_id = ${of.dealId}`
    : of.contactId ? sql`a.contact_id = ${of.contactId}`
    : of.companyId ? sql`a.company_id = ${of.companyId}`
    : sql`false`;
  const rows = await sql<Row[]>`
    select a.id, a.kind, a.body, a.data, a.author, a.at, a.deal_id, d.title as deal_title, a.contact_id, c.name as contact_name, a.company_id, o.name as company_name
    from activities a
    left join deals d on d.id = a.deal_id
    left join contacts c on c.id = a.contact_id
    left join companies o on o.id = a.company_id
    where ${where} and a.removed_at is null
    order by a.at desc, a.id desc
    limit ${limit}`;
  return rows.map(r => ({
    id: String(r.id),
    kind: r.kind,
    body: r.body,
    data: r.data,
    author: r.author,
    at: r.at.toISOString(),
    deal: r.deal_id ? { id: String(r.deal_id), title: r.deal_title ?? "" } : null,
    contact: r.contact_id ? { id: String(r.contact_id), name: r.contact_name ?? "" } : null,
    company: r.company_id ? { id: String(r.company_id), name: r.company_name ?? "" } : null,
  }));
}
