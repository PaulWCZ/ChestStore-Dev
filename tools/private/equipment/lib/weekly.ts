import { chest } from "@argentic/chest-sdk/chest";
import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { purgeDepartures } from "./departures.ts";
import { endingSoon } from "./items.ts";
import { endingSoon as tellEnding, refreshBadges } from "./tell.ts";

// Monday morning (schedule "weekly", a proposal of the SDK working copy):
// the managers find one item in their bell — "3 warranties or renewals end
// soon" and their names — replacing last week's; and their tile's number is
// set right; departures long past are forgotten. The home page shows the same list at any time, so the tool is
// complete without schedules. Idempotent: a run delivered twice sends the
// same item under the same key.
export async function weekly(sql: Sql, run: Run): Promise<void> {
  const day = chest.todayIn(run.timeZone, new Date(run.scheduledAt));
  const items = await endingSoon(sql, day);
  const upcoming = items.filter(i => (i.warrantyUntil !== null && i.warrantyUntil >= day) || (i.renewsOn !== null && i.renewsOn >= day));
  await tellEnding(upcoming.map(i => `${i.name} (${i.tag})`));
  await refreshBadges(sql);
  await purgeDepartures(sql, day);
}
