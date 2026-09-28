import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { pass } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): every 15
// minutes the Chest calls "publish" — what is due is told (scheduled
// Important posts reach the bell on time, a telling stopped by the hourly
// quota goes on), and what was deleted long ago is purged. Signed, never
// under /chest, never behind a session.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, { status: await schedules.handle(request, { publish: async () => { await pass(db()); } }) });
}
