import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { record } from "./activities.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { id, owner as ownerOf } from "../shared/model.ts";
import { checkAssignable } from "./team.ts";

// Leads, and the answers of forms to check (lib/from-forms.ts makes both).
//
// A lead is a contact a form made and nobody owns yet (`lead_since`): it
// waits at the top of My day for sales and managers until someone takes
// it ("I'll take it"), is given it, or says it is not a lead. A contact
// that gets an owner any other way leaves the list too (it is read as
// "a lead, still nobody's").
//
// A form's line to check is one a manager should look at, because it may
// sit in the wrong person's file: the form gave an email other than the
// contact's; or the line was filed before Clients kept what the form gave
// (0005), on a contact the form did not make — the old rule matched a
// phone whatever the name, and nothing can tell afterwards whether it
// was right. The manager opens the answer in Forms, then says "Right
// person" or moves the line to whom it belongs.

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  since: string;
  form: string;
  message: string;
  maybe: { id: string; name: string } | null;
  // A lead made by a booking (lib/from-booking.ts): its meeting.
  booking: { type: Record<string, string>; start: string } | null;
};

export async function leads(sql: Sql, actor: Member | null, limit = 20): Promise<{ rows: Lead[]; total: number }> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; name: string; email: string; phone: string; company: string | null; since: Date; form: string | null; message: string | null; maybe_id: string | null; maybe_name: string | null; booking: { type?: Record<string, string>; start?: string } | null; total: number }[]>`
    select c.id, c.name, c.email, c.phone, o.name as company, c.lead_since as since,
      f.data->>'form' as form, f.body as message, m.id as maybe_id, m.name as maybe_name, g.data as booking,
      count(*) over ()::int as total
    from contacts c
    left join companies o on o.id = c.company_id
    left join contacts m on m.id = c.maybe_same
    left join lateral (select a.data, a.body from activities a where a.contact_id = c.id and a.kind = 'form' order by a.at desc, a.id desc limit 1) f on true
    left join lateral (select a.data from activities a where a.contact_id = c.id and a.kind = 'booking' and a.data->>'status' = 'confirmed' order by a.at desc, a.id desc limit 1) g on true
    where c.lead_since is not null and c.owner is null
    order by c.lead_since desc, c.id desc
    limit ${limit}`;
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map(r => ({
      id: String(r.id), name: r.name, email: r.email, phone: r.phone, company: r.company, since: r.since.toISOString(),
      form: r.form ?? "", message: r.message ?? "",
      maybe: r.maybe_id ? { id: String(r.maybe_id), name: r.maybe_name ?? "" } : null,
      booking: r.booking && typeof r.booking.start === "string" ? { type: r.booking.type ?? {}, start: r.booking.start } : null,
    })),
  };
}

// takeLead: the lead becomes its taker's (or, for whoever may give things
// away, someone else's); a company the same form made, nobody's, goes with
// it. Taken already by someone else: not_found (it is no longer a lead).
export async function takeLead(sql: Sql, actor: Member | null, contactId: unknown, to?: unknown): Promise<{ id: string; name: string; owner: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const contact = id(contactId);
  const owner = to === undefined ? actor!.id : ownerOf(to);
  if (owner === null) throw new AppError("invalid");
  if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
  await checkAssignable(owner, actor!.id);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string; name: string; company_id: string | null }[]>`
      update contacts set owner = ${owner}, lead_since = null, updated_at = now()
      where id = ${contact} and owner is null and lead_since is not null
      returning id, name, company_id`;
    if (!row) throw new AppError("not_found");
    const companyId = row.company_id ? String(row.company_id) : null;
    if (companyId) await tx`update companies set owner = ${owner}, updated_at = now() where id = ${companyId} and owner is null and created_by = 'chest'`;
    await record(tx, "owner", actor!.id, { contactId: contact, companyId }, "", { from: null, to: owner });
    return { id: contact, name: row.name, owner };
  });
}

// dismissLead: "Not a lead" (spam, a supplier, a job seeker): off the list,
// the contact stays (deleting a person is the contact page's). Undo puts
// it back while nobody owns it.
export async function dismissLead(sql: Sql, actor: Member | null, contactId: unknown): Promise<void> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const [row] = await sql`update contacts set lead_since = null where id = ${id(contactId)} and owner is null and lead_since is not null returning id`;
  if (!row) throw new AppError("not_found");
}
export async function restoreLead(sql: Sql, actor: Member | null, contactId: unknown): Promise<void> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const [row] = await sql`update contacts set lead_since = coalesce(lead_since, now()) where id = ${id(contactId)} and owner is null returning id`;
  if (!row) throw new AppError("not_found");
}

// maybeSame: the contact this one may be (same phone, another name), for
// its page to ask; keepApart answers "not the same person".
export async function maybeSame(sql: Query, contactId: string): Promise<{ id: string; name: string; phone: string } | null> {
  const [row] = await sql<{ id: string; name: string; phone: string }[]>`
    select m.id, m.name, m.phone from contacts c join contacts m on m.id = c.maybe_same where c.id = ${contactId}`;
  return row ? { id: String(row.id), name: row.name, phone: row.phone } : null;
}
export async function keepApart(sql: Sql, actor: Member | null, contactId: unknown): Promise<void> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const [row] = await sql`update contacts set maybe_same = null where id = ${id(contactId)} returning id`;
  if (!row) throw new AppError("not_found");
}

// What the form gave, as stored on the line (absent on lines filed before
// 0005).
export type Submitted = { name: string; email: string; phone: string; company: string };
export function submitted(data: Record<string, unknown>): Submitted | null {
  const who = data["who"];
  if (typeof who !== "object" || who === null || Array.isArray(who)) return null;
  const w = who as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { name: s(w["name"]), email: s(w["email"]), phone: s(w["phone"]), company: s(w["company"]) };
}

export type LineToCheck = {
  id: string;
  at: string;
  form: string;
  body: string;
  data: Record<string, unknown>;
  who: Submitted | null;
  contact: { id: string; name: string; email: string; phone: string };
  why: "email" | "before";
};

// Checking and moving lines is a manager's: it touches everyone's clients.
function checker(actor: Member | null): void {
  if (!can(actor, "records.delete.any")) throw new AppError("forbidden");
}

export async function formLinesToCheck(sql: Sql, actor: Member | null, limit = 100): Promise<{ rows: LineToCheck[]; total: number }> {
  checker(actor);
  const rows = await sql<{ id: string; at: Date; body: string; data: Record<string, unknown>; contact_id: string; name: string; email: string; phone: string; why: "email" | "before"; total: number }[]>`
    select a.id, a.at, a.body, a.data, c.id as contact_id, c.name, c.email, c.phone,
      case when a.data ? 'who' then 'email' else 'before' end as why,
      count(*) over ()::int as total
    from activities a join contacts c on c.id = a.contact_id
    where a.kind = 'form' and not coalesce((a.data->>'checked')::boolean, false)
      and (
        (a.data ? 'who' and coalesce(a.data->'who'->>'email', '') <> '' and lower(a.data->'who'->>'email') <> lower(c.email))
        or (not a.data ? 'who' and not (c.created_by = 'chest' and a.id = (select min(b.id) from activities b where b.contact_id = c.id and b.kind = 'form')))
      )
    order by a.at desc, a.id desc
    limit ${limit}`;
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map(r => ({
      id: String(r.id), at: r.at.toISOString(), form: String(r.data["form"] ?? ""), body: r.body, data: r.data, who: submitted(r.data),
      contact: { id: String(r.contact_id), name: r.name, email: r.email, phone: r.phone }, why: r.why,
    })),
  };
}

export async function countFormLinesToCheck(sql: Sql, actor: Member | null): Promise<number> {
  if (!can(actor, "records.delete.any")) return 0;
  return (await formLinesToCheck(sql, actor, 1)).total;
}

async function formLine(tx: Query, activityId: unknown): Promise<{ id: string; contact_id: string; data: Record<string, unknown> }> {
  const [row] = await tx<{ id: string; contact_id: string; data: Record<string, unknown> }[]>`select id, contact_id, data from activities where id = ${id(activityId)} and kind = 'form' for update`;
  if (!row) throw new AppError("not_found");
  return row;
}

// markChecked: "Right person": the line stays, off the list (Undo: unmark).
export async function markChecked(sql: Sql, actor: Member | null, activityId: unknown, checked = true): Promise<void> {
  checker(actor);
  await sql.begin(async tx => {
    const line = await formLine(tx, activityId);
    await tx`update activities set data = ${tx.json({ ...line.data, checked })} where id = ${line.id}`;
  });
}

// moveLine: the line goes to the contact it belongs to — one of the book,
// or (`to` = "new") a new contact made from what the form gave, a lead.
export async function moveLine(sql: Sql, actor: Member | null, activityId: unknown, to: unknown): Promise<{ contact: string }> {
  checker(actor);
  return sql.begin(async tx => {
    const line = await formLine(tx, activityId);
    let target: { id: string; company_id: string | null };
    if (to === "new") {
      const who = submitted(line.data);
      if (!who || (!who.name && !who.email && !who.phone)) throw new AppError("invalid");
      const [row] = await tx<{ id: string }[]>`
        insert into contacts (name, email, phone, owner, created_by, last_contact_at, lead_since)
        values (${who.name || who.email || who.phone}, ${who.email}, ${who.phone}, null, 'chest', (select at from activities where id = ${line.id}), now())
        returning id`;
      await record(tx, "created", actor!.id, { contactId: String(row!.id) });
      target = { id: String(row!.id), company_id: null };
    } else {
      const [row] = await tx<{ id: string; company_id: string | null }[]>`select id, company_id from contacts where id = ${id(to)}`;
      if (!row) throw new AppError("not_found");
      target = { id: String(row.id), company_id: row.company_id ? String(row.company_id) : null };
    }
    if (target.id === String(line.contact_id)) throw new AppError("same_record");
    await tx`update activities set contact_id = ${target.id}, company_id = ${target.company_id}, deal_id = null, data = ${tx.json({ ...line.data, checked: true, movedFrom: String(line.contact_id) })} where id = ${line.id}`;
    return { contact: target.id };
  });
}
