import { chest } from "@argentic/chest-sdk/chest";
import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { plural } from "../i18n/index.ts";
import { badges, cut, notify } from "./notify.ts";
import { reconcile } from "./step-calendar.ts";
import { urgentCounts } from "./steps.ts";

// The weekday morning (schedule "morning", chest.proposals.json): everyone
// with next steps late or due today finds one item in their bell — "3 next
// steps for today" and what they are — in their own language; it replaces
// yesterday's. Every tile's number is set right (dates moved overnight),
// and what people removed more than a day ago is purged. Idempotent: a run
// delivered twice sends the same item again under the same key.
export async function morning(sql: Sql, run: Run): Promise<void> {
  const day = chest.todayIn(chest.timeZone, new Date(run.scheduledAt));
  const rows = await sql<{ owner: string; text: string }[]>`
    select owner, text from steps where done_at is null and owner like 'mbr_%' and due_on <= ${day} order by due_on, id`;
  const byOwner = new Map<string, string[]>();
  for (const r of rows) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r.text]);
  for (const [owner, texts] of byOwner) {
    await notify([owner], (t, locale) => ({ title: plural(t.bell.digest, texts.length, locale), body: cut(texts.join(" · "), 280) }), { path: "/chest", key: "digest" });
  }
  // Everyone who holds an open step: their number today (0 clears it).
  const holders = (await sql<{ owner: string }[]>`select distinct owner from steps where done_at is null and owner like 'mbr_%' limit 5000`).map(r => r.owner);
  await badges(await urgentCounts(sql, holders, day));
  await sql`delete from activities where removed_at < now() - interval '1 day'`;
  // The calendars caught up with anything a change did not publish.
  await reconcile(sql);
}
