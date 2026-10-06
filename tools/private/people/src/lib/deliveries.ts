import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { hireCancelled, hired } from "./arrivals.ts";
import { leaveApproved, leaveCancelled } from "./away.ts";
import { db } from "./db.ts";
import { forgetSeen, handlers, seen } from "./lifecycle.ts";
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

// The members' lifecycle ("receives": ["member.*"]: lib/lifecycle.ts), and
// what other tools tell People (Proposal (studio): events between tools —
// Hiring's hires, Leave's leaves, Equipment's "everything is back"). An
// event of another shape changes nothing.
export async function onEvent(request: Request): Promise<Response> {
  const sql = db();
  const hr = async () => (await everyone({ role: "hr" })).people.map(p => p.id);
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "hiring.hired": async e => {
          const told = await hired(sql, e);
          if (told) await arrivalTold(await hr(), told.arrival);
        },
        "hiring.hire_cancelled": async e => {
          const done = await hireCancelled(sql, e);
          if (!done) return;
          for (const journey of done.stopped) await settled(sql, journey, done.assignees);
          await arrivalCancelled(await hr(), { id: done.id, name: done.name, kept: done.kept });
        },
        "leave.approved": async e => { await leaveApproved(sql, e, today()); },
        "leave.cancelled": async e => { await leaveCancelled(sql, e); },
        // Everything the person held is back: the leaving checklist's
        // return step ticks itself; its person's to-do and HR's "complete"
        // follow, as for a tick.
        "equipment.returned": async e => {
          for (const ticked of await equipmentReturned(sql, e)) {
            if (ticked.assignee) await todo(sql, null, { id: ticked.journeyId }, [ticked.assignee]);
            if (ticked.completed) await completed(sql, ticked.journeyId, null);
          }
        },
      },
    }),
  });
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
