import * as events from "@argentic/chest-sdk/events";
import { db } from "../../lib/db.ts";
import { received } from "../../lib/forms-in.ts";
import * as incidents from "../../lib/incidents-in.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";

// The members' lifecycle, the requests Forms sends and the incidents Status
// publishes (Proposal (studio): events between tools; lib/forms-in.ts,
// lib/incidents-in.ts), posted by the Chest (signed, at
// least once). Never under /chest, never behind a session, the body read
// by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "forms.request": async e => { await received(sql, e); },
        "status.incident": async e => { await incidents.received(sql, e); },
      },
    }),
  });
}
