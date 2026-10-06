import type { Query } from "./db.ts";

// What the desk and the lists show changing, in one short mark: the
// documents (their count and last change: a draft saved, a quote sent or
// answered online, an invoice issued, sent or reminded, one dropped or
// brought back), the payments (recorded, taken back, restored), the
// clients' names, and the day (what is overdue or expired moves with it).
// A refresh (the package's useAutoRefresh) whose page has this mark gets a
// 304 before anything is rendered (page(…, { version })): one small query
// in place of a page.
export async function listStamp(sql: Query, today: string): Promise<string> {
  const [row] = await sql<{ d: string; p: string; c: string }[]>`
    select
      (select count(*) || '.' || coalesce(extract(epoch from max(updated_at))::text, '') from documents) as d,
      (select count(*) filter (where deleted_at is null) || '.' || coalesce(max(id), 0) || '.' || coalesce(extract(epoch from max(deleted_at))::text, '') from payments) as p,
      (select coalesce(extract(epoch from max(updated_at))::text, '') from clients) as c`;
  return `${today}|${row!.d}|${row!.p}|${row!.c}`;
}
