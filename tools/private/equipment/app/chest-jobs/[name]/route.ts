import * as schedules from "@argentic/chest-sdk/schedules";
import { AppError } from "../../../lib/app-error.ts";
import { db } from "../../../lib/db.ts";
import { connected, refresh } from "../../../lib/intune.ts";
import { forgetReturned, publishReturned } from "../../../lib/returned.ts";
import { weekly } from "../../../lib/weekly.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route at the times of each schedule, signed. Never under /chest,
// never behind a session.
// - weekly: Monday's word to the managers (lib/weekly.ts);
// - intune: each night, what Microsoft Intune says of the devices, when an
//   administrator connected it (nothing otherwise). A read Intune refused
//   is kept in the reads (the import page says why) and not tried again
//   before the next night;
// - returns: every quarter of an hour, what is back from a leaving person
//   and the Chest could not take yet is told to People again
//   (equipment.returned, lib/returned.ts); what was told a day ago, or
//   refused for a week, is forgotten.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      weekly: run => weekly(db(), run),
      returns: async () => {
        await publishReturned(db());
        await forgetReturned(db());
      },
      intune: async () => {
        if (!connected()) return;
        try {
          await refresh(db(), "schedule");
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
        }
      },
    }),
  });
}
