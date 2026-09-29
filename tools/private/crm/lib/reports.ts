import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { monthOf, today } from "./model.ts";

// The team's numbers, for the manager's weekly look (Team): each person's
// open pipeline and the next steps that slip; won and lost per person, month
// by month; what the pipeline should bring, by expected close month; why
// deals are lost. Everyone who reads the deals reads these: they are the
// deals, added up.

export type OwnerLine = { owner: string | null; open: number; value: number; weighted: number; noStep: number; late: number };
export type MonthLine = { owner: string | null; month: string; won: number; wonValue: number; lost: number; lostValue: number };
export type CloseLine = { month: string | "late" | "none"; count: number; value: number; weighted: number };
export type ReasonLine = { reason: string; count: number; value: number };
export type Report = { months: string[]; owners: OwnerLine[]; results: MonthLine[]; closing: CloseLine[]; reasons: ReasonLine[] };

// The first days of the n months ending with this one, oldest first.
export function lastMonths(now: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(now.slice(0, 8) + "01T00:00:00Z");
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d);
    m.setUTCMonth(d.getUTCMonth() - i);
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}
function nextMonths(now: string, n: number): string[] {
  const d = new Date(now.slice(0, 8) + "01T00:00:00Z");
  return Array.from({ length: n }, (_, i) => { const m = new Date(d); m.setUTCMonth(d.getUTCMonth() + i); return m.toISOString().slice(0, 7); });
}

export async function teamReport(sql: Sql, actor: Member | null, now = today(), months = 6): Promise<Report> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const shown = lastMonths(now, months);
  const since = shown[0] + "-01";
  const owners = await sql<{ owner: string | null; open: number; value: string | null; weighted: string | null; no_step: number; late: number }[]>`
    select d.owner, count(*)::int as open, sum(d.value_cents) as value, sum(round(d.value_cents * s.probability / 100.0)) as weighted,
      count(*) filter (where not exists (select 1 from steps p where p.deal_id = d.id and p.done_at is null))::int as no_step,
      count(*) filter (where exists (select 1 from steps p where p.deal_id = d.id and p.done_at is null and p.due_on < ${now}))::int as late
    from deals d join stages s on s.id = d.stage_id
    where s.kind = 'open'
    group by d.owner
    order by sum(d.value_cents) desc nulls last`;
  const results = await sql<{ owner: string | null; month: string; kind: "won" | "lost"; n: number; value: string | null }[]>`
    select d.owner, to_char((d.closed_at at time zone 'Europe/Paris')::date, 'YYYY-MM') as month, s.kind, count(*)::int as n, sum(d.value_cents) as value
    from deals d join stages s on s.id = d.stage_id
    where s.kind in ('won', 'lost') and d.closed_at is not null and (d.closed_at at time zone 'Europe/Paris')::date >= ${since}
    group by d.owner, month, s.kind`;
  const byKey = new Map<string, MonthLine>();
  for (const r of results) {
    const k = `${r.owner ?? ""}|${r.month}`;
    const line = byKey.get(k) ?? { owner: r.owner, month: r.month, won: 0, wonValue: 0, lost: 0, lostValue: 0 };
    if (r.kind === "won") { line.won = r.n; line.wonValue = Number(r.value ?? 0); } else { line.lost = r.n; line.lostValue = Number(r.value ?? 0); }
    byKey.set(k, line);
  }
  const ahead = nextMonths(now, 6);
  const closingRows = await sql<{ bucket: string; n: number; value: string | null; weighted: string | null }[]>`
    select case when d.expected_close is null then 'none'
                when d.expected_close < ${monthOf(now).first} then 'late'
                when to_char(d.expected_close, 'YYYY-MM') > ${ahead[ahead.length - 1]!} then 'later'
                else to_char(d.expected_close, 'YYYY-MM') end as bucket,
      count(*)::int as n, sum(d.value_cents) as value, sum(round(d.value_cents * s.probability / 100.0)) as weighted
    from deals d join stages s on s.id = d.stage_id
    where s.kind = 'open'
    group by bucket`;
  const bucket = (b: string): CloseLine => {
    const r = closingRows.find(x => x.bucket === b);
    return { month: b, count: r?.n ?? 0, value: Number(r?.value ?? 0), weighted: Number(r?.weighted ?? 0) };
  };
  const closing = [bucket("late"), ...ahead.map(bucket), bucket("later"), bucket("none")];
  const reasons = await sql<{ reason: string; n: number; value: string | null }[]>`
    select min(trim(d.reason)) as reason, count(*)::int as n, sum(d.value_cents) as value
    from deals d join stages s on s.id = d.stage_id
    where s.kind = 'lost' and d.closed_at > now() - interval '12 months'
    group by crm_fold(trim(d.reason))
    order by count(*) desc, sum(d.value_cents) desc nulls last
    limit 10`;
  return {
    months: shown,
    owners: owners.map(o => ({ owner: o.owner, open: o.open, value: Number(o.value ?? 0), weighted: Number(o.weighted ?? 0), noStep: o.no_step, late: o.late })),
    results: [...byKey.values()],
    closing,
    reasons: reasons.map(r => ({ reason: r.reason, count: r.n, value: Number(r.value ?? 0) })),
  };
}

// The team's home for someone who reads (a viewer): the open pipeline by
// stage, what was won this month and the latest wins.
export async function teamPipeline(sql: Sql, actor: Member | null): Promise<{ stages: { stageId: string; count: number; value: number }[]; recentWins: { id: string; title: string; company: string | null; value: number; owner: string | null; closedAt: string }[] }> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const stages = await sql<{ stage_id: string; n: number; value: string | null }[]>`
    select d.stage_id, count(*)::int as n, sum(d.value_cents) as value from deals d join stages s on s.id = d.stage_id where s.kind = 'open' group by d.stage_id`;
  const wins = await sql<{ id: string; title: string; company: string | null; value_cents: string; owner: string | null; closed_at: Date }[]>`
    select d.id, d.title, o.name as company, d.value_cents, d.owner, d.closed_at from deals d join stages s on s.id = d.stage_id left join companies o on o.id = d.company_id
    where s.kind = 'won' and d.closed_at is not null order by d.closed_at desc limit 5`;
  return {
    stages: stages.map(r => ({ stageId: String(r.stage_id), count: r.n, value: Number(r.value ?? 0) })),
    recentWins: wins.map(w => ({ id: String(w.id), title: w.title, company: w.company, value: Number(w.value_cents), owner: w.owner, closedAt: w.closed_at.toISOString() })),
  };
}
