import * as chest from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import { dealReopened, dealWon } from "../../lib/crm.ts";
import { db } from "../../lib/db.ts";
import { isLocale } from "../../lib/i18n/index.ts";
import { handlers, seen } from "../../lib/lifecycle.ts";
import { refreshBadges } from "../../lib/tell.ts";
import { billableCancelled, billableReceived } from "../../lib/timesheets.ts";

// The members' lifecycle, and what Clients (the CRM) and Timesheets tell (Proposal
// (studio): events between tools), posted by the Chest (signed, at least
// once). Never under /chest, never behind a session, the body read by
// handle() only.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  const locale = chest.locale();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "crm.deal.won": async e => { await dealWon(sql, e, { today: chest.today(), locale: isLocale(locale) ? locale : "en", currency: chest.currency() }); },
        "crm.deal.reopened": async e => { await dealReopened(sql, e); },
        "timesheets.billable": async e => { await billableReceived(sql, e, { locale: isLocale(locale) ? locale : "en", currency: chest.currency() }); await refreshBadges(sql, chest.today()); },
        "timesheets.billable_cancelled": async e => { await billableCancelled(sql, e); await refreshBadges(sql, chest.today()); },
      },
    }),
  });
}
