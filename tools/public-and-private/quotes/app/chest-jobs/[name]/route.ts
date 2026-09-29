import * as chest from "@argentic/chest-sdk/chest";
import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { followUp } from "../../../lib/followup.ts";
import { refreshBadges } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session.
// - "badges", each morning: an invoice becomes overdue with the date alone,
//   so billing's count on the tool's tile is set again.
// - "followup", each morning: the recurring invoices' drafts of the day,
//   and the late payers reminded on the company's rules (lib/followup.ts;
//   nothing is emailed unless an administrator turned reminders on).
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      badges: async () => { await refreshBadges(db(), chest.today()); },
      followup: async () => { await followUp(db(), chest.today()); },
    }),
  });
}
