import type { Run } from "@argentic/chest-sdk/schedules";
import { roles } from "./access.ts";
import type { Sql } from "./db.ts";
import { addDays, mondayOf, todayIn } from "./days.ts";
import { everyone } from "./directory.ts";
import { format } from "./i18n/index.ts";
import { intl } from "./i18n/format.ts";
import { numeric } from "./model.ts";
import { notify } from "./notify.ts";
import { settings } from "./settings.ts";

// Friday afternoon (schedule "friday", a proposal of the SDK working copy):
// everyone whose week holds fewer hours than the company's threshold finds
// one item in their bell, in their own language — "Your week has 22 h —
// fill in the rest?" — replacing last week's. Off in the settings, it sends
// nothing. Idempotent: a run delivered twice sends the same item again
// under the same key. Without schedules (a Chest that does not run them),
// nothing else in the tool depends on it.
export async function friday(sql: Sql, run: Run): Promise<number> {
  const s = await settings(sql);
  if (!s.reminder.enabled) return 0;
  const day = todayIn(run.timeZone, new Date(run.scheduledAt));
  const monday = mondayOf(day);
  const people = (await everyone()).filter(p => p.role !== null && (roles as readonly string[]).includes(p.role));
  if (people.length === 0) return 0;
  const sums = await sql<{ member_id: string; total: string }[]>`
    select member_id, sum(minutes)::text as total from entries
    where deleted_at is null and day between ${monday} and ${addDays(monday, 6)} and member_id = any(${people.map(p => p.id)}::text[])
    group by member_id`;
  const byTotal = new Map<number, string[]>();
  for (const p of people) {
    const total = numeric(sums.find(r => r.member_id === p.id)?.total);
    if (total >= s.reminder.minutes) continue;
    byTotal.set(total, [...(byTotal.get(total) ?? []), p.id]);
  }
  let told = 0;
  for (const [total, ids] of byTotal) {
    await notify(ids, (t, locale) => ({
      title: total === 0 ? t.bell.emptyWeek : format(t.bell.shortWeek, { hours: new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1 }).format(total / 60) }),
    }), { path: "/chest", key: "week" });
    told += ids.length;
  }
  return told;
}
