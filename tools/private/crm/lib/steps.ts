import type { Member } from "@argentic/chest-sdk/member";
import { can, canEditDeal, ownsStep } from "./access.ts";
import { record } from "./activities.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { addDays, clean, day, id, limits, owner as ownerOf, time } from "./model.ts";
import { today } from "./zone.ts";
import { checkAssignable } from "./team.ts";

// Next steps: what comes next on a deal, with a contact, or for oneself
// ("prepare the trade show") — a few words, a day (and a time if it
// matters), and who does it. A deal or a contact may have several open
// ones; the soonest is "the next step" the lists show. "Done" turns a step
// on a deal or a contact into an activity ('step'); when it was the last
// open one, the page asks what comes next. Steps are the heart of "My day"
// and of the tile's number: the late and today's steps of each person.

export type Step = { id: string; text: string; due: string; time: string | null; owner: string | null; createdBy: string; dealId: string | null; contactId: string | null };
export type DayStep = Step & { on: { kind: "deal" | "contact"; id: string; title: string; company: string | null; value: number | null; owner: string | null } | null };

type Row = { id: string; text: string; due_on: string; due_time: string | null; owner: string | null; created_by: string; deal_id: string | null; contact_id: string | null };
export const stepColumns = (sql: Query, alias = "p") => sql`${sql(alias + ".id")}, ${sql(alias + ".text")}, to_char(${sql(alias + ".due_on")}, 'YYYY-MM-DD') as due_on, ${sql(alias + ".due_time")}, ${sql(alias + ".owner")}, ${sql(alias + ".created_by")}, ${sql(alias + ".deal_id")}, ${sql(alias + ".contact_id")}`;
export const toStep = (r: Row): Step => ({ id: String(r.id), text: r.text, due: r.due_on, time: r.due_time ?? null, owner: r.owner, createdBy: r.created_by, dealId: r.deal_id ? String(r.deal_id) : null, contactId: r.contact_id ? String(r.contact_id) : null });
const order = (sql: Query) => sql`p.due_on, p.due_time nulls last, p.id`;

type Target = { dealId: string | null; contactId: string | null; companyId: string | null };

// Who may plan steps on a deal (whoever may change the deal) or a contact
// (whoever may change contacts); a step of one's own, whoever logs.
async function target(sql: Query, actor: Member | null, on: { deal?: unknown; contact?: unknown } | null): Promise<Target> {
  if (on && on.deal !== undefined && on.deal !== null && on.deal !== "") {
    const [d] = await sql<{ id: string; owner: string | null; company_id: string | null; contact_id: string | null }[]>`select id, owner, company_id, contact_id from deals where id = ${id(on.deal)}`;
    if (!d) throw new AppError("not_found");
    if (!canEditDeal(actor, d)) throw new AppError("forbidden");
    return { dealId: String(d.id), contactId: null, companyId: d.company_id ? String(d.company_id) : null };
  }
  if (on && on.contact !== undefined && on.contact !== null && on.contact !== "") {
    const [c] = await sql<{ id: string; company_id: string | null }[]>`select id, company_id from contacts where id = ${id(on.contact)}`;
    if (!c) throw new AppError("not_found");
    if (!can(actor, "records.write")) throw new AppError("forbidden");
    return { dealId: null, contactId: String(c.id), companyId: c.company_id ? String(c.company_id) : null };
  }
  if (!can(actor, "activities.log")) throw new AppError("forbidden");
  return { dealId: null, contactId: null, companyId: null };
}

// The open steps of a deal or a contact, soonest first.
export async function openSteps(sql: Query, on: { dealId?: string; contactId?: string }): Promise<Step[]> {
  const rows = on.dealId
    ? await sql<Row[]>`select ${stepColumns(sql)} from steps p where p.deal_id = ${on.dealId} and p.done_at is null order by ${order(sql)}`
    : await sql<Row[]>`select ${stepColumns(sql)} from steps p where p.contact_id = ${on.contactId ?? null} and p.done_at is null order by ${order(sql)}`;
  return rows.map(toStep);
}

type StepInput = { text: unknown; due: unknown; time?: unknown; owner?: unknown };
function checked(input: StepInput) {
  return { text: clean(input.text, limits.step), due: day(input.due, { required: true })!, time: time(input.time) };
}

// addStep plans one more step (on a deal, a contact, or nothing: one's
// own). It is the actor's unless they give it to someone of the team.
// Says who it was given to, to tell them.
export async function addStep(sql: Sql, actor: Member | null, on: { deal?: unknown; contact?: unknown } | null, input: StepInput): Promise<{ step: Step; given: string | null }> {
  const t = await target(sql, actor, on);
  const v = checked(input);
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  if (owner === null && t.dealId === null && t.contactId === null) throw new AppError("invalid");
  if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
  await checkAssignable(owner, actor!.id);
  const [row] = await sql<Row[]>`
    insert into steps as p (deal_id, contact_id, text, due_on, due_time, owner, created_by)
    values (${t.dealId}, ${t.contactId}, ${v.text}, ${v.due}, ${v.time}, ${owner}, ${actor!.id})
    returning ${stepColumns(sql)}`;
  return { step: toStep(row!), given: owner !== null && owner !== actor!.id ? owner : null };
}

async function stepById(sql: Query, stepId: unknown): Promise<Step & { doneAt: Date | null }> {
  const [row] = await sql<(Row & { done_at: Date | null })[]>`select ${stepColumns(sql)}, p.done_at from steps p where p.id = ${id(stepId)}`;
  if (!row) throw new AppError("not_found");
  return { ...toStep(row), doneAt: row.done_at };
}

// A step of one's own is seen and changed only by its owner and whoever
// planned it; a step on a deal or a contact by whoever may change that, or
// its owner (who may say it is done).
async function mayChange(sql: Query, actor: Member | null, s: Step, change: "complete" | "edit"): Promise<void> {
  if (s.dealId === null && s.contactId === null) {
    if (!actor || !can(actor, "activities.log") || (s.owner !== actor.id && s.createdBy !== actor.id)) throw new AppError("not_found");
    return;
  }
  if (change === "complete" && ownsStep(actor, s) && s.owner === actor!.id) return;
  await target(sql, actor, s.dealId ? { deal: s.dealId } : { contact: s.contactId });
}

// updateStep changes what, when or who. Says who it was given to and who
// it was taken from.
export async function updateStep(sql: Sql, actor: Member | null, stepId: unknown, input: StepInput): Promise<{ step: Step; given: string | null; previousOwner: string | null }> {
  const s = await stepById(sql, stepId);
  if (s.doneAt) throw new AppError("not_found");
  await mayChange(sql, actor, s, "edit");
  const v = checked(input);
  const owner = input.owner === undefined ? s.owner : ownerOf(input.owner);
  if (owner !== s.owner) {
    if (owner === null && s.dealId === null && s.contactId === null) throw new AppError("invalid");
    if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
    await checkAssignable(owner, actor!.id);
  }
  const [row] = await sql<Row[]>`update steps p set text = ${v.text}, due_on = ${v.due}, due_time = ${v.time}, owner = ${owner} where p.id = ${s.id} returning ${stepColumns(sql)}`;
  return { step: toStep(row!), given: owner !== null && owner !== actor!.id && owner !== s.owner ? owner : null, previousOwner: s.owner };
}

// completeStep: done. On a deal or a contact it becomes an activity there;
// `last` says whether it was the last open one (the page then asks what
// comes next).
export async function completeStep(sql: Sql, actor: Member | null, stepId: unknown): Promise<{ step: Step; activityId: string | null; last: boolean }> {
  const s = await stepById(sql, stepId);
  if (s.doneAt) throw new AppError("not_found");
  await mayChange(sql, actor, s, "complete");
  return sql.begin(async tx => {
    const updated = await tx`update steps set done_at = now() where id = ${s.id} and done_at is null returning id`;
    if (updated.length === 0) throw new AppError("not_found");
    if (s.dealId === null && s.contactId === null) return { step: s, activityId: null, last: false };
    let a: Target;
    if (s.dealId) {
      const [d] = await tx<{ company_id: string | null; contact_id: string | null }[]>`select company_id, contact_id from deals where id = ${s.dealId}`;
      a = { dealId: s.dealId, contactId: d?.contact_id ? String(d.contact_id) : null, companyId: d?.company_id ? String(d.company_id) : null };
    } else {
      const [c] = await tx<{ company_id: string | null }[]>`select company_id from contacts where id = ${s.contactId}`;
      a = { dealId: null, contactId: s.contactId, companyId: c?.company_id ? String(c.company_id) : null };
    }
    const activityId = await record(tx, "step", actor!.id, a, s.text, { due: s.due, stepId: s.id });
    const open = s.dealId ? await tx`select 1 from steps where deal_id = ${s.dealId} and done_at is null limit 1` : await tx`select 1 from steps where contact_id = ${s.contactId} and done_at is null limit 1`;
    return { step: s, activityId, last: open.length === 0 };
  });
}

// reopenStep: the step is open again, its activity gone (the toast's Undo).
export async function reopenStep(sql: Sql, actor: Member | null, stepId: unknown): Promise<Step> {
  const s = await stepById(sql, stepId);
  if (!s.doneAt) return s;
  await mayChange(sql, actor, s, "complete");
  await sql.begin(async tx => {
    await tx`update steps set done_at = null where id = ${s.id}`;
    await tx`delete from activities where kind = 'step' and data->>'stepId' = ${s.id}`;
  });
  return s;
}

// clearStep: this step is not needed any more (not done: nothing is logged).
export async function clearStep(sql: Sql, actor: Member | null, stepId: unknown): Promise<Step> {
  const s = await stepById(sql, stepId);
  if (s.doneAt) throw new AppError("not_found");
  await mayChange(sql, actor, s, "edit");
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
    order by ${order(sql)}
    limit 300`;
  return rows.map(r => ({
    ...toStep(r),
    on: r.deal_id
      ? { kind: "deal" as const, id: String(r.deal_id), title: r.deal_title ?? "", company: r.company_name, value: r.value_cents === null ? null : Number(r.value_cents), owner: r.deal_owner }
      : r.contact_id ? { kind: "contact" as const, id: String(r.contact_id), title: r.contact_name ?? "", company: r.company_name, value: null, owner: null }
      : null,
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
