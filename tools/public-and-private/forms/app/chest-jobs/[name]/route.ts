import * as schedules from "@argentic/chest-sdk/schedules";
import { cleanup } from "../../../lib/answers.ts";
import { db } from "../../../lib/db.ts";
import { pending, refreshBadges } from "../../../lib/tell.ts";
import * as uploads from "../../../lib/uploads.ts";

// Scheduled tasks (Proposal (studio)), called by the Chest, signed:
// - bell (every 15 minutes): answers that waited for their batch are told;
// - cleanup (every night): answers older than their form's retention go,
//   with their files; answers and forms put aside long enough go for good;
//   team uploads never attached to an answer go after a day.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      bell: async run => {
        await pending(db(), new Date(run.scheduledAt));
      },
      cleanup: async run => {
        const sql = db();
        const gone = await cleanup(sql, new Date(run.scheduledAt));
        await uploads.remove(gone.objects);
        await uploads.sweep(new Date(run.scheduledAt));
        await refreshBadges(sql);
      },
    }),
  });
}
