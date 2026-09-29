import * as events from "@argentic/chest-sdk/events";
import { leaveApproved, leaveCancelled } from "../../lib/away.ts";
import { flush } from "../../lib/calendar.ts";
import { db } from "../../lib/db.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";
import { zone } from "../../lib/zone.ts";

// The members' lifecycle, and what the Leave tool tells (Proposal (studio):
// events between tools), posted by the Chest (signed, at least once). Never
// under /chest, never behind a session, the body read by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "leave.approved": async e => { await leaveApproved(sql, e, zone()); await flush(sql, zone()); },
        "leave.cancelled": async e => { await leaveCancelled(sql, e); await flush(sql, zone()); },
      },
    }),
  });
}
