import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { flushMail } from "../../../lib/mail.ts";
import { morning } from "../../../lib/morning.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session. "mail" sends the emails that waited (lib/mail.ts)
// when nobody uses the tool for a while.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, { status: await schedules.handle(request, {
    morning: run => morning(db(), run),
    mail: async () => { await flushMail(db()); },
  }) });
}
