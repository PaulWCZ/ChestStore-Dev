import { readerWords, shownTag } from "./seed-words.ts";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { localDay, weekday, workMinutes, type Hours } from "../shared/hours.ts";

// What a support lead is asked every week: how many requests came and
// were closed, how fast the team first answered (in working hours), who
// answered what, which subjects (tags) come back, and what customers
// thought. Requests merged into another count once; spam never.

export type Report = {
  weeks: { start: string; created: number; closed: number; medianFirst: number | null }[];
  total: { created: number; closed: number; open: number; medianFirst: number | null; withinTarget: number | null; good: number; bad: number };
  agents: { id: string; replies: number; closed: number; medianFirst: number | null }[];
  tags: { name: string; created: number; open: number }[];
  channels: { channel: string; created: number }[];
};
export const reportWeeks = [4, 8, 12, 26] as const;

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
};
const monday = (day: string) => new Date(Date.parse(day + "T00:00:00Z") - weekday(day) * 86400000).toISOString().slice(0, 10);

export async function report(sql: Sql, actor: Member | null, options: { weeks: number; hours: Hours; timeZone: string; lateHours: number; now?: Date }): Promise<Report> {
  if (!can(actor, "reports")) throw new AppError("forbidden");
  const weeks = (reportWeeks as readonly number[]).includes(options.weeks) ? options.weeks : 8;
  const now = options.now ?? new Date();
  const firstWeek = new Date(Date.parse(monday(localDay(now, options.timeZone)) + "T00:00:00Z") - (weeks - 1) * 7 * 86400000).toISOString().slice(0, 10);
  const since = new Date(Date.parse(firstWeek + "T00:00:00Z") - 86400000);
  const rows = await sql<{ id: string; created_at: Date; closed_at: Date | null; status: string; assignee: string | null; channel: string; rating: string | null; first_customer: Date | null; first_reply: Date | null; first_author: string | null; tags: string[] | null }[]>`
    select t.id, t.created_at, t.closed_at, t.status, t.assignee, t.channel, t.rating,
      (select min(m.created_at) from messages m where m.ticket_id = t.id and m.kind = 'customer' and not m.auto) as first_customer,
      r.created_at as first_reply, r.author as first_author,
      (select array_agg(g.name) from ticket_tags x join tags g on g.id = x.tag_id where x.ticket_id = t.id) as tags
    from tickets t
    left join lateral (select created_at, author from messages m where m.ticket_id = t.id and m.kind = 'reply' order by created_at, id limit 1) r on true
    where t.status <> 'spam' and t.merged_into is null and (t.created_at >= ${since} or t.closed_at >= ${since})`;
  const inWeek = (d: Date) => {
    const day = monday(localDay(d, options.timeZone));
    return day >= firstWeek ? day : null;
  };
  const weekList = Array.from({ length: weeks }, (_, i) => new Date(Date.parse(firstWeek + "T00:00:00Z") + i * 7 * 86400000).toISOString().slice(0, 10));
  const byWeek = new Map(weekList.map(w => [w, { created: 0, closed: 0, first: [] as number[] }]));
  const agents = new Map<string, { replies: number; closed: number; first: number[] }>();
  const agent = (id: string) => agents.get(id) ?? agents.set(id, { replies: 0, closed: 0, first: [] }).get(id)!;
  const tags = new Map<string, { created: number; open: number }>();
  const channels = new Map<string, number>();
  const total = { created: 0, closed: 0, open: 0, first: [] as number[], good: 0, bad: 0 };
  for (const r of rows) {
    const created = inWeek(r.created_at);
    if (created) {
      const w = byWeek.get(created)!;
      w.created++;
      total.created++;
      channels.set(r.channel, (channels.get(r.channel) ?? 0) + 1);
      if (r.status === "open" || r.status === "waiting") total.open++;
      for (const name of r.tags ?? []) {
        const g = tags.get(name) ?? tags.set(name, { created: 0, open: 0 }).get(name)!;
        g.created++;
        if (r.status === "open") g.open++;
      }
      if (r.first_reply && r.first_customer && r.first_reply > r.first_customer) {
        const minutes = workMinutes(r.first_customer, r.first_reply, options.hours, options.timeZone);
        w.first.push(minutes);
        total.first.push(minutes);
        if (r.first_author?.startsWith("mbr_")) agent(r.first_author).first.push(minutes);
      }
      if (r.rating === "good") total.good++;
      if (r.rating === "bad") total.bad++;
    }
    const closed = r.status === "closed" && r.closed_at ? inWeek(r.closed_at) : null;
    if (closed) {
      byWeek.get(closed)!.closed++;
      total.closed++;
      if (r.assignee) agent(r.assignee).closed++;
    }
  }
  const replies = await sql<{ author: string; n: number }[]>`select author, count(*)::int as n from messages where kind = 'reply' and created_at >= ${new Date(firstWeek + "T00:00:00Z")} and author like 'mbr_%' group by author`;
  for (const r of replies) agent(r.author).replies = r.n;
  const target = options.lateHours * 60;
  return {
    weeks: weekList.map(start => ({ start, created: byWeek.get(start)!.created, closed: byWeek.get(start)!.closed, medianFirst: median(byWeek.get(start)!.first) })),
    total: { created: total.created, closed: total.closed, open: total.open, medianFirst: median(total.first), withinTarget: target > 0 && total.first.length > 0 ? Math.round((100 * total.first.filter(m => m <= target).length) / total.first.length) : null, good: total.good, bad: total.bad },
    agents: [...agents].map(([id, a]) => ({ id, replies: a.replies, closed: a.closed, medianFirst: median(a.first) })).sort((a, b) => b.replies - a.replies || b.closed - a.closed),
    tags: [...tags].map(([name, g]) => ({ name: shownTag(name, readerWords(actor)), ...g })).sort((a, b) => b.created - a.created || a.name.localeCompare(b.name)).slice(0, 20),
    channels: [...channels].map(([channel, created]) => ({ channel, created })).sort((a, b) => b.created - a.created),
  };
}
