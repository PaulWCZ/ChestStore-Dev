import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Query, Sql } from "./db.ts";
import { addDays, daysBetween, memberPattern } from "./model.ts";
import { present } from "./people.ts";

// Who is away today (Proposal (studio): events between tools, once an admin
// linked Leave to People). Leave tells when a leave is approved and when it
// no longer stands; People shows "Away · back on Monday 12 October" on the
// person's card and profile while an approved leave covers today, in the
// Chest's time zone. Never the kind of leave nor its note: Leave does not
// send them, and People would not show them.
//
// Data, as Leave publishes it:
//   leave.approved  { member, from, to, fromHalf, toHalf, request }
//   leave.cancelled { member, from, to, fromHalf, toHalf, request }
// — dates "YYYY-MM-DD"; fromHalf "pm" starts at noon, toHalf "am" ends at
// noon ("day" or absent: the whole day). Anything of another shape is
// accepted and ignored.
//
// Kept: the member, the dates and halves, the request's reference (to take
// it back) and when Leave said so — nothing else; a leave is forgotten once
// its last day is past, and when the person leaves the Chest. A cancelled
// leave keeps its reference and time for a week, so an approval delivered
// late (events come at least once, not always in order) cannot bring it
// back.

export type Half = "am" | "pm";
export type Span = { from: string; to: string; fromHalf: Half | "day"; toHalf: Half | "day" };
type Told = Span & { member: string; request: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const refPattern = /^[A-Za-z0-9._:-]{1,60}$/u;
export const keepCancelledDays = 7;

const isDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

// readLeave checks every field of a Leave event; null for another shape.
export function readLeave(data: Record<string, unknown>): Told | null {
  const { member, from, to, fromHalf, toHalf, request } = data;
  if (typeof member !== "string" || !memberPattern.test(member)) return null;
  if (typeof request !== "string" || !refPattern.test(request)) return null;
  if (!isDay(from) || !isDay(to) || to < from || daysBetween(from, to) > 400) return null;
  const half = (h: unknown): Half | "day" | null => (h === undefined || h === null || h === "day" ? "day" : h === "am" || h === "pm" ? h : null);
  const fh = half(fromHalf), th = half(toHalf);
  if (fh === null || th === null) return null;
  return { member, from, to, fromHalf: fh, toHalf: th, request };
}

// Does this span cover that half of that day?
export function covers(s: Span, day: string, half: Half): boolean {
  if (day < s.from || day > s.to) return false;
  if (day === s.from && s.fromHalf === "pm" && half === "am") return false;
  if (day === s.to && s.toHalf === "am" && half === "pm") return false;
  return true;
}

const weekend = (day: string) => {
  const d = new Date(day + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
};

// What a person's approved leaves say of today: away the whole day, this
// morning only or this afternoon only, and when they are back — the first
// half day of a weekday (Monday to Friday) that no leave covers, following
// leaves that follow each other. null when they are here today.
export type Away = { today: "day" | Half; back: { day: string; half: Half } };

export function awayToday(spans: readonly Span[], now: string): Away | null {
  const am = spans.some(s => covers(s, now, "am"));
  const pm = spans.some(s => covers(s, now, "pm"));
  if (!am && !pm) return null;
  let day = now;
  let half: Half = am ? "am" : "pm";
  for (let i = 0; i < 1000; i++) {
    if (!weekend(day) && !spans.some(s => covers(s, day, half))) break;
    if (half === "am") half = "pm";
    else {
      half = "am";
      day = addDays(day, 1);
    }
  }
  return { today: am && pm ? "day" : am ? "am" : "pm", back: { day, half } };
}

// The words of the badge: "Away this afternoon", "Away · back on …".
export type AwayWords = { away: string; morning: string; afternoon: string; back: string; backAfternoon: string };

export function awayText(a: Away, now: string, w: AwayWords, formatDay: (day: string) => string, format: (text: string, values: Record<string, string>) => string): string {
  const head = a.today === "am" ? w.morning : a.today === "pm" ? w.afternoon : w.away;
  // Back at the very next half day: "Away this morning" says it all.
  const next = a.today === "am" ? { day: now, half: "pm" } : a.today === "pm" ? nextWeekday(now) : null;
  if (next && a.back.day === next.day && a.back.half === next.half) return head;
  const date = formatDay(a.back.day);
  return head + " · " + format(a.back.half === "pm" ? w.backAfternoon : w.back, { date });
}

function nextWeekday(day: string): { day: string; half: Half } {
  let d = addDays(day, 1);
  while (weekend(d)) d = addDays(d, 1);
  return { day: d, half: "am" };
}

// Each request keeps Leave's latest word, by the event's occurredAt (the
// time of the change, as Leave gives it): an older word changes nothing.
// At the same moment an approval wins over a cancellation — as in Rooms
// (tools/private/rooms/lib/away.ts): that pair is a leave shortened (Leave
// tells leave.cancelled, then leave.approved for the days that remain),
// and the remaining days must stay whichever of the two is delivered last.

// A leave approved: kept for a member of the Chest, if not already taken
// back by a later word. The same request told again (new dates) replaces
// the old ones.
export async function leaveApproved(sql: Sql, event: ToolEvent, now: string): Promise<boolean> {
  if (event.source !== "leave") return false;
  const t = readLeave(event.data);
  if (!t || t.to < now) return false;
  // Only for a member who has People; when the Chest cannot be asked, this
  // throws and the Chest delivers the event again later.
  if (!(await present([t.member])).has(t.member)) return false;
  const at = validTime(event.occurredAt);
  const done = await sql`
    insert into away (request, member_id, from_day, to_day, from_half, to_half, told_at)
    values (${t.request}, ${t.member}, ${t.from}, ${t.to}, ${t.fromHalf}, ${t.toHalf}, ${at})
    on conflict (request) do update set member_id = excluded.member_id, from_day = excluded.from_day, to_day = excluded.to_day,
      from_half = excluded.from_half, to_half = excluded.to_half, told_at = excluded.told_at, cancelled = false
    where away.told_at <= excluded.told_at`;
  return done.count > 0;
}

// A leave that no longer stands: its days go (only its own: the reference
// names it).
export async function leaveCancelled(sql: Sql, event: ToolEvent): Promise<boolean> {
  if (event.source !== "leave") return false;
  const { member, request } = event.data;
  if (typeof member !== "string" || !memberPattern.test(member) || typeof request !== "string" || !refPattern.test(request)) return false;
  const at = validTime(event.occurredAt);
  const done = await sql`
    insert into away (request, member_id, from_day, to_day, from_half, to_half, told_at, cancelled)
    values (${request}, ${member}, null, null, 'day', 'day', ${at}, true)
    on conflict (request) do update set from_day = null, to_day = null, from_half = 'day', to_half = 'day', told_at = excluded.told_at, cancelled = true
    where away.member_id = excluded.member_id
      and (away.told_at < excluded.told_at or (away.told_at = excluded.told_at and away.cancelled))`;
  return done.count > 0;
}

// When the Chest says the event happened; now when it says nothing usable.
function validTime(value: unknown): Date {
  const d = typeof value === "string" ? new Date(value) : new Date(NaN);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60_000 ? new Date() : d;
}

// Who is away today, among these people (the directory's).
export async function awayOf(sql: Query, ids: readonly string[], now: string): Promise<Map<string, Away>> {
  const found = new Map<string, Away>();
  if (ids.length === 0) return found;
  const rows = await sql<{ member_id: string; from_day: string; to_day: string; from_half: Half | "day"; to_half: Half | "day" }[]>`
    select member_id, to_char(from_day, 'YYYY-MM-DD') as from_day, to_char(to_day, 'YYYY-MM-DD') as to_day, from_half, to_half from away
    where not cancelled and member_id = any(${[...ids]}::text[]) and to_day >= ${now}::date
    order by member_id, from_day limit 5000`;
  const byMember = new Map<string, Span[]>();
  for (const r of rows) byMember.set(r.member_id, [...(byMember.get(r.member_id) ?? []), { from: r.from_day, to: r.to_day, fromHalf: r.from_half, toHalf: r.to_half }]);
  for (const [member, spans] of byMember) {
    const a = awayToday(spans, now);
    if (a) found.set(member, a);
  }
  return found;
}

// Forgotten once past; a cancelled one after a week.
export async function purgeAway(sql: Query, now: string): Promise<number> {
  const gone = await sql`
    delete from away where (not cancelled and to_day < ${now}::date)
      or (cancelled and told_at < now() - make_interval(days => ${keepCancelledDays}))
    returning request`;
  return gone.length;
}

// Someone who leaves the Chest (or is erased): their leaves are forgotten.
export async function forgetAway(sql: Query, memberId: string): Promise<void> {
  await sql`delete from away where member_id = ${memberId}`;
}
