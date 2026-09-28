import * as events from "@argentic/chest-sdk/events";
import { hireCancelled, hired } from "../../lib/arrivals.ts";
import { db } from "../../lib/db.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";
import { everyone } from "../../lib/people.ts";
import { arrivalCancelled, arrivalTold, settled } from "../../lib/tell.ts";

// The members' lifecycle, and what other tools tell People (Proposal
// (studio): events between tools — Hiring's hires), posted by the Chest
// (signed, at least once). Never under /chest, never behind a session, the
// body read by handle() only. An event of another shape changes nothing.
export async function POST(request: Request): Promise<Response> {
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
      },
    }),
  });
}
