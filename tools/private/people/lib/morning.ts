import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { stepText } from "./examples.ts";
import { purgeFields } from "./fields.ts";
import { format, formatDay, plural } from "./i18n/index.ts";
import { purgeJournal } from "./journal.ts";
import { today } from "./model.ts";
import { cut, notify } from "./notify.ts";
import { purgeArrivals } from "./arrivals.ts";
import { purgeAway } from "./away.ts";
import { everyone, people } from "./people.ts";
import { purgeLeft } from "./profiles.ts";
import { purgeRecords, upcoming } from "./records.ts";
import { refreshBadges } from "./tell.ts";

// The weekday morning (schedule "morning", a Proposal (studio)): everyone
// with checklist to-dos due today or late finds one item in their bell, in
// their own language, replacing yesterday's; HR hears of trial periods and
// contracts about to end; every tile's number is set right; profiles of
// people gone for 30 days are purged, leaves told by Leave once past,
// records five years after the person left, the journal after two years.
// Idempotent: a run delivered twice sends the same items again under the
// same keys.
export async function morning(sql: Sql, run: Run): Promise<void> {
  const day = today(new Date(run.scheduledAt), run.timeZone);
  const rows = await sql<{ assignee: string; text: string; phrase: string | null }[]>`
    select i.assignee, i.text, i.phrase from journey_items i join journeys j on j.id = i.journey_id
    where i.done_at is null and i.removed_at is null and j.stopped_at is null and i.due_on <= ${day} and i.assignee like 'mbr_%'
    order by i.due_on, i.position, i.id limit 5000`;
  const byMember = new Map<string, { text: string; phrase: string | null }[]>();
  for (const r of rows) byMember.set(r.assignee, [...(byMember.get(r.assignee) ?? []), r]);
  for (const [member, steps] of byMember) {
    await notify([member], (t, locale) => ({ title: plural(t.bell.digest, steps.length, locale), body: cut(steps.map(s => stepText(s, t)).join(" · "), 280) }), { path: "/chest/todo", key: "digest" });
  }
  await endings(sql, day);
  const holders = (await sql<{ assignee: string }[]>`
    select distinct i.assignee from journey_items i where i.assignee like 'mbr_%' and i.done_at is null limit 5000`).map(r => r.assignee);
  await refreshBadges(sql, holders);
  await purgeLeft(sql);
  await purgeArrivals(sql, day);
  await purgeAway(sql, day);
  await purgeRecords(sql, day);
  await purgeFields(sql);
  await purgeJournal(sql);
}

// "Hugo Bernard's trial period ends on 12 October": one item per record and
// ending, for HR, in their language — two weeks before a trial period ends,
// a month before a contract does.
export async function endings(sql: Sql, day: string): Promise<void> {
  const soon = await upcoming(sql, day);
  if (soon.length === 0) return;
  const hr = (await everyone({ role: "hr" })).people.map(p => p.id);
  const names = await people(soon.flatMap(s => (s.memberId ? [s.memberId] : [])));
  for (const s of soon) {
    const name = (s.memberId ? names.get(s.memberId)?.name : "") || s.legalName;
    await notify(hr, (t, locale) => ({
      title: cut(format(s.what === "trial" ? t.bell.ending.trial : t.bell.ending.contract, { name, date: formatDay(s.day, locale, { day: "numeric", month: "long" }) }), 80),
      body: t.bell.ending.body,
    }), { path: `/chest/records/${s.id}`, key: `record:${s.id}:${s.what}:${s.day}` });
  }
}
