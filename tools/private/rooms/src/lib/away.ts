import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Query, Sql } from "./db.ts";
import { addDays, daysBetween, today } from "../shared/model.ts";
import { dayKey, enqueue } from "./calendar.ts";
import { cancelDeskBookings } from "./places.ts";
import { presenceHorizon } from "./presence.ts";

// What Leave tells Rooms (Proposal (studio): events between tools, once an
// admin linked the two): a leave approved marks its whole days "Off" for
// that person and frees their desk those days (told again with fewer days,
// the others open again); a leave cancelled takes back the days it marked
// (never what the person set themselves since). Events come at least once
// and not always in order: each request keeps Leave's latest word, by when
// it happened (leave_words, below). Half
// days change nothing: the person may come for the other half. The kind of
// leave never comes: colleagues see "Off", as in Leave.
//
// Data, as Leave publishes it: { member, from, to, fromHalf, toHalf, request }
// — dates "YYYY-MM-DD", halves "am" | "pm" | "day".
type Told = { member: string; from: string; to: string; fromHalf: string; toHalf: string; request: string };

function read(data: Record<string, unknown>): Told | null {
  const date = /^\d{4}-\d{2}-\d{2}$/u;
  const { member, from, to, fromHalf, toHalf, request } = data;
  if (typeof member !== "string" || !/^mbr_[a-z2-7]{26}$/u.test(member)) return null;
  if (typeof from !== "string" || typeof to !== "string" || !date.test(from) || !date.test(to) || to < from) return null;
  if (typeof request !== "string" || !/^[A-Za-z0-9._:-]{1,60}$/u.test(request)) return null;
  const half = (h: unknown) => (h === "am" || h === "pm" || h === "day" ? h : "day");
  return { member, from, to, fromHalf: half(fromHalf), toHalf: half(toHalf), request };
}

const ref = (t: Pick<Told, "request">) => `leave:${t.request}`;

// The whole days of a leave, from today to the presence horizon.
export function wholeDays(t: Pick<Told, "from" | "to" | "fromHalf" | "toHalf">, now: string): string[] {
  const days: string[] = [];
  const last = addDays(now, presenceHorizon);
  for (let d = t.from < now ? now : t.from; d <= t.to && d <= last && days.length < 400; d = addDays(d, 1)) {
    // A leave starting in the afternoon, or ending at noon, is half that day.
    if (d === t.from && t.fromHalf === "pm") continue;
    if (d === t.to && t.toHalf === "am") continue;
    days.push(d);
  }
  return days;
}

// When Leave says it happened (the event's occurredAt: the time Leave gave,
// or the Chest's when it gave none); now when it says nothing usable.
function toldAt(value: unknown): Date {
  const d = typeof value === "string" ? new Date(value) : new Date(NaN);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60_000 ? new Date() : d;
}

// The days a request marked "Off" that it no longer marks (from `since`
// on, when given): open again (the usual week may say them), and out of
// the person's calendar.
async function takeBack(tx: Query, member: string, request: string, keep: readonly string[], since?: string): Promise<number> {
  const days = (await tx<{ day: string }[]>`
    delete from presence where member_id = ${member} and leave_ref = ${ref({ request })}
      and not (day = any(${[...keep]}::date[])) ${since ? tx`and day >= ${since}::date` : tx``}
    returning to_char(day, 'YYYY-MM-DD') as day`).map(r => r.day);
  if (days.length > 0) await tx`delete from usual_applied where member_id = ${member} and day in ${tx(days)}`;
  await enqueue(tx, days.map(d => dayKey(member, d)));
  return days.length;
}

// Each request keeps Leave's latest word (leave_words, by occurredAt): a
// word older than the one kept changes nothing. At the same moment, an
// approval wins over a cancellation: that pair is a leave shortened (Leave
// tells leave.cancelled, then leave.approved for the days that remain), and
// the remaining days must stay whichever of the two arrives last.
export async function leaveApproved(sql: Sql, event: ToolEvent, zone: string): Promise<number> {
  const t = read(event.data);
  if (!t || daysBetween(t.from, t.to) > 400) return 0;
  const at = toldAt(event.occurredAt);
  const now = today(zone);
  const days = wholeDays(t, now);
  return sql.begin(async tx => {
    const latest = await tx`
      insert into leave_words (request, member_id, told_at, cancelled, to_day) values (${t.request}, ${t.member}, ${at}, false, ${t.to})
      on conflict (request) do update set told_at = excluded.told_at, cancelled = false, to_day = excluded.to_day
      where leave_words.member_id = excluded.member_id and leave_words.told_at <= excluded.told_at
      returning request`;
    if (latest.length === 0) return 0;
    // An earlier approval of the same request may have covered more days
    // (the days already past stay as they were).
    await takeBack(tx, t.member, t.request, days, now);
    if (days.length === 0) return 0;
    for (const d of days) {
      await tx`
        insert into presence (member_id, day, status, office_id, leave_ref) values (${t.member}, ${d}, 'off', null, ${ref(t)})
        on conflict (member_id, day) do update set status = 'off', office_id = null, leave_ref = excluded.leave_ref, usual = false`;
    }
    await cancelDeskBookings(tx, "chest", tx`b.member_id = ${t.member} and b.day in ${tx(days)} and upper(b.during) > now()`);
    await enqueue(tx, days.map(d => dayKey(t.member, d)));
    return days.length;
  });
}

export async function leaveCancelled(sql: Sql, event: ToolEvent): Promise<number> {
  const request = event.data["request"];
  const member = event.data["member"];
  if (typeof request !== "string" || !/^[A-Za-z0-9._:-]{1,60}$/u.test(request) || typeof member !== "string" || !/^mbr_[a-z2-7]{26}$/u.test(member)) return 0;
  const at = toldAt(event.occurredAt);
  return sql.begin(async tx => {
    const latest = await tx`
      insert into leave_words (request, member_id, told_at, cancelled, to_day) values (${request}, ${member}, ${at}, true, null)
      on conflict (request) do update set told_at = excluded.told_at, cancelled = true
      where leave_words.member_id = excluded.member_id
        and (leave_words.told_at < excluded.told_at or (leave_words.told_at = excluded.told_at and leave_words.cancelled))
      returning request`;
    if (latest.length === 0) return 0;
    return takeBack(tx, member, request, []);
  });
}
