import * as schedules from "@argentic/chest-sdk/schedules";
import { cleanup } from "../../../lib/candidates.ts";
import * as cv from "../../../lib/cv.ts";
import { db } from "../../../lib/db.ts";
import { refreshBadges } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio)): every night, candidates whose last
// news is older than the retention go, with their CVs (CNIL: two years at
// most by default); CVs sent but never claimed by an application go too.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      cleanup: async run => {
        const sql = db();
        const gone = await cleanup(sql, new Date(run.scheduledAt));
        await cv.remove(gone.objects);
        await cv.sweep(new Date(run.scheduledAt));
        await refreshBadges(sql);
      },
    }),
  });
}
