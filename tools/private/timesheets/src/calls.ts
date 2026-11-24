import { log } from "@argentic/chest-app";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { db } from "./lib/db.ts";
import { invoiced } from "./lib/handoff.ts";
import { forgetSeen, handlers, seen } from "./lib/lifecycle.ts";
import { friday } from "./lib/reminder.ts";

// What src/app.tsx answers at the addresses the Chest calls by itself —
// plain functions of a Request, so the tests call them as the server
// does. Signed by the Chest, at least once (a delivery already handled is
// dropped: `seen`, in the database); never under /chest, never behind a
// session; the body is read by handle() only. A handler that throws makes
// the Chest send it again: each is idempotent.

// POST /chest-events: the members' lifecycle; and, from the Quotes tool
// once the owner approved the link (events between tools, chest.json
// "receives"), "quotes.invoiced": the time handed to it is invoiced
// (src/lib/handoff.ts). One map for both (SDK 0.7.0).
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  const all: events.Handlers<"access.revoked" | "member.removed" | "member.erased" | "quotes.invoiced"> = {
    ...handlers(sql),
    // Only Quotes says its invoices are issued: a type names no tool, so
    // another linked tool could emit one; `source` is stamped by the Chest.
    "quotes.invoiced": async event => { if (event.source === "quotes") await invoiced(sql, event); },
  };
  return new Response(null, { status: await events.handle(request, all, { seen: seen(sql) }) });
}

// POST /chest-schedules: the runs of chest.json's "schedules". On Friday
// at 15:30 (the Chest's time zone), "friday": whoever is short of their
// usual week and has not sent it is reminded (src/lib/reminder.ts); the
// deliveries older than the Chest's retries are forgotten.
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      friday: async run => {
        const told = await friday(sql, run);
        const forgotten = await forgetSeen(sql);
        log.info("friday", { told, forgotten });
      },
    }, { seen: seen(sql) }),
  });
}
