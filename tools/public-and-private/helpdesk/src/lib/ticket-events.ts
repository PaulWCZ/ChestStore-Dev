import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { log } from "@argentic/chest-app";
import type { Query } from "./db.ts";

// Support → the tools an admin linked to it (Goals counts "Tickets
// solved"; Proposal (studio): events between tools, chest.proposals.json
// `emits`). The contract, as Goals reads it (its README, "With the other
// tools"):
//
//   helpdesk.ticket.solved    {ticket, assignee: mbr_… | null}  key helpdesk:<ticket>:solved:<time>
//   helpdesk.ticket.reopened  {ticket}                          key helpdesk:<ticket>:reopened:<time>
//
// `ticket` is the ticket's number as text ("1042": the one people say and
// the address of its page); `assignee` the ticket's agent when it was
// solved (the one who answered and closed it, or the one it was given to),
// null when nobody had it. `<time>` is when it happened (milliseconds), so
// a ticket solved again is published again and Goals keeps the latest.
//
// The migration's trigger (0007_ticket_events.sql) writes each change in
// the same transaction as the ticket; publish() tells them after each
// action, and the "late" schedule (every 15 minutes) again while the
// Chest cannot take them. A Chest without events between tools, or
// before an admin approved them, refuses: they wait, and the nightly
// cleanup forgets those a week old (Goals cannot count what happened
// before the tools were linked — its README says so).

export const ticketEventTypes = ["helpdesk.ticket.solved", "helpdesk.ticket.reopened"] as const;
export const ticketEventLimits = { perRun: 200, keepDays: 7 } as const;

type Row = { id: string; type: (typeof ticketEventTypes)[number]; ticket: number; assignee: string | null; at: Date };

export const ticketEventKey = (row: Pick<Row, "type" | "ticket" | "at">): string =>
  `helpdesk:${row.ticket}:${row.type === "helpdesk.ticket.solved" ? "solved" : "reopened"}:${row.at.getTime()}`;

export const ticketEventData = (row: Pick<Row, "type" | "ticket" | "assignee">): Record<string, unknown> =>
  row.type === "helpdesk.ticket.solved" ? { ticket: String(row.ticket), assignee: row.assignee } : { ticket: String(row.ticket) };

// When it happened, told to the Chest (events.publish's occurredAt,
// studio.16): Goals counts a ticket solved at 23:55 on a cycle's last day
// in that cycle even when the Chest took it at 00:10. The Chest takes a
// time at most 24 hours back; an event older than that (a Chest down for a
// night) goes without it — its time stays in the key, and the receiver
// reads the Chest's. Five minutes of margin for the two clocks.
export const occurredMarginMs = 5 * 60_000;
export function occurredAtFor(at: Date, now = Date.now()): Date | undefined {
  return now - at.getTime() < events.occurredLimits.behindMs - occurredMarginMs ? at : undefined;
}

// publishTicketEvents tells what waits, oldest first; stops at the first
// refusal of the Chest (the next run tries again). The same key twice is
// one event for the Chest: two runs at once publish nothing twice.
export async function publishTicketEvents(sql: Query): Promise<number> {
  const rows = await sql<Row[]>`
    select id::text as id, type, ticket, assignee, at from ticket_events
    where published_at is null order by id limit ${ticketEventLimits.perRun}`;
  let told = 0;
  for (const row of rows) {
    try {
      const occurredAt = occurredAtFor(row.at);
      await events.publish(row.type, ticketEventData(row), { key: ticketEventKey(row), ...(occurredAt ? { occurredAt } : {}) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // A key the Chest already holds for something else would be refused
      // for ever: a bug, said, and not retried.
      if (error.code !== "key_conflict") {
        log.warn("ticket event not published yet", { type: row.type, code: error.code });
        return told;
      }
      log.warn("ticket event refused", { type: row.type, code: "key_conflict" });
    }
    await sql`update ticket_events set published_at = now() where id = ${row.id}`;
    told++;
  }
  return told;
}

// A retry within the day gives the same time (the Chest would refuse
// another under the key); one that crosses the 24 hours drops it, and the
// Chest, which then may still hold the key, answers key_conflict: the
// event was taken the first time, and is marked told.

// tellLinkedTools is publishTicketEvents that never fails the action it
// follows: a person's reply is saved whatever the Chest answers.
export async function tellLinkedTools(sql: Query): Promise<void> {
  try {
    await publishTicketEvents(sql);
  } catch (error) {
    log.error("ticket events not published", error);
  }
}

// forgetTicketEvents drops what was told a day ago, and what the Chest
// has refused for a week.
export async function forgetTicketEvents(sql: Query, now = new Date()): Promise<void> {
  await sql`delete from ticket_events where (published_at is not null and published_at < ${new Date(now.getTime() - 86_400_000)})
    or (published_at is null and at < ${new Date(now.getTime() - ticketEventLimits.keepDays * 86_400_000)})`;
}
