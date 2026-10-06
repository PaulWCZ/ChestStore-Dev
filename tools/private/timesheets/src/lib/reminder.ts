import type { Run } from "@argentic/chest-sdk/schedules";
import { roles } from "./access.ts";
import type { Sql } from "./db.ts";
import { addDays, mondayOf, todayIn } from "../shared/days.ts";
import { zone } from "./clock.ts";
import { everyone } from "./directory.ts";
import { decimal, format, type Catalogue } from "../i18n/index.ts";
import { email } from "./mail.ts";
import { numeric } from "../shared/model.ts";
import { notify } from "./notify.ts";
import { settings } from "./settings.ts";
import { capacities, startWeeks } from "./weeks.ts";

// Friday afternoon (schedule "friday" of chest.json, read on the Chest's
// clock — the day is the Chest's, src/lib/clock.ts):
// everyone whose week holds fewer hours than their usual week (the
// company's, or theirs on the People page) and who has not sent it yet
// finds one item in their bell, in their own language — "Your week has 22 h —
// fill in the rest?" — replacing last week's. Nobody is reminded of a week
// before their start in the tool (an empty tool expects nothing). Off in the settings, it sends
// nothing. Idempotent: a run delivered twice sends the same item again
// under the same key; the email goes once (its key). Nothing else in the tool
// depends on it.
export async function friday(sql: Sql, run: Run): Promise<number> {
  const s = await settings(sql);
  if (!s.reminder.enabled) return 0;
  const day = todayIn(zone(), new Date(run.scheduledAt));
  const monday = mondayOf(day);
  const people = (await everyone()).filter(p => p.role !== null && (roles as readonly string[]).includes(p.role));
  if (people.length === 0) return 0;
  const sums = await sql<{ member_id: string; total: string }[]>`
    select member_id, sum(minutes)::text as total from entries
    where deleted_at is null and day between ${monday} and ${addDays(monday, 6)} and member_id = any(${people.map(p => p.id)}::text[])
    group by member_id`;
  const [caps, starts, sent] = await Promise.all([
    capacities(sql, people.map(p => p.id)),
    // Nothing is expected before a person's start (or of anyone on a tool
    // with no project nor entry yet), as on the Team page and its Remind.
    startWeeks(sql, people.map(p => p.id)),
    sql<{ member_id: string }[]>`select member_id from weeks where week = ${monday} and status in ('submitted', 'approved')`,
  ]);
  const byTotal = new Map<number, string[]>();
  for (const p of people) {
    const total = numeric(sums.find(r => r.member_id === p.id)?.total);
    const start = starts.get(p.id) ?? null;
    if (start === null || start > monday) continue;
    if (total >= (caps.get(p.id) ?? s.reminder.minutes) || sent.some(r => r.member_id === p.id)) continue;
    byTotal.set(total, [...(byTotal.get(total) ?? []), p.id]);
  }
  let told = 0;
  for (const [total, ids] of byTotal) {
    const title = (t: Catalogue, locale: string) => total === 0 ? t.bell.emptyWeek : format(t.bell.shortWeek, { hours: decimal(total / 60, locale, 1) });
    await notify(ids, (t, locale) => ({ title: title(t, locale) }), { path: "/chest", key: "week" });
    // By email too (the mail proposal), once for this week whatever the retries.
    await email(ids, (t, locale) => ({ subject: title(t, locale), lines: [t.mail.fridayLine] }), { path: "/chest", key: `friday:${monday}` });
    told += ids.length;
  }
  return told;
}
