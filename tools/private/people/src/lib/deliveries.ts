import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { hireCancelled, hired } from "./arrivals.ts";
import { leaveApproved, leaveCancelled } from "./away.ts";
import { db } from "./db.ts";
import { forgetSeen, handlers, seen, type MemberEvent } from "./lifecycle.ts";
import { morning } from "./morning.ts";
import { everyone } from "./people.ts";
import { equipmentReturned } from "./returns.ts";
import { arrivalCancelled, arrivalTold, completed, settled, todo } from "./tell.ts";
import { today } from "./zone.ts";

// What the Chest posts by itself, signed, at least once (src/app.tsx routes
// it; never under /chest, never behind a member; the body read by the
// SDK's handle() only). A handler that throws makes the Chest send it
// again: each is idempotent, and the ids already handled are kept in the
// database (seen, chest_events), not in memory — the tool sleeps.

// The members' lifecycle (lib/lifecycle.ts) and what other tools tell
// People (events between tools, chest.json "receives" — Hiring's hires,
// Leave's leaves, Equipment's "everything is back"), in one map (SDK
// 0.5+). An event of another shape changes nothing; an item told with an
// audience is shown to the members it lists only (lib/arrivals.ts,
// lib/away.ts).
export type Received = MemberEvent | "hiring.hired" | "hiring.hire-cancelled" | "leave.approved" | "leave.cancelled" | "equipment.returned";

export async function onEvent(request: Request): Promise<Response> {
  const sql = db();
  const hr = async () => (await everyone({ role: "hr" })).people.map(p => p.id);
  const all: events.Handlers<Received> = {
    ...handlers(sql),
    "hiring.hired": async e => {
      const told = await hired(sql, e);
      if (!told) return;
      const audience = told.audience;
      await arrivalTold((await hr()).filter(id => audience === null || audience.includes(id)), told.arrival);
    },
    "hiring.hire-cancelled": async e => {
      const done = await hireCancelled(sql, e);
      if (!done) return;
      for (const journey of done.stopped) await settled(sql, journey, done.assignees);
      await arrivalCancelled((await hr()).filter(id => done.audience === null || done.audience.includes(id)), { id: done.id, name: done.name, kept: done.kept });
    },
    "leave.approved": async e => { await leaveApproved(sql, e, today()); },
    "leave.cancelled": async e => { await leaveCancelled(sql, e); },
    // Everything the person held is back: the leaving checklist's return
    // step ticks itself; its person's to-do and HR's "complete" follow, as
    // for a tick (nothing of the event itself is shown to anyone).
    "equipment.returned": async e => {
      for (const ticked of await equipmentReturned(sql, e)) {
        if (ticked.assignee) await todo(sql, null, { id: ticked.journeyId }, [ticked.assignee]);
        if (ticked.completed) await completed(sql, ticked.journeyId, null);
      }
    },
  };
  return new Response(null, { status: await events.handle(request, all, { seen: seen(sql) }) });
}

// The runs of chest.json's "schedules", read on the Chest's clock:
// "morning" (weekdays 07:40: the bell's digest of steps due, HR's
// endings, the tiles' numbers, the purges, the delivered ids of more than
// 30 days forgotten).
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
