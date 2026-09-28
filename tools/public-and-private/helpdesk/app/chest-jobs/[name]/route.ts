import * as schedules from "@argentic/chest-sdk/schedules";
import { remove, sweep } from "../../../lib/attachments.ts";
import { db } from "../../../lib/db.ts";
import { cleanup } from "../../../lib/tickets.ts";

// Scheduled tasks (Proposal (studio)): every night, closed tickets older
// than the retention (Settings) go, with their files; so do the files
// members sent but never added to a message.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      cleanup: async run => {
        const gone = await cleanup(db(), new Date(run.scheduledAt));
        await remove(gone.objects);
        await sweep(new Date(run.scheduledAt));
      },
    }),
  });
}
