import * as schedules from "@argentic/chest-sdk/schedules";
import { cleanup, dueReminders } from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { refreshDue } from "../../../lib/calendars.ts";
import { email } from "../../../lib/guests.ts";
import { shareAllBusy } from "../../../lib/share.ts";

// Scheduled tasks (Proposal (studio): "schedules", chest.proposals.json):
// every hour, the reminders of tomorrow's meetings; every night, bookings
// older than the company keeps them go; every 15 minutes, the hosts' other
// calendars are read again (within the Chest's 5 minutes a run) and the
// hosts' busy times told to the tools linked to Booking.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await schedules.handle(request, {
      reminders: async run => {
        const sql = db();
        for (const b of await dueReminders(sql, Date.parse(run.scheduledAt))) await email(sql, "reminder", b, null);
      },
      calendars: async () => {
        await refreshDue(db(), { olderThanMinutes: 10, deadline: Date.now() + 4 * 60000 });
        // What the calendars said, and each new day's window, to the tools
        // linked to Booking (lib/share.ts: only what changed).
        await shareAllBusy(db());
      },
      cleanup: async run => {
        await cleanup(db(), Date.parse(run.scheduledAt));
      },
    }),
  });
}
