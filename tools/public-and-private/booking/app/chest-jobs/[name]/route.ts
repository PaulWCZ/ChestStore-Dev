import * as schedules from "@argentic/chest-sdk/schedules";
import { cleanup, dueReminders } from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { email } from "../../../lib/guests.ts";

// Scheduled tasks (Proposal (studio): "schedules", chest.proposals.json):
// every hour, the reminders of tomorrow's meetings; every night, bookings
// older than the company keeps them go.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      reminders: async run => {
        const sql = db();
        for (const b of await dueReminders(sql, Date.parse(run.scheduledAt))) await email(sql, "reminder", b, null);
      },
      cleanup: async run => {
        await cleanup(db(), Date.parse(run.scheduledAt));
      },
    }),
  });
}
