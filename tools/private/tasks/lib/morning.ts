import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { plural } from "./i18n/index.ts";
import { today } from "./model.ts";
import { badges, cut, notify } from "./notify.ts";
import { urgentCounts } from "./cards.ts";

// The weekday morning (schedule "morning"): everyone with tasks late or due
// today finds one item in their bell — "3 tasks for today" and their
// titles — in their own language; it replaces yesterday's. And every
// tile's number is set right, since dates moved overnight. Idempotent: a
// run delivered twice sends the same item again under the same key.
export async function morning(sql: Sql, run: Run): Promise<void> {
  const day = today(new Date(run.scheduledAt), run.timeZone);
  const rows = await sql<{ member_id: string; title: string; due_on: string }[]>`
    select a.member_id, c.title, to_char(c.due_on, 'YYYY-MM-DD') as due_on
    from card_assignees a join cards c on c.id = a.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    where c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done and c.due_on <= ${day}
    order by c.due_on, c.id`;
  const byMember = new Map<string, string[]>();
  for (const r of rows) byMember.set(r.member_id, [...(byMember.get(r.member_id) ?? []), r.title]);
  for (const [member, titles] of byMember) {
    await notify([member], (t, locale) => ({ title: plural(t.bell.digest, titles.length, locale), body: cut(titles.join(" · "), 280) }), { path: "/chest", key: "digest" });
  }
  // Everyone who holds an open card: their number today (0 clears it).
  const holders = (await sql<{ member_id: string }[]>`
    select distinct a.member_id from card_assignees a join cards c on c.id = a.card_id where c.archived_at is null limit 5000`).map(r => r.member_id);
  await badges(await urgentCounts(sql, holders, day));
}
