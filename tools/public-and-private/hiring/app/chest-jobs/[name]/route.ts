import * as schedules from "@argentic/chest-sdk/schedules";
import { cleanup } from "../../../lib/candidates.ts";
import * as cv from "../../../lib/cv.ts";
import { db } from "../../../lib/db.ts";
import { today } from "../../../lib/interviews.ts";
import * as outbox from "../../../lib/outbox.ts";
import { timeOf } from "../../../lib/time.ts";
import { interviewsToday, refreshBadges } from "../../../lib/tell.ts";

// Scheduled tasks (Proposal (studio)):
// - cleanup, every night: candidates whose last news is older than the
//   retention go, with their CVs and their emails' files (CNIL: two years
//   at most by default); CVs sent but never claimed go too;
// - outbox, every 15 minutes: emails that are due (a rejection after its
//   Undo) leave even when nobody has the tool open; interviews reach the
//   interviewers' calendars;
// - morning, on weekdays: each interviewer hears of the day's interviews.
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
      outbox: async () => {
        await outbox.flush(db(), 100);
      },
      morning: async run => {
        const list = await today(db(), new Date(run.scheduledAt));
        await interviewsToday(list, start => timeOf(start, run.timeZone));
      },
    }),
  });
}
