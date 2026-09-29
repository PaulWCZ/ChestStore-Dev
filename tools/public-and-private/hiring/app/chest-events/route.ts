import * as events from "@argentic/chest-sdk/events";
import { db } from "../../lib/db.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";
import { takeBusy } from "../../lib/share.ts";

// The members' lifecycle, and what other tools tell (Proposal (studio):
// events between tools — booking.busy, the times a member is taken in
// Booking), posted by the Chest (signed, at least once). Never under
// /chest, never behind a session, the body read by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "booking.busy": async e => { await takeBusy(sql, e); },
      },
    }),
  });
}
