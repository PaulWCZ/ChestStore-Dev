import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { checkBudgets } from "./budgets.ts";
import { today } from "./clock.ts";
import type { Query } from "./db.ts";
import { cents, day as checkDay, id, limits, memberPattern } from "../shared/model.ts";
import { transaction } from "./tx.ts";
import type { RateLock } from "../shared/rate-day.ts";
import { addDays } from "../shared/days.ts";
import { format, formatDay, type Catalogue, type Locale } from "../i18n/index.ts";
import { isLocked, settings } from "./settings.ts";

// Hourly rates with their history. A rate applies from a day on; the amount
// of an entry is its minutes at the rate in force on the entry's day
// (migrations/0002: bill_rate, cost_rate), so a new rate never rewrites the
// past. An entry whose rates were fixed (invoiced, imported with the old
// tool's rates, its author erased) keeps its own. Managers only: members
// never see a rate.
//
// Billable: a person's rate on a project, else the project's rate, else the
// person's usual rate. Cost: what an hour of a person costs the company.

export type RateKind = "bill" | "cost";
export type RateTarget = { kind: RateKind; projectId: string | null; memberId: string | null };
export type RateStep = { from: string; cents: number | null; setBy: string | null };

// The first day of every history: "since the start".
export const origin = "2000-01-01";

// The rates of an entry of alias `e`, in SQL.
export const billRateOf = (sql: Query) => sql`(case when e.rates_fixed then e.bill_rate_cents else bill_rate(e.member_id, e.project_id, e.day) end)`;
export const costRateOf = (sql: Query) => sql`(case when e.rates_fixed then e.cost_rate_cents else cost_rate(e.member_id, e.day) end)`;
// Money in cents of a set of entries (a numeric, as text): billable minutes
// at their rate; the cost of all minutes at their person's cost.
export const revenueOf = (sql: Query) => sql`coalesce(sum(case when e.billable then e.minutes::numeric * coalesce(${billRateOf(sql)}, 0) / 60 else 0 end), 0)::text`;
export const costOf = (sql: Query) => sql`coalesce(sum(e.minutes::numeric * coalesce(${costRateOf(sql)}, 0) / 60), 0)::text`;

function target(input: { kind?: unknown; projectId?: unknown; memberId?: unknown }): RateTarget {
  const kind = input.kind;
  if (kind !== "bill" && kind !== "cost") throw new AppError("invalid");
  const projectId = input.projectId === undefined || input.projectId === null || input.projectId === "" ? null : id(input.projectId);
  let memberId: string | null = null;
  if (input.memberId !== undefined && input.memberId !== null && input.memberId !== "") {
    if (typeof input.memberId !== "string" || !memberPattern.test(input.memberId)) throw new AppError("invalid");
    memberId = input.memberId;
  }
  if (kind === "bill" && projectId === null && memberId === null) throw new AppError("invalid");
  if (kind === "cost" && (projectId !== null || memberId === null)) throw new AppError("invalid");
  return { kind, projectId, memberId };
}

const where = (sql: Query, t: RateTarget) => sql`
  kind = ${t.kind}
  and ${t.projectId === null ? sql`project_id is null` : sql`project_id = ${t.projectId}`}
  and ${t.memberId === null ? sql`member_id is null` : sql`member_id = ${t.memberId}`}`;

// The history of one rate, oldest first.
export async function history(sql: Query, t: RateTarget): Promise<RateStep[]> {
  const rows = await sql<{ from_day: string; rate_cents: string | null; set_by: string | null }[]>`
    select to_char(from_day, 'YYYY-MM-DD') as from_day, rate_cents::text, set_by from rates where ${where(sql, t)} order by from_day`;
  return rows.map(r => ({ from: r.from_day, cents: r.rate_cents === null ? null : Number(r.rate_cents), setBy: r.set_by }));
}

// rateOn: the step in force on a day (null: none).
export function rateOn(steps: readonly RateStep[], day: string): number | null {
  let found: number | null = null;
  for (const s of steps) if (s.from <= day) found = s.cents;
  return found;
}

// setRate gives a rate (or none) from a day on. The day may not fall in
// the locked period (that time was invoiced or paid); a day already in the
// history changes that step. Setting the rate already in force changes
// nothing. The project's column rate_cents follows, for the version before.
export async function setRate(sql: Query, actor: Member | null, input: { kind?: unknown; projectId?: unknown; memberId?: unknown; cents?: unknown; from?: unknown }): Promise<RateStep[]> {
  if (!actor || !can(actor, "rates")) throw new AppError("forbidden");
  const t = target(input);
  const value = cents(input.cents, limits.rateCents);
  const from = input.from === origin ? origin : checkDay(input.from, today());
  const steps = await transaction(sql, async tx => {
    if (t.projectId !== null) {
      const [p] = await tx`select 1 from projects where id = ${t.projectId} for update`;
      if (!p) throw new AppError("not_found");
    }
    const s = await settings(tx);
    if (isLocked(s, from)) throw new AppError("rate_locked");
    const steps = await history(tx, t);
    if (steps.length === 0 && value === null) return steps;
    if (rateOn(steps, from) === value && !steps.some(x => x.from > from)) return steps;
    await tx`
      insert into rates (kind, project_id, member_id, from_day, rate_cents, set_by)
      values (${t.kind}, ${t.projectId}, ${t.memberId}, ${from}, ${value}, ${actor.id})
      on conflict (kind, coalesce(project_id, 0), coalesce(member_id, ''), from_day)
      do update set rate_cents = excluded.rate_cents, set_by = excluded.set_by, set_at = now()`;
    if (t.kind === "bill" && t.projectId !== null && t.memberId === null) await mirror(tx, t.projectId);
    return history(tx, t);
  });
  // A money budget follows the project's amounts.
  if (t.kind === "bill" && t.projectId !== null) await checkBudgets(sql, [t.projectId]);
  return steps;
}

// mirror keeps projects.rate_cents at the project's rate in force today.
export async function mirror(tx: Query, projectId: string): Promise<void> {
  await tx`
    update projects set rate_cents = (select rate_cents from rates where kind = 'bill' and project_id = ${projectId} and member_id is null and from_day <= ${today()} order by from_day desc limit 1)
    where id = ${projectId}`;
}

// removeStep takes a step out of a history (a rate set by mistake); what
// it covered falls back on the step before. Not in the locked period.
export async function removeStep(sql: Query, actor: Member | null, input: { kind?: unknown; projectId?: unknown; memberId?: unknown; from?: unknown }): Promise<RateStep[]> {
  if (!actor || !can(actor, "rates")) throw new AppError("forbidden");
  const t = target(input);
  if (typeof input.from !== "string") throw new AppError("invalid");
  const from = input.from;
  return transaction(sql, async tx => {
    if (isLocked(await settings(tx), from)) throw new AppError("rate_locked");
    const done = await tx`delete from rates where ${where(tx, t)} and from_day = ${from}`;
    if (done.count === 0) throw new AppError("not_found");
    if (t.kind === "bill" && t.projectId !== null && t.memberId === null) await mirror(tx, t.projectId);
    return history(tx, t);
  });
}

// The histories of everyone's usual and cost rates (the People page), and
// of the people's rates on one project (its page).
export type PersonRates = { memberId: string; bill: RateStep[]; cost: RateStep[] };

export async function peopleRates(sql: Query, actor: Member | null): Promise<PersonRates[]> {
  if (!actor || !can(actor, "rates")) throw new AppError("forbidden");
  const rows = await sql<{ kind: RateKind; member_id: string; from_day: string; rate_cents: string | null; set_by: string | null }[]>`
    select kind, member_id, to_char(from_day, 'YYYY-MM-DD') as from_day, rate_cents::text, set_by from rates
    where project_id is null and member_id is not null order by member_id, from_day limit 20000`;
  const found = new Map<string, PersonRates>();
  for (const r of rows) {
    const p = found.get(r.member_id) ?? { memberId: r.member_id, bill: [], cost: [] };
    p[r.kind].push({ from: r.from_day, cents: r.rate_cents === null ? null : Number(r.rate_cents), setBy: r.set_by });
    found.set(r.member_id, p);
  }
  return [...found.values()];
}

export async function projectRates(sql: Query, actor: Member | null, projectId: unknown): Promise<{ project: RateStep[]; people: { memberId: string; steps: RateStep[] }[] }> {
  if (!actor || !can(actor, "rates")) throw new AppError("forbidden");
  const pid = id(projectId);
  const rows = await sql<{ member_id: string | null; from_day: string; rate_cents: string | null; set_by: string | null }[]>`
    select member_id, to_char(from_day, 'YYYY-MM-DD') as from_day, rate_cents::text, set_by from rates
    where kind = 'bill' and project_id = ${pid} order by member_id nulls first, from_day`;
  const step = (r: (typeof rows)[number]): RateStep => ({ from: r.from_day, cents: r.rate_cents === null ? null : Number(r.rate_cents), setBy: r.set_by });
  const people = new Map<string, RateStep[]>();
  for (const r of rows) if (r.member_id) people.set(r.member_id, [...(people.get(r.member_id) ?? []), step(r)]);
  return { project: rows.filter(r => r.member_id === null).map(step), people: [...people].map(([memberId, steps]) => ({ memberId, steps })) };
}

// fixRates writes on entries the rates in force for them now, so that they
// never move again (invoiced, or their author erased).
export async function fixRates(tx: Query, where: { entryIds?: string[]; memberId?: string }): Promise<void> {
  const filter = where.entryIds ? tx`id = any(${where.entryIds}::bigint[])` : tx`member_id = ${where.memberId ?? ""}`;
  await tx`
    update entries e set rates_fixed = true,
      bill_rate_cents = bill_rate(e.member_id, e.project_id, e.day), cost_rate_cents = cost_rate(e.member_id, e.day)
    where ${filter} and not e.rates_fixed`;
}

// What the rate forms say of the locked period ("Locked up to 31 August
// 2026: a new rate starts on 1 September 2026 at the earliest…"), in the
// reader's words; null when nothing is locked.
export function rateLock(lockedUntil: string | null, locale: Locale, t: Catalogue): RateLock {
  if (lockedUntil === null) return null;
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  return { until: lockedUntil, text: format(t.people.lockHint, { lock: long(lockedUntil), next: long(addDays(lockedUntil, 1)) }) };
}

// Where a person's usual rate is used today: on their billable projects of
// the last 90 days (open ones), the rate that wins for them — their own
// rate on that project, the project's, or their usual one. The People page
// says it, so that a usual rate that no project uses is never a surprise.
export type RateUse = { memberId: string; projects: { id: string; name: string; source: "person_project" | "project" | "own" }[] };

export async function rateUse(sql: Query, actor: Member | null, memberIds: readonly string[]): Promise<Map<string, RateUse["projects"]>> {
  if (!actor || !can(actor, "rates")) throw new AppError("forbidden");
  if (memberIds.length === 0) return new Map();
  const now = today();
  const rows = await sql<{ member_id: string; id: string; name: string; mine: string | null; project: string | null }[]>`
    select w.member_id, p.id::text, p.name,
      (select rate_cents::text from rates where kind = 'bill' and project_id = p.id and member_id = w.member_id and from_day <= ${now} order by from_day desc limit 1) as mine,
      (select rate_cents::text from rates where kind = 'bill' and project_id = p.id and member_id is null and from_day <= ${now} order by from_day desc limit 1) as project
    from (select distinct member_id, project_id from entries
          where deleted_at is null and billable and day > ${addDays(now, -90)} and member_id = any(${[...memberIds]}::text[])) w
    join projects p on p.id = w.project_id
    where p.archived_at is null and p.billable
    order by w.member_id, p.name`;
  const out = new Map<string, RateUse["projects"]>();
  for (const r of rows) {
    const source = r.mine !== null ? "person_project" : r.project !== null ? "project" : "own";
    out.set(r.member_id, [...(out.get(r.member_id) ?? []), { id: r.id, name: r.name, source }]);
  }
  return out;
}
