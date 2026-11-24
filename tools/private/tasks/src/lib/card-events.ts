import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";

// Tasks → the tools linked to it (Goals counts "Cards done"): events
// between tools (SDK 0.5+, `events.emit`), each type declared with its
// fields in chest.json's "emits". The contract, as Goals reads it (its
// README, "With the other tools"):
//
//   tasks.card.done      {card, board, boardName, assignees: [mbr_…]}  key tasks:<card>:done:<time>
//   tasks.card.reopened  {card}                                        key tasks:<card>:reopened:<time>
//
// `card` and `board` are ids as text ("42": the address of the card's
// page); `boardName` the board's name (1–80 characters, as boards keep
// it); `assignees` the card's people when it leaves (20 at most, by id).
// `<time>` is when it happened (milliseconds): a card done again is
// published again, and Goals keeps the latest. The subject is `card:<id>`
// (a receiver gets one card's events in the order told). A card of a
// private board carries its audience — the board's people and groups, and
// the managers (who see every board) —: a receiver shows it to them only;
// a team board's card goes to everyone (no audience).
//
// The migration's trigger (0006_card_events.sql) writes each change in
// the same transaction as the card; publish() tells them after each
// action (src/actions.ts), and the "retry" schedule (every quarter
// of an hour) again while the Chest cannot take them. A Chest without
// events between tools, or before an admin approved them, refuses: they
// wait, and the morning forgets those a week old (Goals cannot count what
// happened before the tools were linked — its README says so).

export const cardEventTypes = ["tasks.card.done", "tasks.card.reopened"] as const;
export const cardEventLimits = { perRun: 200, keepDays: 7, assignees: 20 } as const;

type Type = (typeof cardEventTypes)[number];
type Row = { id: string; type: Type; card: string; board: string; at: Date; board_name: string | null; assignees: string[] | null; visibility: "team" | "private" | null; people: string[] | null; groups: string[] | null };

export const cardEventKey = (row: Pick<Row, "type" | "card" | "at">): string =>
  `tasks:${row.card}:${row.type === "tasks.card.done" ? "done" : "reopened"}:${row.at.getTime()}`;

// When it happened, told to the Chest (emit's occurredAt): Goals counts a
// card done at 23:55 on a cycle's last day in that cycle even when the
// Chest took it at 00:10. The Chest takes a time at most 72 hours back; an
// event older than that (a Chest down for three days) goes without it —
// its time stays in the key, and the receiver reads the Chest's. Five
// minutes of margin for the two clocks.
export const occurredWindowMs = 72 * 3_600_000;
export const occurredMarginMs = 5 * 60_000;
export function occurredAtFor(at: Date, now = Date.now()): Date | undefined {
  return now - at.getTime() < occurredWindowMs - occurredMarginMs ? at : undefined;
}

// Who may see the item: everyone for a team board's card (undefined); a
// private board's people and groups, and the managers.
export const cardEventAudience = (row: Pick<Row, "visibility" | "people" | "groups">): events.EmitAudience | undefined =>
  row.visibility === "private"
    ? { members: [...new Set(row.people ?? [])].sort(), groups: [...new Set(row.groups ?? [])].sort(), roles: ["manager"] }
    : undefined;

// An event's text refuses format characters (Unicode Cf: a zero-width
// joiner inside an emoji, a zero-width space, a BOM): stripped in the event
// only — the board keeps its name as typed.
export const eventText = (text: string): string => text.replace(/\p{Cf}/gu, "");

export const cardEventData = (row: Pick<Row, "type" | "card" | "board" | "board_name" | "assignees">): Record<string, unknown> =>
  row.type === "tasks.card.done"
    ? { card: row.card, board: row.board, boardName: [...eventText(row.board_name ?? "")].slice(0, 80).join(""), assignees: [...(row.assignees ?? [])].sort().slice(0, cardEventLimits.assignees) }
    : { card: row.card };

// publishCardEvents tells what waits, oldest first; stops at the first
// refusal of the Chest (the next run tries again). The same key twice is
// one event for the Chest: two runs at once publish nothing twice. A
// "done" whose board is gone (deleted since) is dropped, not sent without
// a name.
export async function publishCardEvents(sql: Query): Promise<number> {
  const rows = await sql<Row[]>`
    select e.id::text as id, e.type, e.card::text as card, e.board::text as board, e.at, b.name as board_name,
      (select array_agg(a.member_id order by a.member_id) from card_assignees a where a.card_id = e.card and a.member_id ~ '^mbr_[a-z2-7]{26}$') as assignees,
      b.visibility,
      (select array_agg(p.member_id order by p.member_id) from board_people p where p.board_id = e.board) as people,
      (select array_agg(g.group_id order by g.group_id) from board_groups g where g.board_id = e.board) as groups
    from card_events e left join boards b on b.id = e.board
    where e.published_at is null order by e.id limit ${cardEventLimits.perRun}`;
  let told = 0;
  for (const row of rows) {
    if (row.type === "tasks.card.done" && !eventText(row.board_name ?? "").trim()) {
      await sql`update card_events set published_at = now() where id = ${row.id}`;
      continue;
    }
    try {
      const occurredAt = occurredAtFor(row.at);
      const audience = cardEventAudience(row);
      await events.emit(row.type, cardEventData(row), { subject: `card:${row.card}`, key: cardEventKey(row), ...(occurredAt ? { occurredAt } : {}), ...(audience ? { audience } : {}) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // A key the Chest already holds for something else would be refused
      // for ever: a bug, said, and not retried. So is data or an audience
      // the Chest refuses (a member it never gave Tasks).
      if (!["key_reused", "invalid_data", "invalid_audience"].includes(error.code)) {
        console.warn(`${row.type} not published yet: ${error.code}`);
        return told;
      }
      console.error(`${row.type} refused: ${error.code}`);
    }
    await sql`update card_events set published_at = now() where id = ${row.id}`;
    told++;
  }
  return told;
}

// A retry within the 72 hours gives the same time (the Chest would refuse
// another under the key); one that crosses them drops it, and the Chest,
// which then may still hold the key, answers key_reused: the event was
// taken the first time, and is marked told.

// tellLinkedTools is publishCardEvents that never fails the action it
// follows: a card moved is moved whatever the Chest answers.
export async function tellLinkedTools(sql: Query): Promise<void> {
  try {
    await publishCardEvents(sql);
  } catch (error) {
    console.error("card events not published", error instanceof Error ? error.name : "error");
  }
}

// forgetCardEvents drops what was told a day ago, and what the Chest has
// refused for a week.
export async function forgetCardEvents(sql: Query, now = new Date()): Promise<void> {
  await sql`delete from card_events where (published_at is not null and published_at < ${new Date(now.getTime() - 86_400_000)})
    or (published_at is null and at < ${new Date(now.getTime() - cardEventLimits.keepDays * 86_400_000)})`;
}
