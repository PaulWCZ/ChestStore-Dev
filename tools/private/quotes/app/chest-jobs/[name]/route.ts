import * as chest from "@argentic/chest-sdk/chest";
import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { refreshBadges } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session. "badges", each morning: an invoice becomes
// overdue with the date alone, so billing's count on the tool's tile is set
// again. Nothing is ever emailed by a schedule: reminders are sent by hand.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      badges: async () => { await refreshBadges(db(), chest.today()); },
    }),
  });
}
