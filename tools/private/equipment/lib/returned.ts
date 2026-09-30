import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";

// Equipment → People (Proposal (studio): events between tools,
// chest.proposals.json `emits`). The contract, v1, as People reads it (its
// README, "With the other tools", and its lib/returns.ts):
//
//   equipment.returned  { member: "mbr_…" }   key equipment:<member>:returned:<time>
//
// — everything this leaving person held is back. `<time>` is when it
// happened (milliseconds): back, given again, then back again is told
// again, and People, told twice, finds nothing left to tick.
//
// The migration's trigger (0007_returned.sql) writes it in the same
// transaction as the take-back; publishReturned() tells it after each
// action (app/chest/actions.ts), and the "returns" schedule (every quarter
// of an hour) again while the Chest cannot take it. A Chest without events
// between tools, or before an admin linked the tools, refuses: it waits,
// and is forgotten after a week (HR ticks the step by hand meanwhile —
// the README says so).

export const returnedLimits = { perRun: 200, keepDays: 7 } as const;

type Row = { id: string; member_id: string; at: Date };

export const returnedKey = (row: Pick<Row, "member_id" | "at">): string => `equipment:${row.member_id}:returned:${row.at.getTime()}`;

// Still true when it leaves? Something given back since (an Undo), a
// departure taken back in People or an erasure: dropped, not told.
async function stillTrue(sql: Query, member: string): Promise<boolean> {
  const [row] = await sql<{ leaving: boolean; held: number }[]>`
    select exists (select 1 from departures where member_id = ${member} and last_day is not null) as leaving,
      ((select count(*) from items where holder = ${member} and deleted_at is null)
        + (select count(*) from seats s join items i on i.id = s.item_id where s.member_id = ${member} and i.deleted_at is null))::int as held`;
  return row !== undefined && row.leaving && row.held === 0;
}

// publishReturned tells what waits, oldest first; stops at the first
// refusal of the Chest (the next run tries again). The same key twice is
// one event for the Chest: two runs at once publish nothing twice.
export async function publishReturned(sql: Query): Promise<number> {
  const rows = await sql<Row[]>`
    select id::text as id, member_id, at from returned_events where published_at is null order by id limit ${returnedLimits.perRun}`;
  let told = 0;
  for (const row of rows) {
    if (!(await stillTrue(sql, row.member_id))) {
      await sql`update returned_events set published_at = now() where id = ${row.id}`;
      continue;
    }
    try {
      await events.publish("equipment.returned", { member: row.member_id }, { key: returnedKey(row) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // A key the Chest already holds for something else would be refused
      // for ever: a bug, said, and not retried.
      if (error.code !== "key_conflict") {
        console.warn(`equipment.returned not published yet: ${error.code}`);
        return told;
      }
      console.error("equipment.returned refused: key_conflict");
    }
    await sql`update returned_events set published_at = now() where id = ${row.id}`;
    told++;
  }
  return told;
}

// tellPeople is publishReturned that never fails the action it follows: a
// laptop taken back is taken back whatever the Chest answers.
export async function tellPeople(sql: Query): Promise<void> {
  try {
    await publishReturned(sql);
  } catch (error) {
    console.error("equipment.returned not published", error instanceof Error ? error.name : "error");
  }
}

// forgetReturned drops what was told a day ago, and what the Chest has
// refused for a week.
export async function forgetReturned(sql: Query, now = new Date()): Promise<void> {
  await sql`delete from returned_events where (published_at is not null and published_at < ${new Date(now.getTime() - 86_400_000)})
    or (published_at is null and at < ${new Date(now.getTime() - returnedLimits.keepDays * 86_400_000)})`;
}
