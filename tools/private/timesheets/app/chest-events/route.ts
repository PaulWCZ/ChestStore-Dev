import * as events from "@argentic/chest-sdk/events";
import { db } from "../../lib/db.ts";
import { invoiced } from "../../lib/handoff.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";

// The members' lifecycle, posted by the Chest (signed, at least once); and,
// from the Quotes tool once an admin linked the two (events between tools,
// a proposal), "quotes.invoiced": the time handed to it is invoiced
// (lib/handoff.ts). Never under /chest, never behind a session, the body
// read by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: { "quotes.invoiced": async event => { await invoiced(sql, event.data); } },
    }),
  });
}
