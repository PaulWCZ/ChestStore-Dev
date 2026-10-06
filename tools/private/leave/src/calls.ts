import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { db } from "./lib/db.ts";
import { forgetSeen, handlers, seen, tools } from "./lib/lifecycle.ts";
import { morning } from "./lib/morning.ts";

// What src/app.tsx answers at the addresses the Chest calls by itself —
// plain functions of a Request, so the tests call them as the server
// does. Signed by the Chest, at least once (a delivery already handled is
// dropped: `seen`); never under /chest, never behind a session; the body
// is read by handle() only. A handler that throws makes the Chest send it
// again: each is idempotent.

// POST /chest-events: the members' lifecycle, and other tools' events
// (People's records and departures: Proposal (studio), events between
// tools).
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, { status: await events.handle(request, handlers(sql), { seen: seen(sql), tools: tools(sql) }) });
}

// POST /chest-schedules: the runs of chest.json's "schedules". On weekdays
// at 08:30 (the Chest's time zone), "morning": approvers reminded of
// requests waiting more than two days, every tile set right, the calendar
// feeds and the busy times kept in line; deliveries older than the
// Chest's retries forgotten.
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      morning: async run => {
        await morning(sql, run);
        const forgotten = await forgetSeen(sql);
        log.info("morning", { forgotten });
      },
    }, { seen: seen(sql) }),
  });
}
