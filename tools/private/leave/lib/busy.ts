import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { busyFingerprint, busyLimits, busySnapshot, type Span } from "./busy-snapshot.ts";
import { addDays } from "./calendar.ts";
import type { Query } from "./db.ts";
import { today } from "./today.ts";
import { instants } from "./spans.ts";
import { zonesOf } from "./zones.ts";

// Busy times, for Booking (Proposal (studio): events between tools;
// chest.proposals.json "emits": "leave.busy"). Booking and Hiring tell each
// other when a member is taken ("booking.busy", "hiring.busy"); Leave tells
// when someone is on approved leave, so a host who is off is not bookable
// and an interviewer who is off is not offered to a candidate.
//
// leave.busy is the shared snapshot, version 1 (lib/busy-snapshot.ts):
//   { v: 1, member, at, from, to, spans: [[start, end], …] }
// from the start of today (UTC) to 90 days later; each approved leave its
// whole days in the zone the member works in (lib/zones.ts: the Chest's
// when the Chest does not say; noon for a half day, lib/spans.ts), as UTC
// minutes, merged. Times only — never the kind of leave, its note,
// who approved it, nor that it is leave at all. A pending request is not
// busy: nothing is decided; nor is a kind that is not an absence (remote
// work, training: away = false) — the person works.
//
// shareBusy runs after every change and every morning: a member whose
// times changed since they were last told is told again (shared_busy
// keeps each one's fingerprint), and every morning as the window moves
// on. Someone told "nothing" once is not told it again. The same content
// told within a day is one event; the key carries the time, so busy, free,
// busy again are three. A courtesy: when the Chest cannot take it (not
// linked, not granted, its hourly quota), it stops, and the next run goes
// on from there.

type Row = { member_id: string; start: string; start_half: "am" | "pm"; end: string; end_half: "am" | "pm" };

// Every member's approved leave that touches the window, as spans.
// The days are the Chest's (the database's current_date is its today); a
// day's margin on each side covers any member's zone.
async function spansByMember(sql: Query, now: number): Promise<Map<string, Span[]>> {
  const first = addDays(today(now), -1);
  const last = addDays(first, busyLimits.days + 2);
  const rows = await sql<Row[]>`
    select r.member_id, to_char(r.start_date, 'YYYY-MM-DD') as start, r.start_half, to_char(r.end_date, 'YYYY-MM-DD') as end, r.end_half
    from requests r join leave_types t on t.id = r.type_id
    where r.status = 'approved' and r.member_id ~ '^mbr_' and t.away and r.end_date >= ${first}::date and r.start_date <= ${last}::date`;
  const zoneOf = await zonesOf(rows.map(r => r.member_id));
  const found = new Map<string, Span[]>();
  for (const r of rows) {
    const { start, end } = instants({ start: r.start, startHalf: r.start_half, end: r.end, endHalf: r.end_half }, zoneOf(r.member_id));
    found.set(r.member_id, [...(found.get(r.member_id) ?? []), { start: start.getTime(), end: end.getTime() }]);
  }
  return found;
}

// shareBusy tells the members whose busy times changed (all of them, or
// only these). Says how many were told.
export async function shareBusy(sql: Query, options: { members?: string[]; now?: number; max?: number } = {}): Promise<number> {
  const now = options.now ?? Date.now();
  const max = options.max ?? 500;
  const spans = await spansByMember(sql, now);
  const known = new Map((await sql<{ member_id: string; hash: string; empty: boolean }[]>`select member_id, hash, empty from shared_busy`).map(r => [r.member_id, r]));
  const ids = [...new Set([...spans.keys(), ...[...known].filter(([, k]) => !k.empty).map(([id]) => id)])]
    .filter(id => !options.members || options.members.includes(id))
    .sort();
  let told = 0;
  for (const member of ids) {
    if (told >= max) break;
    const snapshot = busySnapshot(member, spans.get(member) ?? [], now);
    const hash = createHash("sha256").update(busyFingerprint(snapshot)).digest("hex");
    const before = known.get(member);
    const empty = snapshot.spans.length === 0;
    if (before?.hash === hash || (empty && (!before || before.empty))) continue;
    try {
      await events.publish("leave.busy", snapshot, { key: `leave.busy:${member}:${now}:${hash}` });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      return told;
    }
    await sql`insert into shared_busy (member_id, hash, empty, told_at) values (${member}, ${hash}, ${empty}, ${new Date(now)})
      on conflict (member_id) do update set hash = excluded.hash, empty = excluded.empty, told_at = excluded.told_at`;
    told++;
  }
  return told;
}

// A member erased: what Leave last told of them is forgotten (their ids
// are gone from the requests; Booking forgets them on its own erasure).
export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`delete from shared_busy where member_id = ${memberId}`;
}
