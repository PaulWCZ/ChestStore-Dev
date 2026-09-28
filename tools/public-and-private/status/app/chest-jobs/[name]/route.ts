import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { pass } from "../../../lib/jobs.ts";

// Scheduled tasks (Proposal (studio): "schedules", chest.proposals.json):
// every 15 minutes, the automatic posts of maintenance windows and the
// emails left in the queue. Outside /chest, never behind a session: the
// Chest signs each run.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      updates: async run => {
        await pass(db(), new Date(Math.max(Date.parse(run.scheduledAt), Date.now())));
      },
    }),
  });
}
