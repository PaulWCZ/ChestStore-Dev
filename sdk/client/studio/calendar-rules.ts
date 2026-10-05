import { createHash } from "node:crypto";
import { ChestError } from "../src/errors.js";
import { locales, memberIdPattern, type Locale } from "./member.js";

// The rules and the writer of the calendar bridge, as the Chest applies
// them: what an event may be (check), the iCalendar it writes (ics, feed).
// Not a published module: calendar.ts exports what a tool needs (the
// types, limits, keyPattern, ics/pick/uidOf for a file to download); the
// fake Chest (testing.ts) imports the rest from here.

// Words in the store's languages, or one text for all.
export type Words = string | Partial<Record<Locale, string>>;
// When: two instants (a Date, or ISO 8601 with Z or an offset), or whole
// days, the first and the last inclusive ("YYYY-MM-DD", in the Chest's
// time zone as every member's calendar shows whole days).
export type When = { start: Date | string; end: Date | string; days?: never } | { days: { first: string; last: string }; start?: never; end?: never };
export type CalendarEvent = When & {
  // The tool's name for the event (a booking, a leave): 1 to 64 of
  // A-Z a-z 0-9 . _ : -.
  key: string;
  // The members whose calendar shows it: 1 to 1,000 member ids.
  members: string[];
  title: Words;
  description?: Words;
  // Where: a room, an address (plain text, 200 characters).
  location?: string;
  // The page of the tool it opens, under /chest (made absolute on the
  // tool's team host): opening it asks the member to sign in.
  path?: string;
  // false: shown as free (a desk day, a due date); true by default (a
  // meeting, a leave).
  busy?: boolean;
  // true: marked private (CLASS:PRIVATE) — a calendar shared with others
  // shows it as busy without its words.
  private?: boolean;
};
// What a put did: the members whose feed shows it, and those skipped (ids
// the Chest does not know, or members without the tool), in the order given.
export type Put = { key: string; members: string[]; skipped: string[] };
// What putMany did for one event (Proposal (0.3.0-studio.16)), at its index in
// the list given: put, or refused and why — the rest of the call is not
// held back by it.
export type PutRefusal = "invalid_event" | "invalid_key" | "invalid_id" | "duplicate_key" | "quota_exceeded";
export type PutResult = ({ ok: true; index: number } & Put) | { ok: false; index: number; key: string; reason: PutRefusal; message: string };
// An event as the Chest keeps it, read back with list().
export type KeptEvent = { key: string; members: string[]; title: Partial<Record<Locale, string>>; description?: Partial<Record<Locale, string>>; location?: string; path?: string; busy: boolean; private: boolean; updated: string; sequence: number } & ({ start: string; end: string } | { days: { first: string; last: string } });

// perMinute counts calls that write: one put, one remove, or one batch of
// putMany (up to perBatch events).
export const limits = { events: 5000, members: 1000, title: 120, description: 1000, location: 200, behindDays: 365, aheadDays: 730, feedEvents: 2000, perMinute: 600, perBatch: 100 } as const;
// A key names the event for as long as it lives (put replaces, remove and
// list name it back), so it is never hashed nor cut: a longer one is
// refused (invalid_key) — build it from ids ("task:4812"), not from text.
export const keyPattern = /^[A-Za-z0-9._:-]{1,64}$/u;
// Where a member finds their feed: the Chest's front serves it on every
// tool's team host (and sends the member to the Chest's own page), so a
// tool links to it — "See it in your calendar" — without knowing the
// Chest's address.
export const page = "/_chest/calendar";

const day = /^(\d{4})-(\d{2})-(\d{2})$/u;
const removed = /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const dayMs = 86_400_000;

function invalid(message: string): ChestError {
  return new ChestError("invalid_event", 400, message);
}
function checkKey(key: unknown): string {
  if (typeof key !== "string" || !keyPattern.test(key)) throw new ChestError("invalid_key", 400, "a key is 1 to 64 of A-Z a-z 0-9 . _ : -");
  return key;
}
// isDay says whether a text is a real calendar day "YYYY-MM-DD".
export function isDay(value: unknown): value is string {
  const m = typeof value === "string" ? day.exec(value) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
function instant(value: unknown, name: string): Date {
  // A text must say its offset: a local time without a zone means nothing
  // to a calendar read in another zone.
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/u.test(value)) throw invalid(`${name} is an ISO 8601 instant with Z or an offset`);
  const d = value instanceof Date ? new Date(value.getTime()) : typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw invalid(`${name} is a Date or an ISO 8601 instant`);
  return d;
}
// words reads text in the store's languages: one text is English (the
// fallback of every language); each 1 to max characters once cleaned.
function words(value: unknown, max: number, name: string): Partial<Record<Locale, string>> {
  const given = typeof value === "string" ? { en: value } : value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!given || Object.keys(given).length === 0) throw invalid(`${name} is a text, or {en, fr} texts`);
  const out: Partial<Record<Locale, string>> = {};
  for (const [locale, text] of Object.entries(given)) {
    if (!(locales as readonly string[]).includes(locale)) throw invalid(`${name}: ${locale} is not a language of the store (${locales.join(", ")})`);
    const clean = typeof text === "string" ? (name === "description" ? text.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n]/gu, "") : text.replace(removed, " ")).trim() : "";
    if (clean === "" || [...clean].length > max) throw invalid(`${name} is 1 to ${max} characters`);
    out[locale as Locale] = clean;
  }
  return out;
}
function checkPath(path: unknown): string {
  if (typeof path !== "string" || path.length > 512 || !/^\/chest([/?#][\x21-\x5b\x5d-\x7e]*)?$/u.test(path) || path.includes("//") || path.split(/[?#]/u)[0]!.split("/").some(s => /^(\.|%2e){1,2}$/iu.test(s))) throw invalid("path is /chest or under it");
  return path;
}

// check reads an event as the Chest would keep it, or throws what is wrong:
// what put sends. now bounds its dates (a year behind, two years ahead).
export function check(event: CalendarEvent, now: Date = new Date()): Record<string, unknown> {
  if (event === null || typeof event !== "object") throw invalid("an event is an object");
  const key = checkKey(event.key);
  const members = Array.isArray(event.members) ? [...event.members] : null;
  if (!members || members.length < 1 || members.length > limits.members) throw invalid(`1 to ${limits.members} members`);
  for (const id of members) if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  const title = words(event.title, limits.title, "title");
  const description = event.description === undefined ? undefined : words(event.description, limits.description, "description");
  let location: string | undefined;
  if (event.location !== undefined) {
    location = typeof event.location === "string" ? event.location.replace(removed, " ").trim() : "";
    if (location === "" || [...location].length > limits.location) throw invalid(`location is 1 to ${limits.location} characters`);
  }
  const path = event.path === undefined ? undefined : checkPath(event.path);
  if (event.busy !== undefined && typeof event.busy !== "boolean") throw invalid("busy is true or false");
  if (event.private !== undefined && typeof event.private !== "boolean") throw invalid("private is true or false");
  let when: Record<string, unknown>;
  let from: number, to: number;
  if (event.days !== undefined) {
    if (event.start !== undefined || event.end !== undefined) throw invalid("an event has days, or a start and an end");
    const { first, last } = event.days ?? ({} as { first?: unknown; last?: unknown });
    if (!isDay(first) || !isDay(last) || last < first) throw invalid("days are {first, last}, two days YYYY-MM-DD, the last not before the first");
    from = Date.parse(first + "T00:00:00Z");
    to = Date.parse(last + "T00:00:00Z") + dayMs;
    if (to - from > 366 * dayMs) throw invalid("an event lasts 366 days at most");
    when = { days: { first, last } };
  } else {
    const start = instant(event.start, "start"), end = instant(event.end, "end");
    if (end.getTime() <= start.getTime()) throw invalid("end comes after start");
    if (end.getTime() - start.getTime() > 366 * dayMs) throw invalid("an event lasts 366 days at most");
    from = start.getTime();
    to = end.getTime();
    when = { start: start.toISOString(), end: end.toISOString() };
  }
  if (to < now.getTime() - limits.behindDays * dayMs) throw invalid("the event ended more than a year ago");
  if (from > now.getTime() + limits.aheadDays * dayMs) throw invalid("the event starts more than two years ahead");
  return {
    members, title, ...when,
    ...(description ? { description } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(path !== undefined ? { path } : {}),
    busy: event.busy ?? true,
    private: event.private ?? false,
    key,
  };
}

// ---- iCalendar (RFC 5545) ----------------------------------------------------
//
// What the Chest writes, and what a tool may use for a file to download
// ("Add to my calendar" on a booking): plain text, CRLF line ends, content
// lines folded at 75 octets, UTC times, whole days as VALUE=DATE with an
// exclusive end. The Chest's feed and this writer are the same code in
// spirit: the fake Chest serves feeds written by it.

// An event in one language, ready to write.
export type IcsEvent = {
  uid: string;
  // DTSTAMP: when the event last changed in the Chest (stable between two
  // fetches, so a calendar sees no change where there is none).
  stamp: Date;
  // SEQUENCE: how many times it changed.
  sequence?: number;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  busy?: boolean;
  private?: boolean;
  cancelled?: boolean;
  categories?: string[];
} & ({ start: Date; end: Date } | { days: { first: string; last: string } });

// escapeText writes a TEXT value (RFC 5545 §3.3.11): backslash, semicolon
// and comma escaped, a line break as \n, other control characters removed.
export function escapeText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n]/gu, "").replace(/\\/gu, "\\\\").replace(/;/gu, "\\;").replace(/,/gu, "\\,").replace(/\n/gu, "\\n");
}

// foldLine cuts a content line into lines of at most 75 octets (RFC 5545
// §3.1), each continuation starting with one space, never inside a UTF-8
// character; lines are joined with CRLF.
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    // The first line holds 75 octets; a continuation 74 after its space.
    if (size + bytes > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

// unfold is the reverse, as a calendar reads a feed: a CRLF followed by one
// space or tab is removed.
export function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/gu, "");
}

// uidOf is the UID of a tool's event: stable for the tool and its key,
// never revealing the key, unique across Chests by their domain.
export function uidOf(tool: string, key: string, domain: string): string {
  return createHash("sha256").update(tool + "\u0000" + key).digest("hex").slice(0, 32) + "@" + domain;
}

const utc = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/u, "Z").replace(/[-:]/gu, "");
const date = (d: string): string => d.replace(/-/gu, "");
const nextDay = (d: string): string => new Date(Date.parse(d + "T00:00:00Z") + dayMs).toISOString().slice(0, 10);
// A URI value is not TEXT: it is written as is, and must be one line of
// printable ASCII.
const uri = (u: string): string | null => (/^https?:\/\/[\x21-\x7e]+$/u.test(u) ? u : null);

function vevent(e: IcsEvent): string[] {
  const when = "days" in e && e.days
    ? [`DTSTART;VALUE=DATE:${date(e.days.first)}`, `DTEND;VALUE=DATE:${date(nextDay(e.days.last))}`]
    : [`DTSTART:${utc((e as { start: Date }).start)}`, `DTEND:${utc((e as { end: Date }).end)}`];
  const url = e.url === undefined ? null : uri(e.url);
  return [
    "BEGIN:VEVENT",
    `UID:${escapeText(e.uid)}`,
    `DTSTAMP:${utc(e.stamp)}`,
    ...when,
    `SEQUENCE:${e.sequence ?? 0}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(url ? [`URL:${url}`] : []),
    ...(e.categories?.length ? [`CATEGORIES:${e.categories.map(escapeText).join(",")}`] : []),
    `CLASS:${e.private ? "PRIVATE" : "PUBLIC"}`,
    `TRANSP:${e.busy === false ? "TRANSPARENT" : "OPAQUE"}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

// ics writes a calendar: a feed to subscribe to (no method, a name and a
// refresh hint), or a file to open (method "PUBLISH"; "CANCEL" withdraws
// its events from the calendar that has them).
export function ics(events: IcsEvent[], options: { name?: string; method?: "PUBLISH" | "CANCEL"; refresh?: string } = {}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Argentic//Chest//EN",
    "CALSCALE:GREGORIAN",
    ...(options.method ? [`METHOD:${options.method}`] : []),
    ...(options.name ? [`NAME:${escapeText(options.name)}`, `X-WR-CALNAME:${escapeText(options.name)}`] : []),
    // RFC 7986 and its older twin: how often to fetch again (a hint:
    // Google Calendar keeps its own pace).
    ...(options.refresh ? [`REFRESH-INTERVAL;VALUE=DURATION:${options.refresh}`, `X-PUBLISHED-TTL:${options.refresh}`] : []),
    ...events.flatMap(vevent),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// pick is a text in a member's language: theirs, English, then the first
// given.
export function pick(text: Partial<Record<Locale, string>>, locale: string): string {
  return text[locale as Locale] ?? text.en ?? Object.values(text)[0] ?? "";
}

// feed writes one member's feed from what tools keep, as the Chest does:
// each event in the member's language, its link on its tool's team host,
// the tool's title as a category, nearest to today first when there are
// too many (limits.feedEvents), then in time order.
export function feed(kept: (KeptEvent & { tool: string; toolTitle?: string; origin: string })[], options: { locale: string; domain: string; name: string; now?: Date }): string {
  const now = (options.now ?? new Date()).getTime();
  const span = (e: KeptEvent): [number, number] => ("days" in e && e.days ? [Date.parse(e.days.first + "T00:00:00Z"), Date.parse(e.days.last + "T00:00:00Z") + dayMs] : [Date.parse((e as { start: string }).start), Date.parse((e as { end: string }).end)]);
  const distance = (e: KeptEvent): number => {
    const [a, b] = span(e);
    return now < a ? a - now : now > b ? now - b : 0;
  };
  const chosen = kept
    .filter(e => span(e)[1] >= now - limits.behindDays * dayMs)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, limits.feedEvents)
    .sort((a, b) => span(a)[0] - span(b)[0] || (a.key < b.key ? -1 : 1));
  const events: IcsEvent[] = chosen.map(e => ({
    uid: uidOf(e.tool, e.key, options.domain),
    stamp: new Date(e.updated),
    sequence: e.sequence,
    title: pick(e.title, options.locale),
    ...(e.description ? { description: pick(e.description, options.locale) } : {}),
    ...(e.location ? { location: e.location } : {}),
    ...(e.path ? { url: e.origin + e.path } : {}),
    busy: e.busy,
    private: e.private,
    ...(e.toolTitle ? { categories: [e.toolTitle] } : {}),
    ...("days" in e && e.days ? { days: e.days } : { start: new Date((e as { start: string }).start), end: new Date((e as { end: string }).end) }),
  }));
  return ics(events, { name: options.name, refresh: "PT1H" });
}
