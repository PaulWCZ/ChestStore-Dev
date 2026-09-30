import { chest } from "@argentic/chest-sdk/chest";
import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { archiveLocale, followUp } from "../../../lib/followup.ts";
import { archiveDue } from "../../../lib/monthly.ts";
import { refreshBadges } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session.
// - "badges", each morning: an invoice becomes overdue with the date alone,
//   so billing's count on the tool's tile is set again.
// - "followup", each morning: the recurring invoices' drafts of the day,
//   and the late payers reminded on the company's rules (lib/followup.ts;
//   nothing is emailed unless an administrator turned reminders on).
// - "archive", on the 1st of each month: the month before as one ZIP kept
//   in the Chest's files (lib/monthly.ts; the follow-up catches up a month
//   it missed).
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      badges: async () => { await refreshBadges(db(), chest.today()); },
      followup: async () => { await followUp(db(), chest.today()); },
      archive: async () => { await archiveDue(db(), chest.today(), archiveLocale()); },
    }),
  });
}
