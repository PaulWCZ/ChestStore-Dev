import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";

// Tasks → the tools an admin linked to it (Goals counts "Cards done";
// Proposal (studio): events between tools, chest.proposals.json `emits`).
// The contract, as Goals reads it (its README, "With the other tools"):
//
//   tasks.card.done      {card, board, boardName, assignees: [mbr_…]}  key tasks:<card>:done:<time>
//   tasks.card.reopened  {card}                                        key tasks:<card>:reopened:<time>
//
// `card` and `board` are ids as text ("42": the address of the card's
// page); `boardName` the board's name (1–80 characters, as boards keep
// it); `assignees` the card's people when it leaves (20 at most, by id).
// `<time>` is when it happened (milliseconds): a card done again is
// published again, and Goals keeps the latest.
//
// The migration's trigger (0006_card_events.sql) writes each change in
// the same transaction as the card; publish() tells them after each
// action (app/chest/actions.ts), and the "mail" schedule (every quarter
// of an hour) again while the Chest cannot take them. A Chest without
// events between tools, or before an admin approved them, refuses: they
// wait, and the morning forgets those a week old (Goals cannot count what
// happened before the tools were linked — its README says so).

export const cardEventTypes = ["tasks.card.done", "tasks.card.reopened"] as const;
export const cardEventLimits = { perRun: 200, keepDays: 7, assignees: 20 } as const;

type Type = (typeof cardEventTypes)[number];
type Row = { id: string; type: Type; card: string; board: string; at: Date; board_name: string | null; assignees: string[] | null };

export const cardEventKey = (row: Pick<Row, "type" | "card" | "at">): string =>
  `tasks:${row.card}:${row.type === "tasks.card.done" ? "done" : "reopened"}:${row.at.getTime()}`;

export const cardEventData = (row: Pick<Row, "type" | "card" | "board" | "board_name" | "assignees">): Record<string, unknown> =>
  row.type === "tasks.card.done"
    ? { card: row.card, board: row.board, boardName: [...(row.board_name ?? "")].slice(0, 80).join(""), assignees: [...(row.assignees ?? [])].sort().slice(0, cardEventLimits.assignees) }
    : { card: row.card };

// publishCardEvents tells what waits, oldest first; stops at the first
// refusal of the Chest (the next run tries again). The same key twice is
// one event for the Chest: two runs at once publish nothing twice. A
// "done" whose board is gone (deleted since) is dropped, not sent without
// a name.
export async function publishCardEvents(sql: Query): Promise<number> {
  const rows = await sql<Row[]>`
    select e.id::text as id, e.type, e.card::text as card, e.board::text as board, e.at, b.name as board_name,
      (select array_agg(a.member_id order by a.member_id) from card_assignees a where a.card_id = e.card and a.member_id ~ '^mbr_[a-z2-7]{26}$') as assignees
    from card_events e left join boards b on b.id = e.board
    where e.published_at is null order by e.id limit ${cardEventLimits.perRun}`;
  let told = 0;
  for (const row of rows) {
    if (row.type === "tasks.card.done" && !row.board_name) {
      await sql`update card_events set published_at = now() where id = ${row.id}`;
      continue;
    }
    try {
      await events.publish(row.type, cardEventData(row), { key: cardEventKey(row) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // A key the Chest already holds for something else would be refused
      // for ever: a bug, said, and not retried.
      if (error.code !== "key_conflict") {
        console.warn(`${row.type} not published yet: ${error.code}`);
        return told;
      }
      console.error(`${row.type} refused: key_conflict`);
    }
    await sql`update card_events set published_at = now() where id = ${row.id}`;
    told++;
  }
  return told;
}

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
