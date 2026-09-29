import * as events from "@argentic/chest-sdk/events";
import { dealReopened, dealWon } from "../../lib/crm.ts";
import { db } from "../../lib/db.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";
import { handlers as fed } from "../../lib/sources.ts";

// The members' lifecycle, the Chest's groups, and what the other tools
// tell (Proposal (studio): events between tools — Clients' deals, Tasks'
// cards, Support's tickets, Hiring's hires: lib/crm.ts, lib/sources.ts),
// posted by the Chest (signed, at least once). Never
// under /chest, never behind a session, the body read by handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "crm.deal.won": async e => { await dealWon(sql, e); },
        "crm.deal.reopened": async e => { await dealReopened(sql, e); },
        ...fed(sql),
      },
    }),
  });
}
