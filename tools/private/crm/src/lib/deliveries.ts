import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { db } from "./db.ts";
import { receiveBooking } from "./from-booking.ts";
import { receiveFormContact } from "./from-forms.ts";
import { forgetSeen, handlers, seen, type LifecycleType } from "./lifecycle.ts";
import { morning } from "./morning.ts";

// What the Chest posts by itself, signed, at least once (src/app.tsx routes
// it; never under /chest, never behind a member; the body read by the
// SDK's handle() only). A handler that throws makes the Chest send it
// again: each is idempotent, and the ids already handled are kept in the
// database (seen), not in memory — the tool sleeps.

// The members' lifecycle ("receives": ["member.*"]), and what Forms and
// Booking tell (SDK 0.7.0 events between tools, chest.json "receives" —
// `forms.contact`, lib/from-forms.ts; `booking.confirmed` and
// `booking.cancelled`, lib/from-booking.ts — each with its audience).
export async function onEvent(request: Request): Promise<Response> {
  const sql = db();
  const all: events.Handlers<LifecycleType | "forms.contact" | "booking.confirmed" | "booking.cancelled"> = {
    ...handlers(sql),
    "forms.contact": async e => { await receiveFormContact(sql, e); },
    "booking.confirmed": async e => { await receiveBooking(sql, e); },
    "booking.cancelled": async e => { await receiveBooking(sql, e); },
  };
  return new Response(null, { status: await events.handle(request, all, { seen: seen(sql) }) });
}

// The runs of chest.json's "schedules", read on the Chest's clock:
// "morning" (weekdays 07:30): each one's next steps for today in the bell,
// the tiles' numbers, removed history purged, the calendars checked again,
// the delivered ids of more than 30 days forgotten.
export async function onSchedule(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      morning: async run => {
        await morning(sql, run);
        const forgotten = await forgetSeen(sql);
        log.info("morning run", { run: run.id, attempt: run.attempt, forgotten });
      },
    }, { seen: seen(sql) }),
  });
}
