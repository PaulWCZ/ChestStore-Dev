import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { db } from "./lib/db.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { pass } from "./lib/tell.ts";

// What src/app.tsx answers at the addresses the Chest calls by itself —
// plain functions of a Request, so the tests call them as the server does.

// POST /chest-events: the members' lifecycle and the groups' changes
// ("receives"), signed by the Chest, at least once (a delivery already
// handled is dropped: `seen`). Never under /chest, never behind a session;
// the body is read by handle() only.
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, { status: await events.handle(request, handlers(sql), { seen: seen(sql) }) });
}

// POST /chest-schedules: the runs of chest.json's "schedules", signed.
// Every 15 minutes, "publish": what is due is told (scheduled Important
// posts reach the bell on time, a telling stopped by the hourly quota goes
// on), and what was deleted long ago is purged. A run that fails comes
// again with the same id: it is idempotent. Without schedules, the publish
// pass runs when someone opens the front page (catchUp).
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      publish: async () => {
        const done = await pass(sql);
        log.info("publish pass", { told: done.told.length, waiting: done.waiting.length });
      },
    }, { seen: seen(sql) }),
  });
}
