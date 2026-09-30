import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import { db } from "../../lib/db.ts";
import { leaving, leavingCancelled } from "../../lib/departures.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";
import { people } from "../../lib/people.ts";
import * as tell from "../../lib/tell.ts";

// The members' lifecycle, and what People tells Equipment (Proposal
// (studio): events between tools — departures), posted by the Chest
// (signed, at least once). Never under /chest, never behind a session, the
// body read by handle() only. An event of another shape changes nothing.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "people.leaving": async e => {
          const d = await leaving(sql, e, chest.today());
          if (!d) return;
          const who = (await people([d.memberId])).get(d.memberId);
          await tell.leaving({ id: d.memberId, name: who?.status === "member" ? who.name : "" }, d.lastDay, d.count);
        },
        "people.leaving_cancelled": async e => {
          const member = await leavingCancelled(sql, e);
          if (member) await tell.stays(member);
        },
      },
    }),
  });
}
