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
// noon. Key: "leave:<request>:<approved|cancelled>:<outbox id>:<member>".
// occurredAt: the time of the change, while the Chest takes it (publish).
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

// The key carries whom the event is about (SDK README, studio.16): after a
// restore from a backup, the outbox's ids start again and an id could name
// another person's word the Chest still remembers.
export const leaveEventKey = (type: Type, request: string, id: string, member: string): string =>
  `leave:${request}:${type === "leave.approved" ? "approved" : "cancelled"}:${id}:${member}`;

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
    // at is the time of the change (the transaction's). An approval that
    // follows a cancellation of the same request in this run (a leave
    // shortened) is a millisecond later: receivers keep the latest word per
    // request by its time, and the pair would otherwise tie.
    const put = async (type: Type, t: Told, later = false) => {
      await tx`insert into leave_outbox (type, data, at) values (${type}, ${tx.json(t)}, now() + ${later ? "1 millisecond" : "0"}::interval)`;
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
      let cancelled = false;
      if (before) {
        // What was told no longer stands as told: taken back — with the
        // days the receivers hold (a leave told before this version: its
        // days now, the request is the same).
        const was = fromRaw(before.raw, before.member_id, id) ?? (cur && { ...cur, member: before.member_id });
        if (was) {
          await put("leave.cancelled", was);
          cancelled = true;
        }
        await tx`delete from shared_leave where request_id = ${id}`;
      }
      if (wanted && cur) {
        await put("leave.approved", cur, cancelled);
        await tx`insert into shared_leave (request_id, member_id, raw) values (${id}, ${cur.member}, ${rawOf(cur)})`;
      }
    }
    return written;
  });
}

// occurredAt (studio.16): an event carries the time of its change while
// the Chest takes it — up to 24 hours back; we stop an hour short, for the
// clocks and a slow run —, so a receiver that orders words by time orders
// them as they happened even when told late. Older, it goes without, and
// the Chest stamps the time it takes it (later, never earlier, than the
// change). A request's words written together (a cancellation and the
// approval of a shortened leave) are judged together — by the first one's
// time —, so the approval never carries an old time while its cancellation
// carries the Chest's newer one.
export const occurredWindowMs = 23 * 3_600_000;

export function occurredAtFor(first: Date, at: Date, now: number = Date.now()): Date | undefined {
  // A database clock ahead of the container's by more than the Chest takes
  // (a minute): without, rather than refused for ever.
  return first.getTime() >= now - occurredWindowMs && at.getTime() <= now + 30_000 ? at : undefined;
}

// publish tells what waits, oldest first, and stops at the first refusal
// of the Chest (the next run tries again). The same key twice is one event
// for the Chest: two runs at once publish nothing twice. Says how many
// were published.
export async function publish(sql: Query, now: () => number = Date.now): Promise<number> {
  const rows = await sql<{ id: string; type: Type; data: Told; at: Date; first: Date }[]>`
    select o.id::text as id, o.type, o.data, o.at,
      (select min(p.at) from leave_outbox p
        where p.data->>'request' = o.data->>'request' and p.id <= o.id and p.at >= o.at - interval '1 second') as first
    from leave_outbox o where o.published_at is null order by o.id limit ${shareLimits.perRun}`;
  let told = 0;
  // Requests told without their time in this run: their next words too.
  const untimed = new Set<string>();
  for (const row of rows) {
    try {
      const occurredAt = untimed.has(row.data.request) ? undefined : occurredAtFor(row.first, row.at, now());
      if (!occurredAt) untimed.add(row.data.request);
      const key = leaveEventKey(row.type, row.data.request, row.id, row.data.member);
      try {
        await events.publish(row.type, row.data, { key, ...(occurredAt ? { occurredAt } : {}) });
      } catch (error) {
        // The time refused (the Chest's clock against ours): told without.
        if (!occurredAt || !(error instanceof ChestError) || error.code !== "invalid_event") throw error;
        untimed.add(row.data.request);
        await events.publish(row.type, row.data, { key });
      }
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
