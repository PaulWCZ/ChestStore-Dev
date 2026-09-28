import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { cleanup, reminder } from "../../../lib/jobs.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      reminder: async run => { await reminder(db(), run); },
      cleanup: async run => { await cleanup(db(), run); },
    }),
  });
}
