import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError, type ErrorCode } from "./app-error.ts";
import type { Query } from "./db.ts";
import { busyTimes, NotACalendar } from "./ical.ts";

// The host's other calendars — Google, Outlook, Apple — read from their
// secret iCal address, so the times they are busy there are not offered
// here. The Chest lets the tool reach only the hosts it declared
// (chest.json "network", approved by the owner, through the Chest's
// proxy); the list below is the same, checked when a host pastes an
// address. What is kept of a calendar: its busy times, from … to …, nothing
// else. Read every 15 minutes (schedule "calendars"), when a visitor opens
// a booking page and the last read is older than 10 minutes, and when the
// host asks.

// The hosts calendars are read from: the manifest's "network" (a test
// keeps them equal). Apple's public calendars live on p01- to
// p199-caldav.icloud.com: "*.icloud.com" (the manifest's grammar has no
// other wildcard).
export const calendarHosts = ["calendar.google.com", "outlook.office365.com", "outlook.live.com", "*.icloud.com"] as const;
export const calendarLimits = { perHost: 3, bytes: 5 * 1024 * 1024, timeoutMs: 10_000, redirects: 3, aheadDays: 400, staleMinutes: 60, lazyMinutes: 10, everyMinutes: 15 } as const;

export type CalendarError = "unreachable" | "refused" | "not_found" | "not_calendar" | "too_large";
export type HostCalendar = { id: string; provider: string; hint: string; addedAt: Date; readAt: Date | null; triedAt: Date | null; error: CalendarError | null; events: number; stale: boolean };
// How the tool reaches the network: fetch (through the Chest's proxy, which
// Node's fetch follows with NODE_USE_ENV_PROXY); tests give their own.
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export function allowedHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/u, "");
  return calendarHosts.some(h => (h.startsWith("*.") ? name.endsWith(h.slice(1)) && name.length > h.length - 1 : name === h));
}

// calendarAddress reads what a host pastes: "webcal://" is https; only the
// declared hosts, no password in it, 2,000 characters at most. An address
// of a calendar's page rather than its feed is recognised before anything
// is read, and said as such (errors calendar_google_page, …): Google's
// app or its embed code, Outlook's app or the HTML link it shows beside
// the ICS one, iCloud's website.
export function calendarAddress(input: unknown): { url: string; provider: string } {
  if (typeof input !== "string") throw new AppError("invalid");
  let text = input.trim();
  if (text === "") throw new AppError("empty");
  if (/^webcals?:\/\//iu.test(text)) text = "https://" + text.replace(/^webcals?:\/\//iu, "");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("calendar_not_allowed");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedHost(url.hostname) || text.length > 2000) throw new AppError("calendar_not_allowed");
  const shape = pageShape(url);
  if (shape) throw new AppError(shape);
  url.hash = "";
  return { url: url.toString(), provider: url.hostname.toLowerCase() };
}

// pageShape: an address of a declared host that is a page, not a feed.
// Google's feeds are /calendar/ical/<calendar>/<private-…|public>/basic.ics;
// Outlook publishes …/calendar.html and …/calendar.ics side by side; an
// iCloud feed lives on pNN-caldav.icloud.com (or pNN-calendarws), its
// website on www.icloud.com.
function pageShape(url: URL): ErrorCode | null {
  const host = url.hostname.toLowerCase().replace(/\.$/u, "");
  const path = url.pathname.toLowerCase();
  if (host === "calendar.google.com") return path.startsWith("/calendar/ical/") ? null : "calendar_google_page";
  if (host === "outlook.office365.com" || host === "outlook.live.com") {
    if (path.endsWith(".html") || path.endsWith(".htm")) return "calendar_outlook_html";
    return path.endsWith(".ics") ? null : "calendar_outlook_page";
  }
  if (host === "icloud.com" || host === "www.icloud.com") return "calendar_apple_page";
  return null;
}

// The address as the host sees it again: its host and the end of its
// path, never the secret part.
function hint(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return `${u.hostname}/…${last.length > 12 ? last.slice(-8) : last.includes(".") ? last : ""}`;
  } catch {
    return "";
  }
}

// read fetches a calendar: redirects followed only to declared hosts, a
// time limit, a size limit. Its errors are CalendarError codes.
export async function read(url: string, fetcher: Fetcher = fetch): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= calendarLimits.redirects; hop++) {
    let response: Response;
    try {
      response = await fetcher(current, { redirect: "manual", signal: AbortSignal.timeout(calendarLimits.timeoutMs), headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.1" } });
    } catch {
      throw new ReadError("unreachable");
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) throw new ReadError("unreachable");
      const target = new URL(next, current);
      if (target.protocol !== "https:" || !allowedHost(target.hostname)) throw new ReadError("refused");
      current = target.toString();
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      throw new ReadError("not_found");
    }
    // 401, 403: the address was replaced, or the Chest's proxy refused it.
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new ReadError("refused");
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new ReadError("unreachable");
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > calendarLimits.bytes) {
      await response.body.cancel();
      throw new ReadError("too_large");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > calendarLimits.bytes) {
          await reader.cancel();
          throw new ReadError("too_large");
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ReadError) throw error;
      throw new ReadError("unreachable");
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  }
  throw new ReadError("unreachable");
}

export class ReadError extends Error {
  readonly code: CalendarError;
  constructor(code: CalendarError) {
    super(code);
    this.name = "ReadError";
    this.code = code;
  }
}

type Row = { id: string; member_id: string; url: string; provider: string; added_at: Date; read_at: Date | null; tried_at: Date | null; error: CalendarError | null; events: number };
const toCalendar = (r: Row, now: number): HostCalendar => ({
  id: String(r.id),
  provider: r.provider,
  hint: hint(r.url),
  addedAt: r.added_at,
  readAt: r.read_at,
  triedAt: r.tried_at,
  error: r.error,
  events: r.events,
  stale: r.error !== null || r.read_at === null || now - r.read_at.getTime() > calendarLimits.staleMinutes * 60000,
});

export async function calendarsOf(sql: Query, memberId: string, now = Date.now()): Promise<HostCalendar[]> {
  const rows = await sql<Row[]>`select * from calendars where member_id = ${memberId} order by added_at`;
  return rows.map(r => toCalendar(r, now));
}

// refresh reads one calendar again and keeps its busy times from a day
// back to 400 days ahead (the longest booking window), in one transaction;
// on failure the busy times already known stay, and the error is kept.
export async function refresh(sql: Query, calendarId: string, fetcher: Fetcher = fetch, now = Date.now()): Promise<CalendarError | null> {
  const [row] = await sql<(Row & { zone: string })[]>`select c.*, h.zone from calendars c join hosts h on h.member_id = c.member_id where c.id = ${calendarId}`;
  if (!row) return "not_found";
  let spans: { start: number; end: number }[];
  let events: number;
  try {
    const text = await read(row.url, fetcher);
    const found = busyTimes(text, { from: now - 86400000, to: now + calendarLimits.aheadDays * 86400000, zone: row.zone });
    spans = found.spans;
    events = found.events;
  } catch (error) {
    const code: CalendarError = error instanceof ReadError ? error.code : error instanceof NotACalendar ? "not_calendar" : "unreachable";
    await sql`update calendars set tried_at = ${new Date(now)}, error = ${code} where id = ${calendarId}`;
    return code;
  }
  const step = async (tx: Query) => {
    await tx`delete from busy where calendar_id = ${calendarId}`;
    for (let i = 0; i < spans.length; i += 500) {
      const part = spans.slice(i, i + 500).map(s => ({ calendar_id: calendarId, member_id: row.member_id, span: `[${new Date(s.start).toISOString()},${new Date(s.end).toISOString()})` }));
      await tx`insert into busy ${tx(part, "calendar_id", "member_id", "span")}`;
    }
    await tx`update calendars set tried_at = ${new Date(now)}, read_at = ${new Date(now)}, error = null, events = ${events} where id = ${calendarId}`;
  };
  await ("begin" in sql ? sql.begin(step) : sql.savepoint(step));
  return null;
}

// connect adds a calendar: read at once, so a wrong address is said now,
// not in 15 minutes.
export async function connect(sql: Query, actor: Member, address: unknown, fetcher: Fetcher = fetch, now = Date.now()): Promise<HostCalendar> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const { url, provider } = calendarAddress(address);
  const [host] = await sql<{ zone: string }[]>`select zone from hosts where member_id = ${actor.id}`;
  if (!host) throw new AppError("not_host");
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from calendars where member_id = ${actor.id}`;
  if ((count?.n ?? 0) >= calendarLimits.perHost) throw new AppError("too_many_calendars", { max: calendarLimits.perHost });
  let text: string;
  try {
    text = await read(url, fetcher);
    busyTimes(text, { from: now, to: now + 86400000, zone: host.zone });
  } catch (error) {
    const code: CalendarError = error instanceof ReadError ? error.code : error instanceof NotACalendar ? "not_calendar" : "unreachable";
    throw new AppError(`calendar_${code}` as ErrorCode);
  }
  const [row] = await sql<Row[]>`
    insert into calendars (member_id, url, provider) values (${actor.id}, ${url}, ${provider})
    on conflict (member_id, url) do update set error = null returning *`;
  await refresh(sql, String(row!.id), async () => new Response(text, { status: 200 }), now);
  // A calendar that reads: the host's busy times are known, their page is
  // public from now on (lib/booking.ts, ready).
  await sql`update hosts set ready = true where member_id = ${actor.id}`;
  const [again] = await sql<Row[]>`select * from calendars where id = ${row!.id}`;
  return toCalendar(again!, now);
}

export async function disconnect(sql: Query, actor: Member, calendarId: unknown): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (typeof calendarId !== "string" || !/^[1-9][0-9]{0,17}$/u.test(calendarId)) throw new AppError("not_found");
  const done = await sql`delete from calendars where id = ${calendarId} and member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_found");
}

// The host asks: read their calendars again now.
export async function refreshMine(sql: Query, actor: Member, fetcher: Fetcher = fetch, now = Date.now()): Promise<number> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const rows = await sql<{ id: string }[]>`select id::text as id from calendars where member_id = ${actor.id}`;
  let failed = 0;
  for (const r of rows) if (await refresh(sql, r.id, fetcher, now)) failed++;
  return failed;
}

// refreshDue: the schedule's run, and a visitor's page — the calendars not
// tried for minutes, the oldest first, one at a time, until the deadline.
export async function refreshDue(sql: Query, options: { olderThanMinutes: number; memberId?: string; deadline?: number; fetcher?: Fetcher; now?: number }): Promise<number> {
  const now = options.now ?? Date.now();
  const rows = await sql<{ id: string }[]>`
    select id::text as id from calendars
    where (tried_at is null or tried_at < ${new Date(now - options.olderThanMinutes * 60000)})
    ${options.memberId ? sql`and member_id = ${options.memberId}` : sql``}
    order by tried_at nulls first limit 500`;
  let done = 0;
  for (const r of rows) {
    if (options.deadline !== undefined && Date.now() > options.deadline) break;
    await refresh(sql, r.id, options.fetcher ?? fetch, now);
    done++;
  }
  return done;
}
