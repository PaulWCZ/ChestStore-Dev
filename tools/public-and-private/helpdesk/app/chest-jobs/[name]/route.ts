import * as files from "@argentic/chest-sdk/files";
import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "../../../lib/db.ts";
import { cleanup } from "../../../lib/tickets.ts";

// Scheduled tasks (Proposal (studio)): every night, closed tickets older
// than the retention (Settings) go, with their files.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      cleanup: async run => {
        const gone = await cleanup(db(), new Date(run.scheduledAt));
        for (const object of gone.objects) await files.delete(object).catch(() => false);
      },
    }),
  });
}
