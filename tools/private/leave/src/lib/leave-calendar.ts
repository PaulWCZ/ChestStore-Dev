import { log } from "@argentic/chest-app";
import * as calendar from "@argentic/chest-sdk/calendar";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { addDays } from "../shared/calendar.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, locales } from "../i18n/index.ts";
import { today } from "./today.ts";
import { instants, wholeDays } from "./spans.ts";
import { zonesOf, type ZoneOf } from "./zones.ts";

// My approved leave in my calendar (Proposal (studio): the Chest's calendar
// bridge, chest.proposals.json "calendar"). Each approved absence — asked
// and approved, declared (sick leave), recorded by HR or imported; not
// remote work nor another kind that is not an absence — is an event
// in its person's own Chest calendar feed, which Google Calendar, Outlook
// or Apple Calendar subscribe to once; Leave never serves a feed.
//
// Private by default, and it never says why: the title is "Off" ("Absent"),
// never the kind of leave nor its note — a feed can be shared with
// colleagues, or shown on a screen — and the event is CLASS:PRIVATE, so a
// calendar shared with colleagues shows the time as busy without its word.
// Whole days are whole days; a half day is noon to midnight or midnight to
// noon, in the zone the person works in (lib/zones.ts, lib/spans.ts). The event opens the
// request (/chest/requests/<id>), which only the person, their approvers
// and HR may read.
//
// How it stays right: sync() compares the approved leave with what was put
// (calendar_events) and puts what changed — 100 a call with putMany for a
// first sync — and takes back what no longer stands: cancelled, its
// approval taken back, cut or cancelled by a last day, erased, or over for
// a month (keepDays: the Chest keeps 5,000 events per tool). It runs after
// every change (src/actions.ts, the answer sent first), after the
// Chest's and People's events, and every morning.
//
// A Chest without the calendar refuses (CapabilityNotGranted): Leave
// remembers it (settings.calendar = 'off'), asks again at most once an
// hour and every morning, and the home stops promising the calendar.

export const keepDays = 30;
// The Chest's page of the member's calendar feed, on the team host (its
// front serves it; SDK 0.4.1-studio.2 publishes no name for it).
export const feedPage = "/_chest/calendar";
const eventKey = (id: string) => `leave:${id}`;

export type Row = { id: string; member_id: string; start: string; start_half: "am" | "pm"; end: string; end_half: "am" | "pm" };
// What was put: a half day's hours also depend on the person's zone, so a
// new zone puts it again; whole days are the same everywhere.
const raw = (r: Row, zone: string) => {
  const span = [r.member_id, r.start, r.start_half, r.end, r.end_half];
  return (wholeDays({ start: r.start, startHalf: r.start_half, end: r.end, endHalf: r.end_half }) ? span : [...span, zone]).join("|");
};

export type State = "unknown" | "on" | "off";
export async function state(sql: Query): Promise<State> {
  const [row] = await sql<{ calendar: State }[]>`select calendar from settings`;
  return row?.calendar ?? "unknown";
}

async function remember(sql: Query, value: "on" | "off"): Promise<void> {
  await sql`update settings set calendar = ${value}, calendar_at = now()`;
}

// The approved leave a feed should show now, a month back to the Chest's
// two years ahead. Only absences: a kind that is not one (remote work,
// training: away = false) is not "Off".
async function eligible(sql: Query, now: Date): Promise<Row[]> {
  const day = today(now);
  return sql<Row[]>`
    select r.id::text, r.member_id, to_char(r.start_date, 'YYYY-MM-DD') as start, r.start_half, to_char(r.end_date, 'YYYY-MM-DD') as end, r.end_half
    from requests r join leave_types t on t.id = r.type_id
    where r.status = 'approved' and r.member_id <> 'erased' and t.away
      and r.end_date >= ${addDays(day, -keepDays)}::date and r.start_date <= ${addDays(day, calendar.limits.aheadDays - 1)}::date
    order by r.start_date, r.id
    limit ${calendar.limits.events}`;
}

export function eventOf(r: Row, timeZone: string): calendar.CalendarEvent {
  const title = Object.fromEntries(locales.map(l => [l, catalogue(l).feed.title]));
  const when = wholeDays({ start: r.start, startHalf: r.start_half, end: r.end, endHalf: r.end_half })
    ? { days: { first: r.start, last: r.end } }
    : instants({ start: r.start, startHalf: r.start_half, end: r.end, endHalf: r.end_half }, timeZone);
  return { key: eventKey(r.id), members: [r.member_id], title, ...when, path: `/chest/requests/${r.id}`, busy: true, private: true };
}

// What stops a run: no calendar here (remembered), or the Chest asks to
// slow down or cannot answer (the next run goes on).
class Stop extends Error {}
async function refused(sql: Query, error: unknown): Promise<"skip"> {
  if (!(error instanceof ChestError)) throw error;
  if (error.code === "invalid_event") return "skip";
  if (error instanceof CapabilityNotGranted) await remember(sql, "off");
  throw new Stop();
}

async function kept(sql: Query, r: Row, zone: string): Promise<void> {
  await sql`insert into calendar_events (key, raw) values (${eventKey(r.id)}, ${raw(r, zone)})
    on conflict (key) do update set raw = excluded.raw, put_at = now()`;
}

// putAll puts the rows, 100 a call, and records each event the Chest took.
// The Chest answers each event (studio.16): one it refuses (a wrong date,
// a new key past its 5,000 events) is never recorded as put — it is tried
// again at the next run — while the others of its batch are. Each person's
// half days in their own zone (a zone for all: a test). Exported for its
// test.
export async function putAll(sql: Query, rows: Row[], zones: ZoneOf | string): Promise<number> {
  const zoneOf: ZoneOf = typeof zones === "string" ? () => zones : zones;
  let count = 0;
  for (let i = 0; i < rows.length; i += calendar.limits.perBatch) {
    const batch = rows.slice(i, i + calendar.limits.perBatch);
    let results: calendar.PutResult[];
    try {
      results = await calendar.putMany(batch.map(r => eventOf(r, zoneOf(r.member_id))));
    } catch (error) {
      // About the call, not an event: no calendar, slow down, unreachable.
      await refused(sql, error);
      throw new Stop();
    }
    for (const result of results) {
      const r = batch[result.index];
      if (!r) continue;
      if (!result.ok) {
        log.warn("calendar: an event not put", { reason: result.reason });
        continue;
      }
      await kept(sql, r, zoneOf(r.member_id));
      count++;
    }
    await remember(sql, "on");
  }
  return count;
}

// sync brings the feeds in line with the approved leave, at most `max`
// changes a run (the next run goes on). With `recheck` (the morning), a
// Chest that refused the calendar is asked again. Never throws for the
// Chest: the tool's pages stay the truth.
export async function sync(sql: Sql, options: { max?: number; recheck?: boolean; now?: Date } = {}): Promise<{ put: number; removed: number }> {
  const max = options.max ?? 300;
  const now = options.now ?? new Date();
  const done = { put: 0, removed: 0 };
  try {
    const [s] = await sql<{ calendar: State; calendar_at: Date | null }[]>`select calendar, calendar_at from settings`;
    if (s?.calendar === "off" && !options.recheck && s.calendar_at && now.getTime() - s.calendar_at.getTime() < 3600_000) return done;
    const rows = await eligible(sql, now);
    const want = new Map(rows.map(r => [eventKey(r.id), r]));
    const known = new Map((await sql<{ key: string; raw: string }[]>`select key, raw from calendar_events`).map(k => [k.key, k.raw]));
    for (const key of known.keys()) {
      if (want.has(key)) continue;
      if (done.removed >= max) return done;
      try {
        await calendar.remove(key);
      } catch (error) {
        await refused(sql, error);
      }
      await sql`delete from calendar_events where key = ${key}`;
      done.removed++;
    }
    const zoneOf = await zonesOf(rows.map(r => r.member_id));
    const todo = (s?.calendar === "on" ? rows.filter(r => known.get(eventKey(r.id)) !== raw(r, zoneOf(r.member_id))) : rows).slice(0, Math.max(0, max - done.removed));
    done.put = await putAll(sql, todo, zoneOf);
  } catch (error) {
    if (!(error instanceof Stop)) log.error("calendar: not in line", error);
  }
  return done;
}
