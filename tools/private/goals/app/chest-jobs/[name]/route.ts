import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { refreshBadges, weeklyReminder } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio): "schedules", chest.proposals.json):
// Friday morning, the owners of key results not checked in this week hear
// of it in the bell; Monday morning, every tile's number is set for the new
// week. Never under /chest, never behind a session. Without schedules the
// tool still works: badges are set whenever people use it.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      reminder: async run => { await weeklyReminder(db(), new Date(run.scheduledAt)); },
      week: async run => { await refreshBadges(db(), null, new Date(run.scheduledAt)); },
    }),
  });
}
