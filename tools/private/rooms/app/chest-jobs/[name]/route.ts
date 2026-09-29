import * as schedules from "@argentic/chest-sdk/schedules";
import { quarter } from "../../../lib/check-in.ts";
import { db } from "../../../lib/db.ts";
import { rules } from "../../../lib/settings.ts";
import * as tell from "../../../lib/tell.ts";
import { zone } from "../../../lib/zone.ts";

// Scheduled tasks (Proposal (studio), chest.proposals.json): the Chest calls
// this route every quarter of an hour, signed. Never under /chest, never
// behind a session. "quarter": reminders before meetings; with check-in
// on, the rooms nobody checked in to are freed.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      quarter: async () => {
        const sql = db();
        const { reminded, released } = await quarter(sql, zone());
        const { checkIn } = await rules(sql);
        await tell.startsSoon(reminded, checkIn);
        await tell.cancelled(null, released, "noShow");
      },
    }),
  });
}
