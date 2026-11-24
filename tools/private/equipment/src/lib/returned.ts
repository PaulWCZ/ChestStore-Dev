import { ChestError } from "@argentic/chest-sdk/errors";
import { log } from "@argentic/chest-app";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";

// Equipment → People (SDK 0.7.0 events between tools, chest.json `emits`
// with its schema). The contract, v1, as People reads it (its README, "With
// the other tools", and its lib/returns.ts):
//
//   equipment.returned  { member: "mbr_…" }   subject <member>, key equipment:<member>:returned:<time>
//
// — everything this leaving person held is back. `<time>` is when it
// happened (milliseconds): back, given again, then back again is told
// again, and People, told twice, finds nothing left to tick.
//
// The migration's trigger (0007_returned.sql) writes it in the same
// transaction as the take-back; publishReturned() tells it after each
// action (src/actions.ts), and the "returns" schedule (every quarter
// of an hour) again while the Chest cannot take it. A Chest that cannot
// take it yet (unavailable, the capability not granted) makes it wait; it
// is forgotten after a week (HR ticks the step by hand meanwhile — the
// README says so). No audience: that everything is back tells nothing
// private, and People's HR need not be Equipment's managers.

export const returnedLimits = { perRun: 200, keepDays: 7 } as const;
const refusedForGood = new Set(["key_reused", "invalid_data", "invalid_event", "invalid_type"]);

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

// When it happened, told to the Chest (events.emit's occurredAt): People
// reads the true time of the last take-back even when the schedule tells it
// later. The Chest takes a time at most 72 hours back (SDK 0.7.0); an event
// older than that (a Chest down for days) goes without it — its time stays
// in the key, and the receiver reads the Chest's. Five minutes of margin
// for the two clocks.
export const occurredBehindMs = 72 * 3_600_000;
export const occurredMarginMs = 5 * 60_000;
export function occurredAtFor(at: Date, now = Date.now()): Date | undefined {
  return now - at.getTime() < occurredBehindMs - occurredMarginMs ? at : undefined;
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
      const occurredAt = occurredAtFor(row.at);
      await events.emit("equipment.returned", { member: row.member_id }, { subject: row.member_id, key: returnedKey(row), ...(occurredAt ? { occurredAt } : {}) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // A key the Chest already holds for something else would be refused
      // for ever: a bug, said, and not retried.
      // Refused for good (the key went with other content; data or a time
      // the Chest will never take): a bug, said, and not retried — never
      // in the way of the others.
      if (!refusedForGood.has(error.code)) {
        log.warn("equipment.returned not published yet", { code: error.code });
        return told;
      }
      log.warn("equipment.returned refused", { code: error.code });
    }
    await sql`update returned_events set published_at = now() where id = ${row.id}`;
    told++;
  }
  return told;
}

// A retry within 72 hours gives the same time (the Chest would refuse
// another under the key); one that crosses them drops it, and the Chest,
// which then may still hold the key, answers key_reused: the event was
// taken the first time, and is marked told.

// tellPeople is publishReturned that never fails the action it follows: a
// laptop taken back is taken back whatever the Chest answers.
export async function tellPeople(sql: Query): Promise<void> {
  try {
    await publishReturned(sql);
  } catch (error) {
    log.error("equipment.returned not published", error);
  }
}

// forgetReturned drops what was told a day ago, and what the Chest has
// refused for a week.
export async function forgetReturned(sql: Query, now = new Date()): Promise<void> {
  await sql`delete from returned_events where (published_at is not null and published_at < ${new Date(now.getTime() - 86_400_000)})
    or (published_at is null and at < ${new Date(now.getTime() - returnedLimits.keepDays * 86_400_000)})`;
}
