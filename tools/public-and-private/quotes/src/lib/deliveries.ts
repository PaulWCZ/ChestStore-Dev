import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { localeOf } from "../i18n/index.ts";
import { dealReopened, dealWon } from "./crm.ts";
import { db } from "./db.ts";
import { archiveLocale, followUp } from "./followup.ts";
import { handlers, seen } from "./lifecycle.ts";
import { archiveDue } from "./monthly.ts";
import { refreshBadges } from "./tell.ts";
import { billableCancelled, billableReceived } from "./timesheets.ts";

// What the Chest sends by itself, signed — never under /chest, never
// behind a session, the body read by handle() only (src/app.tsx routes
// them here; the tests call them as the Chest does). Delivered at least
// once: each handler is idempotent, and a delivery already handled is
// skipped (seen: chest_events).

// POST /chest-events: the members' lifecycle, and what Clients (the CRM)
// and Timesheets tell (Proposal (studio): events between tools).
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  const locale = localeOf(chest.language);
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "crm.deal.won": async e => { await dealWon(sql, e, { today: chest.today(), locale, currency: chest.currency }); },
        "crm.deal.reopened": async e => { await dealReopened(sql, e); },
        "timesheets.billable": async e => { await billableReceived(sql, e, { locale, currency: chest.currency }); await refreshBadges(sql, chest.today()); },
        "timesheets.billable_cancelled": async e => { await billableCancelled(sql, e); await refreshBadges(sql, chest.today()); },
      },
    }),
  });
}

// POST /chest-schedules: chest.json's "schedules", on the Chest's clock.
// - "badges", each morning: an invoice becomes overdue with the date
//   alone, so billing's count on the tool's tile is set again;
// - "followup", each morning: the recurring invoices' drafts of the day,
//   the late payers reminded on the company's rules (nothing is emailed
//   unless an administrator turned reminders on), a monthly archive
//   missed, Timesheets told of invoices it was not told of yet; and the
//   deliveries older than the Chest's retries forgotten;
// - "archive", on the 1st of each month: the month before as one ZIP kept
//   in the Chest's files (the follow-up catches up a month it missed).
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  const kept = seen(sql);
  return new Response(null, {
    status: await schedules.handle(request, {
      badges: async () => { await refreshBadges(sql, chest.today()); },
      followup: async () => {
        const done = await followUp(sql, chest.today());
        await kept.forget();
        log.info("followup", done);
      },
      archive: async () => { log.info("archive", { made: await archiveDue(sql, chest.today(), archiveLocale()) }); },
    }, { seen: kept }),
  });
}
