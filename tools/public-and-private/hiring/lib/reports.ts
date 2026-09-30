import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { id, type RejectReason, type StagePreset } from "./model.ts";

// Counts a recruiter reads to see how hiring goes, for one job or all:
// where candidates come from, how far they get, why they stop, how long
// a hire takes. Counts only — no person is scored here.

export type Report = {
  total: number;
  active: number;
  hired: number;
  rejected: number;
  sources: { source: string; count: number }[];
  // Per stage of the job (one job only): how many reached it.
  funnel: { id: string; name: string | null; preset: StagePreset | null; reached: number }[];
  reasons: { reason: RejectReason; count: number }[];
  // Days from application to hire: the median and each hire's.
  daysToHire: number | null;
  hires: number;
  // Applications per month, the last six months (oldest first).
  months: { month: string; count: number }[];
};

export async function report(sql: Sql, actor: Member | null, jobId?: unknown, now = new Date()): Promise<Report> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const key = jobId === undefined || jobId === null || jobId === "" ? null : id(jobId);
  if (key) {
    const [exists] = await sql<{ id: string }[]>`select id from jobs where id = ${key}`;
    if (!exists) throw new AppError("not_found");
  }
  const scope = key ? sql`c.job_id = ${key}` : sql`true`;
  const [counts] = await sql<{ total: number; active: number; rejected: number; hired: number }[]>`
    select count(*)::int as total,
      count(*) filter (where c.status = 'active')::int as active,
      count(*) filter (where c.status = 'rejected')::int as rejected,
      count(*) filter (where c.status = 'active' and s.hired)::int as hired
    from candidates c join stages s on s.id = c.stage_id where ${scope}`;
  const sources = await sql<{ source: string; count: number }[]>`select c.source, count(*)::int as count from candidates c where ${scope} group by c.source order by count desc, c.source`;
  const reasons = await sql<{ reason: RejectReason; count: number }[]>`select c.reject_reason as reason, count(*)::int as count from candidates c where ${scope} and c.status = 'rejected' and c.reject_reason is not null group by c.reject_reason order by count desc, c.reject_reason`;
  // A hire: the time its candidate entered the hired stage (the stage's
  // entry for those still there).
  const hires = await sql<{ days: number }[]>`
    select greatest(0, extract(epoch from c.stage_entered_at - c.created_at) / 86400)::float as days
    from candidates c join stages s on s.id = c.stage_id where ${scope} and c.status = 'active' and s.hired`;
  const days = hires.map(h => h.days).sort((a, b) => a - b);
  const median = days.length === 0 ? null : Math.round(days.length % 2 ? days[(days.length - 1) / 2]! : (days[days.length / 2 - 1]! + days[days.length / 2]!) / 2);
  // Months are the company's: an application at 23:30 on 31 October in
  // the Chest's zone counts for October, whatever UTC says.
  const zone = chest.timeZone;
  const [year, month] = chest.today(now).split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 1 - 5, 1));
  const monthly = await sql<{ month: string; count: number }[]>`
    select to_char(date_trunc('month', c.created_at at time zone ${zone}), 'YYYY-MM') as month, count(*)::int as count
    from candidates c where ${scope} and c.created_at >= (${start.toISOString().slice(0, 10)}::date::timestamp at time zone ${zone}) group by 1`;
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
    return { month: m, count: monthly.find(x => x.month === m)?.count ?? 0 };
  });
  let funnel: Report["funnel"] = [];
  if (key) {
    // How far each candidate got: the furthest of their stage now and the
    // stages they were moved into (the history keeps the stage's id since
    // this version, its name before).
    const stages = await sql<{ id: string; name: string | null; preset: StagePreset | null; position: number }[]>`select id, name, preset, position from stages where job_id = ${key} order by position, id`;
    const furthest = await sql<{ position: number }[]>`
      select greatest(s.position, coalesce((
        select max(t.position) from activity a join stages t on t.job_id = c.job_id
          and (t.id::text = a.data->>'toId' or (a.data->>'toId' is null and t.name = a.data->>'to'))
        where a.candidate_id = c.id and a.kind = 'moved'), 0)) as position
      from candidates c join stages s on s.id = c.stage_id where c.job_id = ${key}`;
    funnel = stages.map(s => ({ id: String(s.id), name: s.name, preset: s.preset, reached: furthest.filter(f => f.position >= s.position).length }));
  }
  return { total: counts?.total ?? 0, active: counts?.active ?? 0, rejected: counts?.rejected ?? 0, hired: counts?.hired ?? 0, sources: sources.map(x => ({ source: x.source, count: x.count })), funnel, reasons: reasons.map(x => ({ reason: x.reason, count: x.count })), daysToHire: median, hires: days.length, months };
}
