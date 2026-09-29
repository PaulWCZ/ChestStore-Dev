import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { pass } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): every 15
// minutes the Chest calls "pass" — polls past their closing time close and
// their organisers hear of it, the day-before reminders go out, a telling
// stopped by the hourly quota goes on, and what was deleted long ago is
// purged. Without schedules, the same pass runs when someone opens a page.
// Signed, never under /chest, never behind a session.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, { status: await schedules.handle(request, { pass: async () => { await pass(db()); } }) });
}
