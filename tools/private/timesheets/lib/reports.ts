import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { addDays, daysBetween, isDay, mondayOf } from "./days.ts";
import { isColor, limits, memberPattern, numeric, optionalId, type Color } from "./model.ts";
import { billRateOf, costOf, costRateOf, revenueOf } from "./rates.ts";

// Where the time went, over a period: totals, billable or not, amounts at
// the rates in force on each entry's day, what the time cost and the margin
// (managers), a bar per day (per week beyond two months), and a line per
// project, client, person or task. A manager sees everyone's; a member only
// their own — the scope is in the query, never in the page. Amounts and
// costs are computed for managers only.

export const groups = ["project", "client", "person", "task"] as const;
export type GroupBy = (typeof groups)[number];
export const isGroup = (value: unknown): value is GroupBy => typeof value === "string" && (groups as readonly string[]).includes(value);
export const billableFilters = ["all", "billable", "non", "uninvoiced"] as const;
export type BillableFilter = (typeof billableFilters)[number];

// `q`: words the entries' notes hold ("Repérage au parc"), case aside,
// 2 to 100 characters.
export type ReportQuery = { from: unknown; to: unknown; group?: unknown; person?: unknown; projectId?: unknown; clientId?: unknown; billable?: unknown; q?: unknown };
export type Line = {
  key: string;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  taskName: string | null;
  memberId: string | null;
  color: Color | null;
  minutes: number;
  billableMinutes: number;
  cents: number;
  costCents: number;
  budget: { kind: "hours" | "money"; used: number; of: number } | null;
};
export type Bar = { day: string; billable: number; other: number };
export type Report = {
  from: string;
  to: string;
  group: GroupBy;
  unit: "day" | "week";
  minutes: number;
  billableMinutes: number;
  cents: number;
  costCents: number;
  bars: Bar[];
  lines: Line[];
  // Whether amounts, costs exist at all (some rate was ever given).
  priced: boolean;
  costed: boolean;
  // Billable entries without a note (a client's invoice needs one).
  unnoted: number;
  // Billable entries not invoiced yet, in the period (managers).
  uninvoiced: number;
};

export type Scope = { from: string; to: string; group: GroupBy; person: string | null; projectId: string | null; clientId: string | null; billable: BillableFilter; q: string | null };

// The words searched in the notes, or null (fewer than 2 characters).
export function searchWords(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim().slice(0, 100);
  return text.length >= 2 ? text : null;
}
const like = (text: string) => "%" + text.replace(/[\\%_]/gu, m => "\\" + m) + "%";

export function scope(actor: Member | null, q: ReportQuery): Scope {
  if (!actor || !can(actor, "time.own")) throw new AppError("forbidden");
  if (!isDay(q.from) || !isDay(q.to) || q.from > q.to || daysBetween(q.from, q.to) >= limits.reportDays) throw new AppError("bad_period");
  let person: string | null = null;
  if (!can(actor, "reports.all")) person = actor.id;
  else if (typeof q.person === "string" && (memberPattern.test(q.person) || q.person === "erased" || /^imp_[1-9][0-9]{0,17}$/u.test(q.person))) person = q.person;
  else if (q.person !== undefined && q.person !== null && q.person !== "") throw new AppError("invalid");
  const billable = (billableFilters as readonly unknown[]).includes(q.billable) ? q.billable as BillableFilter : "all";
  return { from: q.from, to: q.to, group: isGroup(q.group) ? q.group : "project", person, projectId: optionalId(q.projectId), clientId: optionalId(q.clientId), billable, q: searchWords(q.q) };
}

export function where(sql: Query, s: Scope) {
  return sql`
    e.deleted_at is null and e.day between ${s.from} and ${s.to}
    ${s.person ? sql`and e.member_id = ${s.person}` : sql``}
    ${s.projectId ? sql`and e.project_id = ${s.projectId}` : sql``}
    ${s.clientId ? sql`and p.client_id = ${s.clientId}` : sql``}
    ${s.q ? sql`and e.note ilike ${like(s.q)}` : sql``}
    ${s.billable === "billable" ? sql`and e.billable` : s.billable === "non" ? sql`and not e.billable` : s.billable === "uninvoiced" ? sql`and e.billable and e.invoiced_at is null` : sql``}`;
}

export async function report(sql: Query, actor: Member | null, q: ReportQuery): Promise<Report> {
  const s = scope(actor, q);
  // Members never see money: nothing of it is even computed for them.
  const money = can(actor, "reports.all") ? revenueOf : (x: Query) => x`'0'`;
  const cost = can(actor, "reports.all") ? costOf : (x: Query) => x`'0'`;
  const unit: "day" | "week" = daysBetween(s.from, s.to) > 62 ? "week" : "day";
  const bucket = unit === "day" ? sql`to_char(e.day, 'YYYY-MM-DD')` : sql`to_char(date_trunc('week', e.day)::date, 'YYYY-MM-DD')`;
  const key = s.group === "project" ? sql`e.project_id::text` : s.group === "client" ? sql`coalesce(p.client_id, 0)::text` : s.group === "person" ? sql`e.member_id` : sql`e.project_id::text || ':' || coalesce(e.task_id, 0)::text`;
  const [totals, byDay, lines, known] = await Promise.all([
    sql<{ minutes: string; billable: string; cents: string; cost: string; unnoted: number; uninvoiced: number }[]>`
      select coalesce(sum(e.minutes), 0)::text as minutes, coalesce(sum(e.minutes) filter (where e.billable), 0)::text as billable, ${money(sql)} as cents, ${cost(sql)} as cost,
        count(*) filter (where e.billable and e.note = '')::int as unnoted, count(*) filter (where e.billable and e.invoiced_at is null)::int as uninvoiced
      from entries e join projects p on p.id = e.project_id where ${where(sql, s)}`,
    sql<{ bucket: string; billable: string; other: string }[]>`
      select ${bucket} as bucket, coalesce(sum(e.minutes) filter (where e.billable), 0)::text as billable, coalesce(sum(e.minutes) filter (where not e.billable), 0)::text as other
      from entries e join projects p on p.id = e.project_id where ${where(sql, s)} group by 1`,
    sql<{ key: string; project_id: string | null; project_name: string | null; client_id: string | null; client_name: string | null; task_name: string | null; member_id: string | null; color: string | null; minutes: string; billable: string; cents: string; cost: string }[]>`
      select ${key} as key,
        ${s.group === "project" || s.group === "task" ? sql`min(p.id)::text` : sql`null`} as project_id,
        ${s.group === "project" || s.group === "task" ? sql`min(p.name)` : sql`null`} as project_name,
        ${s.group === "person" ? sql`null` : sql`min(c.id)::text`} as client_id,
        ${s.group === "person" ? sql`null` : sql`min(c.name)`} as client_name,
        ${s.group === "task" ? sql`min(t.name)` : sql`null`} as task_name,
        ${s.group === "person" ? sql`min(e.member_id)` : sql`null`} as member_id,
        ${s.group === "project" || s.group === "task" ? sql`min(p.color)` : sql`null`} as color,
        sum(e.minutes)::text as minutes, coalesce(sum(e.minutes) filter (where e.billable), 0)::text as billable, ${money(sql)} as cents, ${cost(sql)} as cost
      from entries e join projects p on p.id = e.project_id left join clients c on c.id = p.client_id left join tasks t on t.id = e.task_id
      where ${where(sql, s)} group by 1 order by sum(e.minutes) desc limit 500`,
    sql<{ bill: boolean; cost: boolean }[]>`
      select exists (select 1 from rates where kind = 'bill' and rate_cents is not null) or exists (select 1 from entries where rates_fixed and bill_rate_cents is not null) as bill,
        exists (select 1 from rates where kind = 'cost' and rate_cents is not null) or exists (select 1 from entries where rates_fixed and cost_rate_cents is not null) as cost`,
  ]);
  // Budgets of the projects shown: what they used in all (not only this period).
  const budgets = new Map<string, Line["budget"]>();
  if (s.group === "project" && lines.length) {
    const rows = await sql<{ id: string; budget_kind: string; budget_minutes: number | null; budget_cents: string | null; minutes: string; cents: string }[]>`
      select p.id::text, p.budget_kind, p.budget_minutes, p.budget_cents::text,
        (select coalesce(sum(e.minutes), 0) from entries e where e.project_id = p.id and e.deleted_at is null)::text as minutes,
        (select ${revenueOf(sql)} from entries e where e.project_id = p.id and e.deleted_at is null) as cents
      from projects p where p.id = any(${lines.map(l => l.key)}::bigint[]) and p.budget_kind <> 'none'`;
    for (const r of rows) {
      budgets.set(r.id, r.budget_kind === "hours" ? { kind: "hours", used: numeric(r.minutes), of: r.budget_minutes ?? 0 } : { kind: "money", used: Math.round(numeric(r.cents)), of: numeric(r.budget_cents) });
    }
  }
  const bars: Bar[] = [];
  const first = unit === "day" ? s.from : mondayOf(s.from);
  for (let d = first; d <= s.to; d = addDays(d, unit === "day" ? 1 : 7)) {
    const found = byDay.find(b => b.bucket === d);
    bars.push({ day: d, billable: numeric(found?.billable), other: numeric(found?.other) });
  }
  const t = totals[0];
  return {
    from: s.from,
    to: s.to,
    group: s.group,
    unit,
    minutes: numeric(t?.minutes),
    billableMinutes: numeric(t?.billable),
    cents: Math.round(numeric(t?.cents)),
    costCents: Math.round(numeric(t?.cost)),
    bars,
    priced: can(actor, "reports.all") && (known[0]?.bill ?? false),
    costed: can(actor, "reports.all") && (known[0]?.cost ?? false),
    unnoted: t?.unnoted ?? 0,
    uninvoiced: can(actor, "reports.all") ? t?.uninvoiced ?? 0 : 0,
    lines: lines.map(l => ({
      key: l.key,
      projectId: l.project_id,
      projectName: l.project_name,
      clientId: l.client_id,
      clientName: l.client_name,
      taskName: l.task_name,
      memberId: l.member_id,
      color: isColor(l.color) ? l.color : null,
      minutes: numeric(l.minutes),
      billableMinutes: numeric(l.billable),
      cents: Math.round(numeric(l.cents)),
      costCents: Math.round(numeric(l.cost)),
      budget: budgets.get(l.key) ?? null,
    })),
  };
}

// The detailed rows of a report, for its CSV: every entry of the period in
// scope, oldest first.
export type ExportRow = {
  day: string; memberId: string; clientName: string | null; projectName: string; taskName: string | null; note: string;
  minutes: number; billable: boolean; rateCents: number | null; cents: number; costRateCents: number | null; costCents: number;
  invoiced: boolean; startedAt: string | null; endedAt: string | null;
};

export async function exportRows(sql: Query, actor: Member | null, q: ReportQuery): Promise<ExportRow[]> {
  const s = scope(actor, q);
  const managers = can(actor, "reports.all");
  const rows = await sql<{ day: string; member_id: string; client_name: string | null; project_name: string; task_name: string | null; note: string; minutes: number; billable: boolean; rate_cents: string | null; cost_cents: string | null; invoiced: boolean; started_at: Date | null; ended_at: Date | null }[]>`
    select to_char(e.day, 'YYYY-MM-DD') as day, e.member_id, c.name as client_name, p.name as project_name, t.name as task_name, e.note, e.minutes, e.billable,
      ${managers ? sql`${billRateOf(sql)}::text` : sql`null`} as rate_cents, ${managers ? sql`${costRateOf(sql)}::text` : sql`null`} as cost_cents,
      e.invoiced_at is not null as invoiced, e.started_at, e.ended_at
    from entries e join projects p on p.id = e.project_id left join clients c on c.id = p.client_id left join tasks t on t.id = e.task_id
    where ${where(sql, s)} order by e.day, e.started_at nulls last, e.id limit 100000`;
  return rows.map(r => {
    const rate = r.rate_cents === null ? null : Number(r.rate_cents);
    const costRate = r.cost_cents === null ? null : Number(r.cost_cents);
    return {
      day: r.day, memberId: r.member_id, clientName: r.client_name, projectName: r.project_name, taskName: r.task_name, note: r.note, minutes: r.minutes, billable: r.billable,
      rateCents: r.billable ? rate : null, cents: r.billable && rate !== null ? Math.round((r.minutes * rate) / 60) : 0,
      costRateCents: costRate, costCents: costRate === null ? 0 : Math.round((r.minutes * costRate) / 60), invoiced: r.invoiced,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null, endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    };
  });
}

// The people a manager may pick in a report: whoever has time recorded.
export async function reportPeople(sql: Query, actor: Member | null): Promise<string[]> {
  if (!can(actor, "reports.all")) return actor ? [actor.id] : [];
  return (await sql<{ member_id: string }[]>`select distinct member_id from entries where deleted_at is null order by member_id limit 2000`).map(r => r.member_id);
}

// The entries a search of the notes found (the report shows them, newest
// first, 100 at most; the CSV has them all).
export type Found = { id: string; day: string; memberId: string; projectName: string; clientName: string | null; taskName: string | null; color: Color | null; note: string; minutes: number };
export const foundLimit = 100;

export async function foundEntries(sql: Query, actor: Member | null, q: ReportQuery): Promise<Found[]> {
  const s = scope(actor, q);
  if (!s.q) return [];
  const rows = await sql<{ id: string; day: string; member_id: string; project_name: string; client_name: string | null; task_name: string | null; color: string; note: string; minutes: number }[]>`
    select e.id::text, to_char(e.day, 'YYYY-MM-DD') as day, e.member_id, p.name as project_name, c.name as client_name, t.name as task_name, p.color, e.note, e.minutes
    from entries e join projects p on p.id = e.project_id left join clients c on c.id = p.client_id left join tasks t on t.id = e.task_id
    where ${where(sql, s)} order by e.day desc, e.id desc limit ${foundLimit}`;
  return rows.map(r => ({ id: r.id, day: r.day, memberId: r.member_id, projectName: r.project_name, clientName: r.client_name, taskName: r.task_name, color: isColor(r.color) ? r.color : null, note: r.note, minutes: r.minutes }));
}
