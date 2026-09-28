import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { plural } from "./i18n/index.ts";
import { today } from "./model.ts";
import { cut, notify } from "./notify.ts";
import { purgeLeft } from "./profiles.ts";
import { refreshBadges } from "./tell.ts";

// The weekday morning (schedule "morning", a Proposal (studio)): everyone
// with checklist to-dos due today or late finds one item in their bell, in
// their own language, replacing yesterday's; every tile's number is set
// right; profiles of people gone for 30 days are purged. Idempotent: a run
// delivered twice sends the same item again under the same key.
export async function morning(sql: Sql, run: Run): Promise<void> {
  const day = today(new Date(run.scheduledAt), run.timeZone);
  const rows = await sql<{ assignee: string; text: string }[]>`
    select i.assignee, i.text from journey_items i join journeys j on j.id = i.journey_id
    where i.done_at is null and i.removed_at is null and j.stopped_at is null and i.due_on <= ${day} and i.assignee like 'mbr_%'
    order by i.due_on, i.position, i.id limit 5000`;
  const byMember = new Map<string, string[]>();
  for (const r of rows) byMember.set(r.assignee, [...(byMember.get(r.assignee) ?? []), r.text]);
  for (const [member, texts] of byMember) {
    await notify([member], (t, locale) => ({ title: plural(t.bell.digest, texts.length, locale), body: cut(texts.join(" · "), 280) }), { path: "/chest/todo", key: "digest" });
  }
  const holders = (await sql<{ assignee: string }[]>`
    select distinct i.assignee from journey_items i where i.assignee like 'mbr_%' and i.done_at is null limit 5000`).map(r => r.assignee);
  await refreshBadges(sql, holders);
  await purgeLeft(sql);
}
