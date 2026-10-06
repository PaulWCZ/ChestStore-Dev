import * as events from "@argentic/chest-sdk/events";
import * as mail from "@argentic/chest-sdk/mail";
import * as schedules from "@argentic/chest-sdk/schedules";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { log } from "@argentic/chest-app";
import { remove, sweep } from "./attachments.ts";
import { db } from "./db.ts";
import { received as fromForms } from "./forms-in.ts";
import * as incidents from "./incidents-in.ts";
import { handlers, seen } from "./lifecycle.ts";
import { bounced, received as fromMail } from "./mail-in.ts";
import { disabled, late } from "./notices.ts";
import { noticeStopped } from "./tell.ts";
import { forgetTicketEvents, publishTicketEvents, tellLinkedTools } from "./ticket-events.ts";
import { cleanup } from "./tickets.ts";

// What the Chest posts by itself, signed, at least once — never under
// /chest, never behind a session, the body read by the SDK's handle()
// only; each delivery is done once (`seen`: the table chest_events). The
// routes of src/app.tsx answer with these; the tests call them as the
// Chest would. A handler that throws makes the Chest deliver it again:
// every one is idempotent.

// The members' lifecycle (lib/lifecycle.ts), the requests Forms sends and
// the incidents Status publishes (Proposal (studio): events between tools;
// lib/forms-in.ts, lib/incidents-in.ts).
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "forms.request": async e => { await fromForms(sql, e); },
        "status.incident": async e => { await incidents.received(sql, e); },
      },
    }),
  });
}

// Email sent to the support mailbox, and the bounces of what the tool sent
// (Proposal (studio): mail). lib/mail-in.ts says what happens.
export async function chestMail(request: Request): Promise<Response> {
  const sql = db();
  const status = await mail.handle(request, { message: message => fromMail(sql, message), bounce: bounce => bounced(sql, bounce) }, { seen: seen(sql) });
  // A customer's email on a solved ticket reopens it: the linked tools told.
  await tellLinkedTools(sql);
  return new Response(null, { status });
}

// The runs of chest.json's "schedules" (contract 0.4). Every night,
// "cleanup": closed tickets older than the retention (Settings) go, with
// their files; so do the files members sent but never added to a message,
// and the ticket events told long ago. Every 15 minutes, "late": requests
// waiting past the threshold are told to the channels that asked for it
// (lib/notices.ts), and the tickets solved or reopened that the Chest
// could not take yet are published again (lib/ticket-events.ts).
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      cleanup: async run => {
        const at = new Date(run.scheduledAt);
        const gone = await cleanup(sql, at);
        await remove(gone.objects);
        const swept = await sweep(at);
        await forgetTicketEvents(sql, at);
        log.info("cleanup", { tickets: gone.tickets, files: gone.objects.length, swept });
      },
      late: async run => {
        const told = await late(sql, new Date(run.scheduledAt));
        // What the linked tools could not be told after an action.
        const published = await publishTicketEvents(sql);
        log.info("late", { told, published });
      },
    }, { seen: seen(sql) }),
  });
}

// The Chest's word about the notices it delivers (Proposal (studio):
// webhooks): a channel's address kept failing, or is gone, so the Chest
// stopped it. Settings shows it stopped, and the administrators are told.
export async function chestWebhooks(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await webhooks.handle(request, {
      disabled: async event => {
        const target = await disabled(sql, event);
        if (target) await noticeStopped(target);
      },
    }, { seen: seen(sql) }),
  });
}
