import type { Query } from "./db.ts";
import type { Form } from "./forms.ts";

// How far a form reaches: how often its page was opened (form_views, one
// count a form a day — nothing about who), how many of those sent an
// answer, and its answers day by day. The summary shows it.

// countView: one more opening of a form's page today.
export async function countView(sql: Query, formId: string): Promise<void> {
  await sql`insert into form_views (form_id, day, count) values (${formId}, current_date, 1)
    on conflict (form_id, day) do update set count = form_views.count + 1`;
}

export const reachDays = 30;
export type Reach = {
  // Since the first day a view was counted: openings, answers sent, the
  // share that answered (null before any view).
  since: string | null;
  views: number;
  answers: number;
  rate: number | null;
  // The answers of each of the last 30 days, oldest first (null for an
  // anonymous form: a day would say when someone answered).
  days: { day: string; count: number }[] | null;
};

export async function reachOf(sql: Query, form: Pick<Form, "id" | "anonymous">): Promise<Reach> {
  const [seen] = await sql<{ since: string | null; views: number }[]>`
    select min(day)::text as since, coalesce(sum(count), 0)::int as views from form_views where form_id = ${form.id}`;
  const since = seen?.since ?? null;
  const views = seen?.views ?? 0;
  let answers = 0;
  if (since) {
    const [row] = form.anonymous
      ? await sql<{ n: number }[]>`select count(*)::int as n from answers where form_id = ${form.id} and deleted_at is null and month >= date_trunc('month', ${since}::date)`
      : await sql<{ n: number }[]>`select count(*)::int as n from answers where form_id = ${form.id} and deleted_at is null and created_at >= ${since}::date`;
    answers = row?.n ?? 0;
  }
  const days = form.anonymous ? null : await sql<{ day: string; count: number }[]>`
    select d::date::text as day, coalesce(a.count, 0)::int as count
    from generate_series(current_date - ${reachDays - 1}::int, current_date, interval '1 day') d
    left join (
      select created_at::date as day, count(*) as count from answers
      where form_id = ${form.id} and deleted_at is null and created_at >= current_date - ${reachDays - 1}::int
      group by 1
    ) a on a.day = d::date
    order by d`;
  return { since, views, answers, rate: views > 0 && !form.anonymous ? Math.min(100, Math.round((answers / views) * 100)) : null, days: days ? [...days] : null };
}

// The night's cleanup: counts older than a year and a month go.
export async function forgetViews(sql: Query): Promise<void> {
  await sql`delete from form_views where day < current_date - 400`;
}
