import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { shareBusy } from "./busy.ts";
import { addDays, type Half } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { sync } from "./leave-calendar.ts";
import { today } from "./model.ts";

// What Leave tells the other tools of the Chest (Proposal (studio): events
// between tools; chest.proposals.json "emits"), once an admin linked them.
// Rooms marks the person "Off" those days and frees their desk; People
// shows "Away · back on …". Who and which days, never the kind of leave
// nor the note: colleagues see "Away", as here. The contract, as Rooms
// (lib/away.ts) and People (lib/away.ts) read it:
//
//   leave.approved  { member, from, to, fromHalf, toHalf, request }
//   leave.cancelled { member, from, to, fromHalf, toHalf, request }
//
// dates "YYYY-MM-DD"; fromHalf "pm" starts at noon, toHalf "am" ends at
// noon. Key: "leave:<request>:<approved|cancelled>:<outbox id>".
//
// Told: each approved **absence** (a kind with away = true) that is not
// over. A kind that is not an absence (remote work, training: "not away"
// in Settings) is never told: neither receiver reads a kind, and Rooms
// would mark a remote worker "Off" and free their desk. When a leave no
// longer stands — cancelled, its approval taken back, cancelled by a last
// day, its kind now "not away" — leave.cancelled. When a last day cuts it,
// leave.cancelled then leave.approved for the days that remain: Rooms adds
// the days of an approval and takes back all of a request's days on a
// cancellation, People keeps the latest word per request — so the pair
// shortens it for both, within the contract they already read (no new
// event type for them to learn).
//
// shareLeave compares what is approved with what was told (shared_leave),
// writes what changed into the outbox (leave_outbox) in one transaction,
// then publishes what waits, oldest first. It runs after every change,
// after the Chest's and People's events, and each weekday morning
// (keepInLine): whichever way a leave changed, it is told, and what the
// Chest could not take (not linked yet, its hourly quota, unreachable) is
// tried again at the next run.

export const shareLimits = { perRun: 200, keepPublishedHours: 24, keepWaitingDays: 90 } as const;

type Told = { member: string; from: string; to: string; fromHalf: Half; toHalf: Half; request: string };
type Type = "leave.approved" | "leave.cancelled";

const rawOf = (t: Pick<Told, "from" | "to" | "fromHalf" | "toHalf">) => `${t.from}|${t.to}|${t.fromHalf}|${t.toHalf}`;

function fromRaw(raw: string, member: string, request: string): Told | null {
  const [from, to, fromHalf, toHalf] = raw.split("|");
  if (!from || !to || (fromHalf !== "am" && fromHalf !== "pm") || (toHalf !== "am" && toHalf !== "pm")) return null;
  return { member, from, to, fromHalf, toHalf, request };
}

export const leaveEventKey = (type: Type, request: string, id: string): string =>
  `leave:${request}:${type === "leave.approved" ? "approved" : "cancelled"}:${id}`;

type Row = { id: string; member_id: string; start: string; start_half: Half; end: string; end_half: Half; status: string; away: boolean };

// plan writes what changed since the last run into the outbox. Says how
// many events it wrote.
export async function plan(sql: Sql, now = new Date()): Promise<number> {
  return sql.begin(async tx => {
    // Two runs at once (an action and an event) write each change once.
    await tx`select pg_advisory_xact_lock(hashtext('leave.shared_leave'))`;
    const from = addDays(today(now, chest.timeZone()), -1);
    const told = new Map((await tx<{ request_id: string; member_id: string; raw: string }[]>`select request_id::text, member_id, raw from shared_leave`).map(r => [r.request_id, r]));
    const rows = await tx<Row[]>`
      select r.id::text as id, r.member_id, to_char(r.start_date, 'YYYY-MM-DD') as start, r.start_half, to_char(r.end_date, 'YYYY-MM-DD') as end, r.end_half, r.status, t.away
      from requests r join leave_types t on t.id = r.type_id
      where (r.status = 'approved' and t.away and r.member_id ~ '^mbr_[a-z2-7]{26}$' and r.end_date >= ${from}::date)
        or r.id = any(${[...told.keys()]}::bigint[])`;
    const byId = new Map(rows.map(r => [r.id, r]));
    let written = 0;
    const put = async (type: Type, t: Told) => {
      await tx`insert into leave_outbox (type, data) values (${type}, ${tx.json(t)})`;
      written++;
    };
    for (const id of new Set([...told.keys(), ...byId.keys()])) {
      const r = byId.get(id);
      const before = told.get(id);
      const cur: Told | null = r ? { member: r.member_id, from: r.start, to: r.end, fromHalf: r.start_half, toHalf: r.end_half, request: id } : null;
      const stands = !!r && r.status === "approved" && r.away && r.member_id === (before?.member_id ?? r.member_id) && /^mbr_/u.test(r.member_id);
      const wanted = stands && r!.end >= from;
      if (before && cur && stands && before.raw === rawOf(cur)) {
        // Unchanged; once over, forgotten (the receivers drop past days).
        if (!wanted) await tx`delete from shared_leave where request_id = ${id}`;
        continue;
      }
      if (before) {
        // What was told no longer stands as told: taken back — with the
        // days the receivers hold (a leave told before this version: its
        // days now, the request is the same).
        const was = fromRaw(before.raw, before.member_id, id) ?? (cur && { ...cur, member: before.member_id });
        if (was) await put("leave.cancelled", was);
        await tx`delete from shared_leave where request_id = ${id}`;
      }
      if (wanted && cur) {
        await put("leave.approved", cur);
        await tx`insert into shared_leave (request_id, member_id, raw) values (${id}, ${cur.member}, ${rawOf(cur)})`;
      }
    }
    return written;
  });
}

// publish tells what waits, oldest first, and stops at the first refusal
// of the Chest (the next run tries again). The same key twice is one event
// for the Chest: two runs at once publish nothing twice. Says how many
// were published.
export async function publish(sql: Query): Promise<number> {
  const rows = await sql<{ id: string; type: Type; data: Told }[]>`
    select id::text as id, type, data from leave_outbox where published_at is null order by id limit ${shareLimits.perRun}`;
  let told = 0;
  for (const row of rows) {
    try {
      await events.publish(row.type, row.data, { key: leaveEventKey(row.type, row.data.request, row.id) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // A key the Chest already holds for another event would be refused
      // for ever: a bug, said, and not tried again.
      if (error.code !== "key_conflict") {
        console.warn(`${row.type} not published yet: ${error.code}`);
        return told;
      }
      console.error(`${row.type} refused: key_conflict`);
    }
    await sql`update leave_outbox set published_at = now() where id = ${row.id}`;
    told++;
  }
  return told;
}

// forgetOld drops what was published a day ago (past the key's window),
// and what waited for days that are over (the receivers drop past days) or
// for 90 days.
export async function forgetOld(sql: Query, now = new Date()): Promise<void> {
  const from = addDays(today(now, chest.timeZone()), -1);
  await sql`delete from leave_outbox
    where (published_at is not null and published_at < ${new Date(now.getTime() - shareLimits.keepPublishedHours * 3_600_000)})
      or (published_at is null and (data->>'to' < ${from} or at < ${new Date(now.getTime() - shareLimits.keepWaitingDays * 86_400_000)}))`;
}

// shareLeave: plan, then publish (see above).
export async function shareLeave(sql: Sql, now = new Date()): Promise<number> {
  await plan(sql, now);
  await forgetOld(sql, now);
  return publish(sql);
}

// A member erased: what was told of them and what waits is forgotten (the
// receivers forget them on their own member.erased).
export async function forgetMember(sql: Query, memberId: string): Promise<void> {
  await sql`delete from shared_leave where member_id = ${memberId}`;
  await sql`delete from leave_outbox where data->>'member' = ${memberId}`;
}

// keepInLine brings what the other side of the Chest shows of the approved
// leave in line with it: what Rooms and People were told (above), each
// person's calendar feed (lib/leave-calendar.ts) and their busy times for
// Booking and Hiring (lib/busy.ts). Run after every change, after the
// Chest's and People's events, and each morning (recheck: a Chest that
// refused the calendar is asked again). Never fails the change.
export async function keepInLine(sql: Sql, options: { recheck?: boolean } = {}): Promise<void> {
  try {
    await shareLeave(sql);
  } catch (error) {
    console.error("leave events: not in line", error instanceof Error ? error.name : "error");
  }
  try {
    await sync(sql, options.recheck ? { recheck: true, max: 2000 } : {});
    await shareBusy(sql);
  } catch (error) {
    console.error("calendar and busy times: not in line", error instanceof Error ? error.name : "error");
  }
}
