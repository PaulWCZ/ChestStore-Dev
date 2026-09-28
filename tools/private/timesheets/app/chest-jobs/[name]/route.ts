import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { friday } from "../../../lib/reminder.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, { status: await schedules.handle(request, { friday: async run => { await friday(db(), run); } }) });
}
