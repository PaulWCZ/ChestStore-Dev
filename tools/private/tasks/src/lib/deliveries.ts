import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { forgetCardEvents, publishCardEvents } from "./card-events.ts";
import { db } from "./db.ts";
import { forgetSeen, handlers, seen } from "./lifecycle.ts";
import { morning } from "./morning.ts";

// What the Chest posts by itself, signed, at least once (src/app.tsx routes
// it; never under /chest, never behind a member; the body read by the
// SDK's handle() only). A handler that throws makes the Chest send it
// again: each is idempotent, and the ids already handled are kept in the
// database (seen), not in memory — the tool sleeps.

// The members' lifecycle ("receives": ["member.*"]): lib/lifecycle.ts.
export async function onEvent(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, { status: await events.handle(request, handlers(sql), { seen: seen(sql) }) });
}

// The runs of chest.json's "schedules", read on the Chest's clock:
// "morning" (weekdays 07:30: reminders, repeats' safety net, the tiles'
// numbers, the calendars checked again, the delivered ids of more than 30
// days forgotten) and "retry" (every quarter of an hour: the cards done or
// reopened the Chest could not take yet for the linked tools).
export async function onSchedule(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      morning: async run => {
        await morning(sql, run);
        const forgotten = await forgetSeen(sql);
        log.info("morning run", { run: run.id, attempt: run.attempt, forgotten });
      },
      retry: async () => {
        await publishCardEvents(sql);
        await forgetCardEvents(sql);
      },
    }, { seen: seen(sql) }),
  });
}
