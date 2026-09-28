import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { everyone } from "./directory.ts";
import { plural } from "./i18n/index.ts";
import { notify } from "./notify.ts";
import { openRequests } from "./requests.ts";
import { counts } from "./routing.ts";
import { refreshBadges } from "./tell.ts";

// The weekday morning (schedule "morning", a Proposal of the SDK working
// copy): whoever has requests waiting for their answer for more than two
// days finds one item in their bell — "3 requests wait for your answer" —
// in their own language, replacing yesterday's. Every approver's tile is
// set right too. Idempotent: a run delivered twice sends the same item
// under the same key.
export const reminderAfterDays = 2;

export async function morning(sql: Sql, _run: Run): Promise<void> {
  const dir = await everyone();
  const old = counts(await openRequests(sql, { olderThanDays: reminderAfterDays }), dir);
  for (const [approver, n] of old) {
    await notify([approver], (t, locale) => ({ title: plural(t.bell.reminder, n, locale) }), { path: "/chest/approvals", key: "reminder" });
  }
  await refreshBadges(sql, dir);
}
