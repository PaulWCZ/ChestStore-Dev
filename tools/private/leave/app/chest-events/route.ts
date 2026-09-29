import * as events from "@argentic/chest-sdk/events";
import { db } from "../../lib/db.ts";
import { handlers, seen, tools } from "../../lib/lifecycle.ts";

// The members' lifecycle and other tools' events (People's records and
// departures), posted by the Chest (signed, at least once). Never
// under /chest, never behind a session, the body read by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, { status: await events.handle(request, handlers(sql), { seen: seen(sql), tools: tools(sql) }) });
}
