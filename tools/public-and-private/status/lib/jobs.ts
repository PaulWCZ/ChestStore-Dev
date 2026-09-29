import type { Sql } from "./db.ts";
import { catalogue, isLocale } from "./i18n/index.ts";
import { autoPost } from "./incidents.ts";
import { purge } from "./checks.ts";
import { flush } from "./mailer.ts";

// The work that runs by itself: the automatic posts of maintenance windows
// that started or ended, and the emails still waiting, the check results older than 90 days, and
// the heartbeats that fell silent. The "updates"
// schedule (Proposal (studio), every 15 minutes: the Chest runs nothing
// more often) calls it; so does every visit of an editor, so a Chest
// without schedules still gets it done, at the next visit. The page never
// waits for it: what is in maintenance is read from the clock.
export async function pass(sql: Sql, now = new Date(), mailLimit = 200): Promise<{ posted: number; sent: number; purged: number }> {
  const posted = await autoPost(sql, language => catalogue(isLocale(language) ? language : "en").auto, now);
  const { sent } = await flush(sql, { limit: mailLimit, now });
  // Check results are kept 90 days.
  const purged = await purge(sql, now);
  return { posted: posted.length, sent, purged };
}
