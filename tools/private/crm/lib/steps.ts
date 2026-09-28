import type { Member } from "@argentic/chest-sdk/member";
import { can, canEditDeal, roleOf } from "./access.ts";
import { record } from "./activities.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { addDays, clean, day, id, limits, owner as ownerOf, today } from "./model.ts";
import { checkAssignable } from "./team.ts";

// Next steps: what comes next on a deal or with a contact — a few words, a
// day, and who does it. At most one open step each. "Done" turns it into an
// activity ('step') and asks for the next one. A step is the heart of "My
// day" and of the tile's number: the late and today's steps of each person.

export type Step = { id: string; text: string; due: string; owner: string | null; dealId: string | null; contactId: string | null };
export type DayStep = Step & { on: { kind: "deal" | "contact"; id: string; title: string; company: string | null; value: number | null; owner: string | null } };

type Row = { id: string; text: string; due_on: string; owner: string | null; deal_id: string | null; contact_id: string | null };
export const stepColumns = (sql: Query, alias = "p") => sql`${sql(alias + ".id")}, ${sql(alias + ".text")}, to_char(${sql(alias + ".due_on")}, 'YYYY-MM-DD') as due_on, ${sql(alias + ".owner")}, ${sql(alias + ".deal_id")}, ${sql(alias + ".contact_id")}`;
export const toStep = (r: Row): Step => ({ id: String(r.id), text: r.text, due: r.due_on, owner: r.owner, dealId: r.deal_id ? String(r.deal_id) : null, contactId: r.contact_id ? String(r.contact_id) : null });

// Who may set or clear the step of a deal (whoever may change the deal) or
// of a contact (whoever may change contacts).
async function target(sql: Sql, actor: Member | null, on: { deal?: unknown; contact?: unknown }): Promise<{ dealId: string | null; contactId: string | null; companyId: string | null }> {
  if (on.deal !== undefined && on.deal !== null && on.deal !== "") {
    const [d] = await sql<{ id: string; owner: string | null; company_id: string | null; contact_id: string | null }[]>`select id, owner, company_id, contact_id from deals where id = ${id(on.deal)}`;
    if (!d) throw new AppError("not_found");
    if (!canEditDeal(actor, d)) throw new AppError("forbidden");
    return { dealId: String(d.id), contactId: null, companyId: d.company_id ? String(d.company_id) : null };
  }
  const [c] = await sql<{ id: string; company_id: string | null }[]>`select id, company_id from contacts where id = ${id(on.contact)}`;
  if (!c) throw new AppError("not_found");
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  return { dealId: null, contactId: String(c.id), companyId: c.company_id ? String(c.company_id) : null };
}

export async function openStep(sql: Query, on: { dealId?: string; contactId?: string }): Promise<Step | null> {
  const [row] = on.dealId
    ? await sql<Row[]>`select ${stepColumns(sql)} from steps p where p.deal_id = ${on.dealId} and p.done_at is null`
    : await sql<Row[]>`select ${stepColumns(sql)} from steps p where p.contact_id = ${on.contactId ?? null} and p.done_at is null`;
  return row ? toStep(row) : null;
}

// setStep writes the open step of a deal or a contact (replacing it). It
// is the actor's unless they give it to someone of the team. Says who it
// was given to (to tell them) and who it was taken from.
export async function setStep(sql: Sql, actor: Member | null, on: { deal?: unknown; contact?: unknown }, input: { text: unknown; due: unknown; owner?: unknown }): Promise<{ step: Step; given: string | null; previousOwner: string | null }> {
  const t = await target(sql, actor, on);
  const text = clean(input.text, limits.step);
  const due = day(input.due, { required: true })!;
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
  await checkAssignable(owner, actor!.id);
  const step = await sql.begin(async tx => {
    const current = await openStep(tx, t.dealId ? { dealId: t.dealId } : { contactId: t.contactId! });
    if (current) {
      const [row] = await tx<Row[]>`update steps p set text = ${text}, due_on = ${due}, owner = ${owner} where p.id = ${current.id} returning ${stepColumns(tx)}`;
      return { step: toStep(row!), previous: current.owner };
    }
    const [row] = await tx<Row[]>`insert into steps as p (deal_id, contact_id, text, due_on, owner, created_by) values (${t.dealId}, ${t.contactId}, ${text}, ${due}, ${owner}, ${actor!.id}) returning ${stepColumns(tx)}`;
    return { step: toStep(row!), previous: null };
  });
  return { step: step.step, given: owner !== null && owner !== actor!.id && owner !== step.previous ? owner : null, previousOwner: step.previous };
}

async function stepById(sql: Sql, stepId: unknown): Promise<Step & { doneAt: Date | null }> {
  const [row] = await sql<(Row & { done_at: Date | null })[]>`select ${stepColumns(sql)}, p.done_at from steps p where p.id = ${id(stepId)}`;
  if (!row) throw new AppError("not_found");
  return { ...toStep(row), doneAt: row.done_at };
}

// completeStep: done. Its owner may say so, and whoever may change the
// record. It becomes an activity on the record; the page then asks what
// comes next.
export async function completeStep(sql: Sql, actor: Member | null, stepId: unknown): Promise<{ step: Step; activityId: string }> {
  const s = await stepById(sql, stepId);
  if (s.doneAt) throw new AppError("not_found");
  if (!(s.owner === actor?.id && roleOf(actor) !== "viewer" && roleOf(actor) !== null)) await target(sql, actor, s.dealId ? { deal: s.dealId } : { contact: s.contactId });
  const anchor = await sql.begin(async tx => {
    const updated = await tx`update steps set done_at = now() where id = ${s.id} and done_at is null returning id`;
    if (updated.length === 0) throw new AppError("not_found");
    let a: { dealId: string | null; contactId: string | null; companyId: string | null };
    if (s.dealId) {
      const [d] = await tx<{ company_id: string | null; contact_id: string | null }[]>`select company_id, contact_id from deals where id = ${s.dealId}`;
      a = { dealId: s.dealId, contactId: d?.contact_id ? String(d.contact_id) : null, companyId: d?.company_id ? String(d.company_id) : null };
    } else {
      const [c] = await tx<{ company_id: string | null }[]>`select company_id from contacts where id = ${s.contactId}`;
      a = { dealId: null, contactId: s.contactId, companyId: c?.company_id ? String(c.company_id) : null };
    }
    const activityId = await record(tx, "step", actor!.id, a, s.text, { due: s.due, stepId: s.id });
    return activityId;
  });
  return { step: s, activityId: anchor };
}

// undoComplete: the step is open again, its activity gone (the toast's Undo).
export async function reopenStep(sql: Sql, actor: Member | null, stepId: unknown): Promise<Step> {
  const s = await stepById(sql, stepId);
  if (!s.doneAt) return s;
  if (!(s.owner === actor?.id && roleOf(actor) !== "viewer" && roleOf(actor) !== null)) await target(sql, actor, s.dealId ? { deal: s.dealId } : { contact: s.contactId });
  await sql.begin(async tx => {
    const open = s.dealId ? await tx`select 1 from steps where deal_id = ${s.dealId} and done_at is null` : await tx`select 1 from steps where contact_id = ${s.contactId} and done_at is null`;
    if (open.length > 0) throw new AppError("invalid");
    await tx`update steps set done_at = null where id = ${s.id}`;
    await tx`delete from activities where kind = 'step' and data->>'stepId' = ${s.id}`;
  });
  return s;
}

// clearStep: no next step any more (not done: nothing is logged).
export async function clearStep(sql: Sql, actor: Member | null, stepId: unknown): Promise<Step> {
  const s = await stepById(sql, stepId);
  if (s.doneAt) throw new AppError("not_found");
  await target(sql, actor, s.dealId ? { deal: s.dealId } : { contact: s.contactId });
  await sql`delete from steps where id = ${s.id}`;
  return s;
}

// My day: my open steps, late and today first, then the next seven days.
export async function myDay(sql: Sql, actor: Member | null, now = today()): Promise<DayStep[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const rows = await sql<(Row & { deal_title: string | null; contact_name: string | null; company_name: string | null; value_cents: string | null; deal_owner: string | null })[]>`
    select ${stepColumns(sql)}, d.title as deal_title, d.value_cents, d.owner as deal_owner, c.name as contact_name, coalesce(o1.name, o2.name) as company_name
    from steps p
    left join deals d on d.id = p.deal_id
    left join contacts c on c.id = p.contact_id
    left join companies o1 on o1.id = d.company_id
    left join companies o2 on o2.id = c.company_id
    where p.owner = ${actor!.id} and p.done_at is null and p.due_on <= ${addDays(now, 7)}
    order by p.due_on, p.id
    limit 300`;
  return rows.map(r => ({
    ...toStep(r),
    on: r.deal_id
      ? { kind: "deal" as const, id: String(r.deal_id), title: r.deal_title ?? "", company: r.company_name, value: r.value_cents === null ? null : Number(r.value_cents), owner: r.deal_owner }
      : { kind: "contact" as const, id: String(r.contact_id), title: r.contact_name ?? "", company: r.company_name, value: null, owner: null },
  }));
}

// The number on the tile: each person's late and today's steps.
export async function urgentCounts(sql: Query, people: string[], now = today()): Promise<Map<string, number>> {
  const counts = new Map<string, number>(people.map(p => [p, 0]));
  if (people.length === 0) return counts;
  const rows = await sql<{ owner: string; n: number }[]>`
    select owner, count(*)::int as n from steps where owner in ${sql(people)} and done_at is null and due_on <= ${now} group by owner`;
  for (const r of rows) counts.set(r.owner, r.n);
  return counts;
}
