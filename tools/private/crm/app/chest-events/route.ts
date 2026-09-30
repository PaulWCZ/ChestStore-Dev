import * as events from "@argentic/chest-sdk/events";
import { db } from "../../lib/db.ts";
import { receiveBooking } from "../../lib/from-booking.ts";
import { receiveFormContact } from "../../lib/from-forms.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";

// The members' lifecycle, and what Forms and Booking tell (Proposal
// (studio): events between tools — `forms.contact`, lib/from-forms.ts;
// `booking.confirmed` and `booking.cancelled`, lib/from-booking.ts), posted by the Chest
// (signed, at least once). Never under /chest, never behind a session, the
// body read by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "forms.contact": async e => { await receiveFormContact(sql, e); },
        "booking.confirmed": async e => { await receiveBooking(sql, e); },
        "booking.cancelled": async e => { await receiveBooking(sql, e); },
      },
    }),
  });
}
