import { createHash, randomBytes } from "node:crypto";
import * as chest from "@argentic/chest-sdk/chest";
import { memberIdPattern, type Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { clean, colors, email, id, isColor, isLocationKind, limits, minutes, phone, slug, slugify, type Color, type LocationKind } from "./model.ts";
import { cleanAnswers, cleanQuestions, readAnswers, readQuestions, type Answer, type Question } from "./questions.ts";
import { defaultWeek, freeWindows, openParts, slots, validRanges, type Busy, type Ranges, type Slot, type Window } from "./slots.ts";
import { isLocale, locales, type Locale } from "./i18n/index.ts";
import { cleanLanguages, cleanTypeTexts, localizeType, pageLanguage, readTypeTexts, titleIn, type TypeTexts } from "./texts.ts";
import { addDays, instantOf, isDate, isZone, wall } from "./zone.ts";

// Booking's services: hosts and their hours, booking types, the free times
// a visitor sees and the bookings they make. Every function takes the
// database (or a transaction) and, on the team side, who acts; it checks
// the right itself and throws an AppError code when it refuses.

// dailyMax: at most this many meetings a day, all types (0: no limit);
// emailMe: an email with each booking's calendar file.
// ready: the host connected a calendar or confirmed their hours — until
// then their page is not public (not listed, not bookable). language: the
// language of their texts (null: not said); second: another version of
// them, optional (welcomeAlt, each type's alt).
export type Host = { memberId: string; slug: string; zone: string; weekly: Ranges[]; listed: boolean; away: boolean; welcome: string; hasFeed: boolean; dailyMax: number; emailMe: boolean; ready: boolean; language: Locale | null; second: Locale | null; welcomeAlt: string };
export type BookingType = {
  id: string;
  memberId: string;
  slug: string;
  title: string;
  description: string;
  duration: number;
  interval: number;
  locationKind: LocationKind;
  location: string;
  bufferBefore: number;
  bufferAfter: number;
  noticeMinutes: number;
  windowDays: number;
  // At most this many bookings of the type a day (0: no limit).
  dailyLimit: number;
  // The host's own questions on the booking form.
  questions: Question[];
  color: Color;
  active: boolean;
  // A room of its own for each booking, made under location.
  videoRooms: boolean;
  // Shown to the guest once booked (https).
  paymentLink: string;
  // Other hosts who take this type too: the first of them free takes it.
  pool: string[];
  // Its texts in the host's second language (lib/texts.ts).
  alt: TypeTexts;
};
export type Override = { day: string; ranges: Ranges; note: string };
export type Booking = {
  id: string;
  typeId: string | null;
  memberId: string;
  title: string;
  duration: number;
  locationKind: LocationKind;
  location: string;
  startsAt: Date;
  endsAt: Date;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestNote: string;
  // Their answers to the host's questions.
  answers: Answer[];
  guestZone: string;
  guestLanguage: string;
  status: "confirmed" | "cancelled";
  cancelledBy: "guest" | "host" | null;
  cancelReason: string;
  createdAt: Date;
  cancelledAt: Date | null;
  moves: number;
  // The guest's link: for their emails only, never shown to the team.
  secret: string;
  // The booking's own video room ("" : the type's link, in location).
  videoLink: string;
  // Made by the guest on the page, by a host for them, or imported.
  source: "page" | "host" | "import";
  bookedBy: string | null;
  paymentLink: string;
  paid: boolean;
};
// Where to meet: the booking's own room, or the type's link or address.
export const meetingPlace = (b: Pick<Booking, "videoLink" | "location">) => b.videoLink || b.location;
// mailWorks: whether the last email the tool tried went out (null: none
// tried yet) — the pages say when guests get no email.
// embedOrigins: the websites that may show the public pages in a frame;
// calendarWorks: whether the last put in the Chest's calendar went through.
export type Settings = { companyName: string; retentionMonths: number; defaultZone: string; publicOrigin: string | null; mailWorks: boolean | null; embedOrigins: string[]; calendarWorks: boolean | null };

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = () => randomBytes(24).toString("base64url");

// ——— Settings ———

// The Chest gives its company name, time zone and public address (Proposal
// (studio): the chest module); an administrator may name the company
// otherwise for visitors, and the address seen in requests is remembered
// for a Chest that does not give it yet.
export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const s: Settings = { companyName: chest.company(), retentionMonths: 24, defaultZone: chest.timeZone(), publicOrigin: chest.publicUrl(), mailWorks: null, embedOrigins: [], calendarWorks: null };
  for (const { key, value } of rows) {
    if (key === "company_name" && typeof value === "string" && value !== "") s.companyName = value;
    if (key === "retention_months" && typeof value === "number") s.retentionMonths = value;
    if (key === "default_zone" && isZone(value)) s.defaultZone = value;
    if (key === "public_origin" && typeof value === "string" && !chest.publicUrl()) s.publicOrigin = value;
    if (key === "mail_works" && typeof value === "boolean") s.mailWorks = value;
    if (key === "calendar_works" && typeof value === "boolean") s.calendarWorks = value;
    if (key === "embed_origins" && Array.isArray(value)) s.embedOrigins = value.filter((o): o is string => typeof o === "string" && isOrigin(o));
  }
  return s;
}

async function put(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

export async function saveSettings(sql: Query, actor: Member, input: { companyName: unknown; retentionMonths: unknown; defaultZone: unknown; embedOrigins?: unknown }): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const name = clean(input.companyName, limits.name, { optional: true });
  const months = minutes(input.retentionMonths, 0, 120);
  if (!isZone(input.defaultZone)) throw new AppError("invalid");
  const origins = input.embedOrigins === undefined ? undefined : embedOrigins(input.embedOrigins);
  await put(sql, "company_name", name);
  await put(sql, "retention_months", months);
  await put(sql, "default_zone", input.defaultZone);
  if (origins !== undefined) await put(sql, "embed_origins", origins);
}

export async function saveEmbed(sql: Query, actor: Member, sites: unknown): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  await put(sql, "embed_origins", embedOrigins(sites));
}

// The websites allowed to show the booking pages in a frame (the
// company's own): one per line, https, the address of the site only
// ("https://www.atelier-martin.fr"), ten at most.
export function embedOrigins(value: unknown): string[] {
  const lines = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/u) : null;
  if (!lines) throw new AppError("invalid");
  const out: string[] = [];
  for (const raw of lines) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new AppError("invalid_site", { site: raw.trim().slice(0, 60) });
    }
    if (url.protocol !== "https:" || url.username || url.password || !isOrigin(url.origin)) throw new AppError("invalid_site", { site: raw.trim().slice(0, 60) });
    if (!out.includes(url.origin)) out.push(url.origin);
  }
  if (out.length > 10) throw new AppError("too_many_sites", { max: 10 });
  return out;
}
export const isOrigin = (o: string) => /^https:\/\/[a-z0-9.-]{1,253}(:\d{1,5})?$/u.test(o);

export async function rememberCalendar(sql: Query, works: boolean): Promise<void> {
  await sql`insert into settings (key, value) values ('calendar_works', ${sql.json(works)}) on conflict (key) do update set value = excluded.value where settings.value <> excluded.value`;
}

// The public host's address, remembered from requests: emails written
// outside a request (reminders) need it.
export async function rememberPublicOrigin(sql: Query, origin: string | null): Promise<void> {
  if (!origin) return;
  await sql`insert into settings (key, value) values ('public_origin', ${sql.json(origin)}) on conflict (key) do update set value = excluded.value where settings.value <> excluded.value`;
}

export async function rememberDelivery(sql: Query, delivery: "email" | "page"): Promise<void> {
  const works = delivery === "email";
  await sql`insert into settings (key, value) values ('mail_works', ${sql.json(works)}) on conflict (key) do update set value = excluded.value where settings.value <> excluded.value`;
}

// ——— Hosts ———

type HostRow = { member_id: string; slug: string; zone: string; weekly: Ranges[]; listed: boolean; away: boolean; welcome: string; feed_hash: string | null; daily_max: number; email_me: boolean; ready: boolean; language: string | null; second_language: string | null; welcome_alt: string };
const toHost = (r: HostRow): Host => {
  const language = isLocale(r.language) ? r.language : null;
  const second = language && isLocale(r.second_language) && r.second_language !== language ? r.second_language : null;
  return { memberId: r.member_id, slug: r.slug, zone: r.zone, weekly: r.weekly, listed: r.listed, away: r.away, welcome: r.welcome, hasFeed: r.feed_hash !== null, dailyMax: r.daily_max ?? 0, emailMe: r.email_me ?? true, ready: r.ready ?? true, language, second, welcomeAlt: r.welcome_alt ?? "" };
};

export async function hostOf(sql: Query, memberId: string): Promise<Host | null> {
  const [row] = await sql<HostRow[]>`select * from hosts where member_id = ${memberId}`;
  return row ? toHost(row) : null;
}

// ensureHost gives a member who may host a page of their own the first time
// they open the tool: an address from their name, the company's time zone,
// weekday hours and one booking type to start from. Coming back after being
// away (access given again) makes their page work again.
// The page is not public until the host connects a calendar or confirms
// their hours (ready). Their texts are taken to be in their language
// until they say otherwise (Settings); the first type's name is written
// in the other languages too (alt), ready for a second language.
export async function ensureHost(sql: Query, actor: Member, first: { title: string; slug: string; others?: Partial<Record<Locale, string>> }): Promise<Host> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const own: Locale = isLocale(actor.locale) ? actor.locale : "en";
  const existing = await hostOf(sql, actor.id);
  if (existing) {
    if (existing.away) await sql`update hosts set away = false where member_id = ${actor.id}`;
    // A host made before languages were asked: their language, once.
    if (!existing.language) await sql`update hosts set language = ${own} where member_id = ${actor.id} and language is null`;
    return { ...existing, away: false, language: existing.language ?? own };
  }
  const s = await settings(sql);
  const base = slugify(actor.name || "page");
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 36)}-${n}`;
    const [row] = await sql<HostRow[]>`
      insert into hosts (member_id, slug, zone, weekly, language) values (${actor.id}, ${candidate}, ${s.defaultZone}, ${sql.json(defaultWeek as never)}, ${own})
      on conflict do nothing returning *`;
    if (row) {
      const other = Object.entries(first.others ?? {}).find(([code]) => code !== own)?.[1];
      await sql`insert into types (member_id, slug, title, duration, interval, location_kind, alt) values (${actor.id}, ${first.slug}, ${first.title}, 30, 30, 'video', ${sql.json((other ? { title: other } : {}) as never)})`;
      return toHost(row);
    }
    // Another request created this host meanwhile: take it.
    const again = await hostOf(sql, actor.id);
    if (again) return again;
  }
  throw new AppError("slug_taken");
}

// language, second, welcomeAlt: optional for callers that do not change
// them (the hours' form keeps them as they are).
export async function saveHost(sql: Query, actor: Member, input: { slug: unknown; zone: unknown; welcome: unknown; listed: unknown; language?: unknown; second?: unknown; welcomeAlt?: unknown }): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const s = slug(input.slug);
  if (!isZone(input.zone)) throw new AppError("invalid");
  const welcome = clean(input.welcome, limits.welcome, { optional: true, multiline: true });
  const languages = input.language === undefined ? null : cleanLanguages(input.language, input.second);
  const welcomeAlt = languages?.second ? clean(input.welcomeAlt ?? "", limits.welcome, { optional: true, multiline: true }) : "";
  try {
    const done = languages
      ? await sql`update hosts set slug = ${s}, zone = ${input.zone}, welcome = ${welcome}, listed = ${input.listed === true}, language = ${languages.language}, second_language = ${languages.second}, welcome_alt = ${welcomeAlt} where member_id = ${actor.id}`
      : await sql`update hosts set slug = ${s}, zone = ${input.zone}, welcome = ${welcome}, listed = ${input.listed === true} where member_id = ${actor.id}`;
    if (done.count === 0) throw new AppError("not_host");
  } catch (error) {
    if (isUnique(error)) throw new AppError("slug_taken");
    throw error;
  }
}

// The host's own limits and wishes: at most N meetings a day, all types;
// an email with each booking.
export async function saveHostPrefs(sql: Query, actor: Member, input: { dailyMax: unknown; emailMe: unknown }): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const max = minutes(input.dailyMax, 0, 50);
  const done = await sql`update hosts set daily_max = ${max}, email_me = ${input.emailMe !== false} where member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_host");
}

export async function saveWeekly(sql: Query, actor: Member, weekly: unknown): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (!Array.isArray(weekly) || weekly.length !== 7 || !weekly.every(validRanges)) throw new AppError("invalid");
  const sorted = (weekly as Ranges[]).map(day => [...day].sort((a, b) => a[0] - b[0]));
  // Saving the hours confirms them: the page is public from now on.
  const done = await sql`update hosts set weekly = ${sql.json(sorted as never)}, ready = true where member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_host");
}

// confirmHours: the host says their hours are right as they are (no
// calendar to connect): their page is public from now on. markReady does
// the same once a calendar is connected (lib/calendars.ts).
export async function confirmHours(sql: Query, actor: Member): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const done = await sql`update hosts set ready = true where member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_host");
}

// A date with other hours than usual; [] is a day off.
export async function saveOverride(sql: Query, actor: Member, input: { day: unknown; ranges: unknown; note: unknown }): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (!isDate(input.day) || !validRanges(input.ranges)) throw new AppError("invalid");
  const note = clean(input.note, 80, { optional: true });
  const ranges = [...(input.ranges as Ranges)].sort((a, b) => a[0] - b[0]);
  if (!(await hostOf(sql, actor.id))) throw new AppError("not_host");
  await sql`
    insert into overrides (member_id, day, ranges, note) values (${actor.id}, ${input.day}, ${sql.json(ranges as never)}, ${note})
    on conflict (member_id, day) do update set ranges = excluded.ranges, note = excluded.note`;
}

// Days off for a whole period (a holiday): every date from first to last.
export async function daysOff(sql: Query, actor: Member, input: { from: unknown; to: unknown; note: unknown }): Promise<number> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (!isDate(input.from) || !isDate(input.to) || input.to < input.from || addDays(input.from, 92) < input.to) throw new AppError("invalid");
  const note = clean(input.note, 80, { optional: true });
  if (!(await hostOf(sql, actor.id))) throw new AppError("not_host");
  let n = 0;
  for (let day = input.from; day <= input.to; day = addDays(day, 1), n++) {
    await sql`
      insert into overrides (member_id, day, ranges, note) values (${actor.id}, ${day}, '[]'::jsonb, ${note})
      on conflict (member_id, day) do update set ranges = excluded.ranges, note = excluded.note`;
  }
  return n;
}

export async function removeOverride(sql: Query, actor: Member, day: unknown): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (!isDate(day)) throw new AppError("invalid");
  await sql`delete from overrides where member_id = ${actor.id} and day = ${day}`;
}

export async function overridesOf(sql: Query, memberId: string, from: string): Promise<Override[]> {
  const rows = await sql<{ day: string; ranges: Ranges; note: string }[]>`
    select to_char(day, 'YYYY-MM-DD') as day, ranges, note from overrides where member_id = ${memberId} and day >= ${from} order by day limit 400`;
  return rows.map(r => ({ day: r.day, ranges: r.ranges, note: r.note }));
}

// A private calendar address for the host's own calendar app: its token is
// shown once, only its hash is kept; a new one replaces the old.
export async function newFeed(sql: Query, actor: Member): Promise<string> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const token = newSecret();
  const done = await sql`update hosts set feed_hash = ${hashSecret(token)} where member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_host");
  return token;
}

export async function stopFeed(sql: Query, actor: Member): Promise<void> {
  await sql`update hosts set feed_hash = null where member_id = ${actor.id}`;
}

export async function feed(sql: Query, token: string, now = Date.now()): Promise<{ host: Host; bookings: Booking[] } | null> {
  if (!/^[A-Za-z0-9_-]{32}$/u.test(token)) return null;
  const [row] = await sql<HostRow[]>`select * from hosts where feed_hash = ${hashSecret(token)}`;
  if (!row) return null;
  const rows = await sql<BookingRow[]>`
    select * from bookings where member_id = ${row.member_id} and ends_at > ${new Date(now - 30 * 86400000)}
    order by starts_at limit 2000`;
  return { host: toHost(row), bookings: rows.map(toBooking) };
}

// ——— Booking types ———

type TypeRow = {
  id: string;
  member_id: string;
  slug: string;
  title: string;
  description: string;
  duration: number;
  interval: number;
  location_kind: LocationKind;
  location: string;
  buffer_before: number;
  buffer_after: number;
  notice_minutes: number;
  window_days: number;
  daily_limit: number;
  questions: unknown;
  color: string;
  active: boolean;
  video_rooms: boolean;
  payment_link: string;
  pool: unknown;
  alt: unknown;
};
const toType = (r: TypeRow): BookingType => ({
  id: String(r.id),
  memberId: r.member_id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  duration: r.duration,
  interval: r.interval,
  locationKind: r.location_kind,
  location: r.location,
  bufferBefore: r.buffer_before,
  bufferAfter: r.buffer_after,
  noticeMinutes: r.notice_minutes,
  windowDays: r.window_days,
  dailyLimit: r.daily_limit ?? 0,
  questions: readQuestions(r.questions),
  color: isColor(r.color) ? r.color : "sky",
  active: r.active,
  videoRooms: r.video_rooms ?? false,
  paymentLink: r.payment_link ?? "",
  pool: Array.isArray(r.pool) ? r.pool.filter((m): m is string => typeof m === "string" && memberIdPattern.test(m)) : [],
  alt: readTypeTexts(r.alt),
});

export async function typesOf(sql: Query, memberId: string, options: { activeOnly?: boolean } = {}): Promise<BookingType[]> {
  const rows = await sql<TypeRow[]>`
    select * from types where member_id = ${memberId} ${options.activeOnly ? sql`and active` : sql``} order by position, id`;
  return rows.map(toType);
}

export type TypeInput = {
  title: unknown;
  slug: unknown;
  description: unknown;
  duration: unknown;
  interval?: unknown;
  locationKind: unknown;
  location: unknown;
  bufferBefore: unknown;
  bufferAfter: unknown;
  noticeMinutes: unknown;
  windowDays: unknown;
  // Optional for callers written before them: no limit, no question.
  dailyLimit?: unknown;
  questions?: unknown;
  color: unknown;
  active: unknown;
  videoRooms?: unknown;
  paymentLink?: unknown;
  // Administrators only: other hosts who take the type too.
  pool?: unknown;
  // Its texts in the host's second language (lib/texts.ts); optional.
  alt?: unknown;
};

function typeValues(input: TypeInput) {
  const title = clean(input.title, limits.title);
  const duration = minutes(input.duration, 5, 480);
  if (!isLocationKind(input.locationKind)) throw new AppError("invalid");
  const videoRooms = input.locationKind === "video" && input.videoRooms === true;
  // A room per booking: the host chooses where rooms are made — Jitsi's
  // public server (meet.jit.si: whoever opens a room signs in with Google,
  // GitHub or Facebook since 24 August 2023) or their own server. No silent
  // default: the type form says what each one asks.
  const location = clean(input.location, limits.location, { optional: true });
  if (videoRooms && location === "") throw new AppError("rooms_address");
  // A video link is a web address the guest opens: only https.
  if (input.locationKind === "video" && location !== "" && !isLink(location)) throw new AppError("invalid_link");
  const paymentLink = clean(input.paymentLink ?? "", limits.location, { optional: true });
  if (paymentLink !== "" && !isLink(paymentLink)) throw new AppError("invalid_link");
  return {
    title,
    slug: slug(input.slug === "" || input.slug === undefined ? slugify(title) : input.slug),
    description: clean(input.description, limits.description, { optional: true, multiline: true }),
    duration,
    interval: input.interval === undefined || input.interval === "" ? duration : minutes(input.interval, 5, 480),
    location_kind: input.locationKind,
    location,
    buffer_before: minutes(input.bufferBefore, 0, 240),
    buffer_after: minutes(input.bufferAfter, 0, 240),
    notice_minutes: minutes(input.noticeMinutes, 0, 20160),
    window_days: minutes(input.windowDays, 1, 365),
    daily_limit: input.dailyLimit === undefined ? 0 : minutes(input.dailyLimit, 0, 50),
    questions: cleanQuestions(input.questions),
    color: isColor(input.color) ? input.color : colors[0],
    active: input.active !== false,
    video_rooms: videoRooms,
    payment_link: paymentLink,
  };
}

// The type's values with its second-language texts (checked against its
// questions as sent).
function typeRow(input: TypeInput) {
  const v = typeValues(input);
  return { ...v, alt: cleanTypeTexts(input.alt, v.questions) };
}

const isLink = (text: string) => /^https:\/\/[^\s<>"]+$/u.test(text);
// Jitsi's public server: free, no account for guests; the host signs in
// (Google, GitHub or Facebook) to open each room — until then guests wait
// ("waiting for a moderator"). https://jitsi.org/blog/authentication-on-meet-jit-si/
export const defaultRooms = "https://meet.jit.si/";
export const isPublicJitsi = (link: string) => link.startsWith(defaultRooms);

// roomLink makes a booking's own video room: the type's address with a
// room name nobody can guess ("{room}" in it is replaced; otherwise the
// name is added at its end).
export function roomLink(base: string, company: string): string {
  const room = `${slugify(company || "meeting").slice(0, 24)}-${randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/gu, "x")}`;
  if (base.includes("{room}")) return base.replace("{room}", room);
  return base.endsWith("/") ? base + room : `${base}/${room}`;
}

// cleanPool reads the other hosts of a team type: member ids of hosts who
// have a page here, not the owner, ten at most.
async function cleanPool(sql: Query, actor: Member, value: unknown): Promise<string[] | undefined> {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10) throw new AppError("invalid");
  const ids = [...new Set(value.filter((m): m is string => typeof m === "string" && memberIdPattern.test(m) && m !== actor.id))];
  if (ids.length > 0 && !can(actor, "settings")) throw new AppError("forbidden");
  if (ids.length === 0) return [];
  const rows = await sql<{ member_id: string }[]>`select member_id from hosts where member_id in ${sql(ids)} and not away`;
  const found = new Set(rows.map(r => r.member_id));
  return ids.filter(m => found.has(m));
}

export async function createType(sql: Query, actor: Member, input: TypeInput): Promise<BookingType> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const v = typeRow(input);
  if (!(await hostOf(sql, actor.id))) throw new AppError("not_host");
  const pool = (await cleanPool(sql, actor, input.pool)) ?? [];
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from types where member_id = ${actor.id}`;
  const n = row?.n ?? 0;
  if (n >= limits.typesPerHost) throw new AppError("too_many_types", { max: limits.typesPerHost });
  try {
    const [row] = await sql<TypeRow[]>`insert into types ${sql({ ...v, questions: sql.json(v.questions as never), alt: sql.json(v.alt as never), pool: sql.json(pool as never), member_id: actor.id, position: n })} returning *`;
    return toType(row!);
  } catch (error) {
    if (isUnique(error)) throw new AppError("slug_taken");
    throw error;
  }
}

export async function updateType(sql: Query, actor: Member, typeId: unknown, input: TypeInput): Promise<BookingType> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const v = typeRow(input);
  // A host who is not an administrator keeps the type's team as it is.
  const pool = can(actor, "settings") ? await cleanPool(sql, actor, input.pool) : undefined;
  try {
    const [row] = await sql<TypeRow[]>`update types set ${sql({ ...v, questions: sql.json(v.questions as never), alt: sql.json(v.alt as never), ...(pool !== undefined ? { pool: sql.json(pool as never) } : {}) })} where id = ${id(typeId)} and member_id = ${actor.id} returning *`;
    if (!row) throw new AppError("not_found");
    return toType(row);
  } catch (error) {
    if (isUnique(error)) throw new AppError("slug_taken");
    throw error;
  }
}

export async function setTypeActive(sql: Query, actor: Member, typeId: unknown, active: boolean): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const done = await sql`update types set active = ${active} where id = ${id(typeId)} and member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_found");
}

// Removing a type keeps its bookings (they carry what the guest saw).
export async function removeType(sql: Query, actor: Member, typeId: unknown): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const done = await sql`delete from types where id = ${id(typeId)} and member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_found");
}

export async function typeOf(sql: Query, actor: Member, typeId: unknown): Promise<BookingType> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const [row] = await sql<TypeRow[]>`select * from types where id = ${id(typeId)} and member_id = ${actor.id}`;
  if (!row) throw new AppError("not_found");
  return toType(row);
}

// The colours of booking types, for the agenda (a removed type: none).
export async function colorsOf(sql: Query, typeIds: (string | null)[]): Promise<Map<string, Color>> {
  const ids = [...new Set(typeIds.filter((x): x is string => x !== null))];
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: string; color: string }[]>`select id::text as id, color from types where id in ${sql(ids)}`;
  return new Map(rows.map(r => [r.id, isColor(r.color) ? r.color : "slate"]));
}

// The name of each type in a reader's language, for the team's screens
// (agenda, a booking, the bell, the export, the Chest's calendar): a
// booking keeps the name as its guest read it — their emails need it —
// but a host reads one type under one name. A removed type: none (the
// booking's own copy shows).
export async function typeNames(sql: Query, typeIds: (string | null)[], reader: Locale): Promise<Map<string, string>> {
  const ids = [...new Set(typeIds.filter((x): x is string => x !== null && /^[1-9][0-9]{0,17}$/u.test(x)))];
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: string; title: string; alt: unknown; language: string | null; second_language: string | null }[]>`
    select t.id::text as id, t.title, t.alt, h.language, h.second_language from types t join hosts h on h.member_id = t.member_id where t.id in ${sql(ids)}`;
  return new Map(rows.map(r => {
    const language = isLocale(r.language) ? r.language : null;
    const second = language && isLocale(r.second_language) && r.second_language !== language ? r.second_language : null;
    return [r.id, titleIn({ title: r.title, alt: readTypeTexts(r.alt) }, { language, second }, reader)];
  }));
}

// A booking's type name in every language of the store (the bell and
// calendar write each member's in theirs).
export async function titlesOf(sql: Query, b: Pick<Booking, "typeId" | "title">): Promise<Record<Locale, string>> {
  const out = {} as Record<Locale, string>;
  for (const l of locales) out[l] = (await typeNames(sql, [b.typeId], l)).get(b.typeId ?? "") ?? b.title;
  return out;
}

// The other hosts an administrator may add to a type's team.
export async function otherHosts(sql: Query, actor: Member): Promise<string[]> {
  if (!can(actor, "settings")) return [];
  const rows = await sql<{ member_id: string }[]>`select member_id from hosts where member_id <> ${actor.id} and not away order by created_at limit 200`;
  return rows.map(r => r.member_id);
}

// ——— What visitors see ———

// The hosts on the company's booking page: listed, here, with at least one
// active type.
export async function listedHosts(sql: Query): Promise<(Host & { types: number })[]> {
  const rows = await sql<(HostRow & { types: number })[]>`
    select h.*, count(t.id)::int as types from hosts h join types t on t.member_id = h.member_id and t.active
    where h.listed and h.ready and not h.away group by h.member_id order by h.created_at limit 200`;
  return rows.map(r => ({ ...toHost(r), types: r.types }));
}

export async function publicHost(sql: Query, hostSlug: string): Promise<{ host: Host; types: BookingType[] } | null> {
  if (!/^[a-z0-9-]{1,40}$/u.test(hostSlug)) return null;
  const [row] = await sql<HostRow[]>`select * from hosts where slug = ${hostSlug} and ready and not away`;
  if (!row) return null;
  return { host: toHost(row), types: await typesOf(sql, row.member_id, { activeOnly: true }) };
}

export async function publicType(sql: Query, hostSlug: string, typeSlug: string): Promise<{ host: Host; type: BookingType } | null> {
  if (!/^[a-z0-9-]{1,40}$/u.test(hostSlug) || !/^[a-z0-9-]{1,40}$/u.test(typeSlug)) return null;
  const [row] = await sql<(HostRow & { type: TypeRow })[]>`
    select h.*, to_jsonb(t) as type from hosts h join types t on t.member_id = h.member_id
    where h.slug = ${hostSlug} and t.slug = ${typeSlug} and t.active and h.ready and not h.away`;
  if (!row) return null;
  return { host: toHost(row), type: toType({ ...row.type, id: String(row.type.id) }) };
}

// The host's time taken between two instants: their confirmed bookings
// (buffers included; those of typeId carry their start, for the type's
// daily limit, and every one for the host's daily maximum), the times they
// blocked, the busy times of their other calendars, and those another tool
// of the Chest told (told_spans: Hiring's interviews, lib/share.ts).
async function busyOf(sql: Query, memberId: string, typeId: string, from: Date, to: Date, except: string | null): Promise<Busy[]> {
  const range = sql`tstzrange(${from}, ${to})`;
  const rows = await sql<{ lo: Date; hi: Date; starts_at: Date; same: boolean }[]>`
    select lower(blocked) as lo, upper(blocked) as hi, starts_at, coalesce(type_id = ${typeId}, false) as same from bookings
    where member_id = ${memberId} and status = 'confirmed' and blocked && ${range}
    ${except ? sql`and id <> ${except}` : sql``}`;
  const other = await sql<{ lo: Date; hi: Date }[]>`
    select lower(span) as lo, upper(span) as hi from blocks where member_id = ${memberId} and span && ${range}
    union all
    select lower(span), upper(span) from busy where member_id = ${memberId} and span && ${range}
    union all
    select lower(span), upper(span) from told_spans where member_id = ${memberId} and span && ${range}`;
  return [
    ...rows.map(r => ({ start: r.lo.getTime(), end: r.hi.getTime(), own: r.starts_at.getTime(), ...(r.same ? { sameType: r.starts_at.getTime() } : {}) })),
    ...other.map(r => ({ start: r.lo.getTime(), end: r.hi.getTime() })),
  ];
}

// The hosts of a type: its owner, then its team (round robin), those who
// still have a page.
async function hostsOf(sql: Query, owner: Host, type: BookingType): Promise<Host[]> {
  if (type.pool.length === 0) return [owner];
  // A host whose page is not public yet takes nobody's bookings either.
  const rows = await sql<HostRow[]>`select * from hosts where member_id in ${sql(type.pool)} and ready and not away`;
  const byId = new Map(rows.map(r => [r.member_id, toHost(r)]));
  return [owner, ...type.pool.flatMap(m => byId.get(m) ?? [])];
}

// The member ids who take a type: its owner, then its team.
export async function teamOf(sql: Query, owner: Host, type: BookingType): Promise<string[]> {
  return (await hostsOf(sql, owner, type)).map(h => h.memberId);
}

// A host's free starts for a type (notice: the minimum notice, the type's
// unless a host books for a guest).
async function hostFree(sql: Query, host: Host, type: BookingType, from: string, to: string, now: number, except: string | null, notice: number): Promise<Slot[]> {
  const overrides = Object.fromEntries((await overridesOf(sql, host.memberId, addDays(from, -1))).map(o => [o.day, o.ranges]));
  // Wide enough for any zone: a day before, a day after.
  const busy = await busyOf(sql, host.memberId, type.id, new Date(Date.parse(from + "T00:00:00Z") - 2 * 86400000), new Date(Date.parse(to + "T00:00:00Z") + 3 * 86400000), except);
  return slots({ weekly: host.weekly, overrides, zone: host.zone }, { ...rulesOf(type), noticeMinutes: notice, hostDailyMax: host.dailyMax }, busy, { from, to }, now);
}

// freeTimes: the starts a visitor can pick between two dates of the host's
// calendar (six weeks at most at a time). A team type is free when any of
// its hosts is.
export async function freeTimes(sql: Query, host: Host, type: BookingType, from: string, to: string, now = Date.now(), except: string | null = null, options: { notice?: number } = {}): Promise<Slot[]> {
  if (!isDate(from) || !isDate(to) || to < from || addDays(from, 42) < to) throw new AppError("invalid");
  const notice = options.notice ?? type.noticeMinutes;
  const team = await hostsOf(sql, host, type);
  if (team.length === 1) return hostFree(sql, host, type, from, to, now, except, notice);
  const all = new Map<string, Slot>();
  for (const member of team) for (const s of await hostFree(sql, member, type, from, to, now, except, notice)) all.set(s.start, s);
  return [...all.values()].sort((a, b) => a.start.localeCompare(b.start));
}

const rulesOf = (t: BookingType) => ({ duration: t.duration, interval: t.interval, bufferBefore: t.bufferBefore, bufferAfter: t.bufferAfter, noticeMinutes: t.noticeMinutes, windowDays: t.windowDays, dailyLimit: t.dailyLimit });

// The first date with a free time, to open the calendar on it.
export async function firstFree(sql: Query, host: Host, type: BookingType, now = Date.now()): Promise<string | null> {
  let from = wall(now, host.zone).date;
  const last = addDays(from, type.windowDays);
  while (from <= last) {
    const to = addDays(from, 27) < last ? addDays(from, 27) : last;
    const found = await freeTimes(sql, host, type, from, to, now);
    if (found[0]) return wall(Date.parse(found[0].start), host.zone).date;
    from = addDays(to, 1);
  }
  return null;
}

// ——— Times a host blocks ———

export type Block = { id: string; start: Date; end: Date; note: string };

// blockTime keeps a time of one day free of bookings: from and to are
// minutes of the host's clock that day (to up to 24:00).
export async function blockTime(sql: Query, actor: Member, input: { day: unknown; from: unknown; to: unknown; note: unknown }, now = Date.now()): Promise<Block> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const host = await hostOf(sql, actor.id);
  if (!host) throw new AppError("not_host");
  if (!isDate(input.day)) throw new AppError("invalid");
  const from = minutes(input.from, 0, 1439), to = minutes(input.to, 1, 1440);
  if (to <= from) throw new AppError("invalid_range");
  const note = clean(input.note, 80, { optional: true });
  const start = instantOf(input.day, from, host.zone);
  const end = to === 1440 ? instantOf(addDays(input.day, 1), 0, host.zone) : instantOf(input.day, to, host.zone);
  if (end.getTime() <= now) throw new AppError("too_late");
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from blocks where member_id = ${actor.id} and upper(span) > ${new Date(now)}`;
  if ((count?.n ?? 0) >= 500) throw new AppError("too_many");
  const [row] = await sql<{ id: string; lo: Date; hi: Date; note: string }[]>`
    insert into blocks (member_id, span, note) values (${actor.id}, tstzrange(${start}, ${end}), ${note})
    returning id::text as id, lower(span) as lo, upper(span) as hi, note`;
  return { id: row!.id, start: row!.lo, end: row!.hi, note: row!.note };
}

export async function unblock(sql: Query, actor: Member, blockId: unknown): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const done = await sql`delete from blocks where id = ${id(blockId)} and member_id = ${actor.id}`;
  if (done.count === 0) throw new AppError("not_found");
}

// The host's free stretches of the coming days (their calendar), for the
// agenda: tap one to block it. Busy is everything busyOf knows.
export async function freeStretches(sql: Query, host: Host, days = 7, now = Date.now()): Promise<Map<string, Window[]>> {
  const today = wall(now, host.zone).date;
  const last = addDays(today, days - 1);
  const overrides = Object.fromEntries((await overridesOf(sql, host.memberId, today)).map(o => [o.day, o.ranges]));
  const busy = await busyOf(sql, host.memberId, "0", new Date(now - 86400000), new Date(Date.parse(last + "T00:00:00Z") + 2 * 86400000), null);
  const out = new Map<string, Window[]>();
  for (let day = today; day <= last; day = addDays(day, 1)) {
    const found = freeWindows({ weekly: host.weekly, overrides, zone: host.zone }, busy, day, now);
    if (found.length > 0) out.set(day, found);
  }
  return out;
}

// A host's own busy times between two instants — confirmed bookings
// (buffers included), times blocked, their other calendars — as other
// tools are told them (lib/share.ts): never what another tool told
// Booking.
export async function ownBusy(sql: Query, memberId: string, from: Date, to: Date): Promise<{ start: number; end: number }[]> {
  const range = sql`tstzrange(${from}, ${to})`;
  const rows = await sql<{ lo: Date; hi: Date }[]>`
    select lower(blocked) as lo, upper(blocked) as hi from bookings where member_id = ${memberId} and status = 'confirmed' and blocked && ${range}
    union all
    select lower(span), upper(span) from blocks where member_id = ${memberId} and span && ${range}
    union all
    select lower(span), upper(span) from busy where member_id = ${memberId} and span && ${range}`;
  return rows.map(r => ({ start: r.lo.getTime(), end: r.hi.getTime() }));
}

// Where a host is busy outside Booking in the coming days, within their
// hours: what their other calendars (by provider: "calendar.google.com")
// and the other tools ("tool:hiring") say. The agenda shows these as grey
// rows, so a hole in the free times is never a mystery. Times only.
export type Elsewhere = { day: string; start: number; end: number; source: string };
export async function busyElsewhere(sql: Query, host: Host, days = 7, now = Date.now()): Promise<Elsewhere[]> {
  const today = wall(now, host.zone).date;
  const last = addDays(today, days - 1);
  const range = sql`tstzrange(${new Date(now - 86400000)}, ${new Date(Date.parse(last + "T00:00:00Z") + 2 * 86400000)})`;
  const rows = await sql<{ lo: Date; hi: Date; source: string }[]>`
    select lower(b.span) as lo, upper(b.span) as hi, c.provider as source from busy b join calendars c on c.id = b.calendar_id
    where b.member_id = ${host.memberId} and b.span && ${range}
    union all
    select lower(span), upper(span), 'tool:' || source from told_spans where member_id = ${host.memberId} and span && ${range}`;
  const overrides = Object.fromEntries((await overridesOf(sql, host.memberId, today)).map(o => [o.day, o.ranges]));
  const out: Elsewhere[] = [];
  const sources = [...new Set(rows.map(r => r.source))].sort();
  for (let day = today; day <= last; day = addDays(day, 1)) {
    for (const source of sources) {
      const spans = rows.filter(r => r.source === source).map(r => ({ start: r.lo.getTime(), end: r.hi.getTime() }));
      for (const w of openParts({ weekly: host.weekly, overrides, zone: host.zone }, spans, day, now)) out.push({ day, ...w, source });
    }
  }
  return out;
}

// The host's blocks still to come (or ending after from), in order.
export async function blocksOf(sql: Query, memberId: string, from = new Date()): Promise<Block[]> {
  const rows = await sql<{ id: string; lo: Date; hi: Date; note: string }[]>`
    select id::text as id, lower(span) as lo, upper(span) as hi, note from blocks
    where member_id = ${memberId} and upper(span) > ${from} order by lower(span) limit 500`;
  return rows.map(r => ({ id: r.id, start: r.lo, end: r.hi, note: r.note }));
}

// ——— Bookings ———

type BookingRow = {
  id: string;
  type_id: string | null;
  member_id: string;
  title: string;
  duration: number;
  location_kind: LocationKind;
  location: string;
  starts_at: Date;
  ends_at: Date;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_note: string;
  answers: unknown;
  guest_zone: string;
  guest_language: string;
  status: "confirmed" | "cancelled";
  cancelled_by: "guest" | "host" | null;
  cancel_reason: string;
  created_at: Date;
  cancelled_at: Date | null;
  moves: number;
  secret: string;
  video_link: string;
  source: "page" | "host" | "import";
  booked_by: string | null;
  payment_link: string;
  paid: boolean;
};
const toBooking = (r: BookingRow): Booking => ({
  id: String(r.id),
  typeId: r.type_id === null ? null : String(r.type_id),
  memberId: r.member_id,
  title: r.title,
  duration: r.duration,
  locationKind: r.location_kind,
  location: r.location,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  guestName: r.guest_name,
  guestEmail: r.guest_email,
  guestPhone: r.guest_phone,
  guestNote: r.guest_note,
  answers: readAnswers(r.answers),
  guestZone: r.guest_zone,
  guestLanguage: r.guest_language,
  status: r.status,
  cancelledBy: r.cancelled_by,
  cancelReason: r.cancel_reason,
  createdAt: r.created_at,
  cancelledAt: r.cancelled_at,
  moves: r.moves,
  secret: r.secret,
  videoLink: r.video_link ?? "",
  source: r.source ?? "page",
  bookedBy: r.booked_by ?? null,
  paymentLink: r.payment_link ?? "",
  paid: r.paid ?? false,
});

const isUnique = (error: unknown) => (error as { code?: string } | null)?.code === "23505";
const isOverlap = (error: unknown) => (error as { code?: string } | null)?.code === "23P01";

function blockedRange(type: Pick<BookingType, "bufferBefore" | "bufferAfter">, start: Date, end: Date): string {
  return `[${new Date(start.getTime() - type.bufferBefore * 60000).toISOString()},${new Date(end.getTime() + type.bufferAfter * 60000).toISOString()})`;
}

// answers: the form's answers to the host's questions, by question id.
export type GuestInput = { start: unknown; name: unknown; email: unknown; phone?: unknown; note: unknown; answers?: Record<string, unknown>; zone: unknown; language: string };
// Who books: the guest on the page (the default), or a host for them — the
// notice does not hold and the host's questions are not required.
export type BookOptions = { bookedBy?: string; company?: string };

// A transaction, or a savepoint inside the caller's.
function transaction<T>(sql: Query, step: (tx: Query) => Promise<T>): Promise<T> {
  return ("begin" in sql ? sql.begin(step) : sql.savepoint(step)) as Promise<T>;
}

// lockType takes the booking type's row for the rest of the transaction:
// bookings of one type are made one at a time, so two visitors cannot
// both take the last place of a day (the daily limit). It reads the type
// again, as it is now.
async function lockType(tx: Query, type: BookingType): Promise<BookingType> {
  const [row] = await tx<TypeRow[]>`select * from types where id = ${type.id} and active for update`;
  if (!row) throw new AppError("not_found");
  return toType(row);
}

// lockHost does the same for a host (their daily maximum, all types).
async function lockHost(tx: Query, memberId: string): Promise<void> {
  await tx`select 1 from hosts where member_id = ${memberId} for update`;
}

// candidates: the hosts of the type free at that start, in the order they
// are offered it: the one with the fewest bookings of the type to come
// first (round robin), the owner first among equals.
async function candidates(tx: Query, owner: Host, type: BookingType, start: Date, now: number, except: string | null, notice: number): Promise<Host[]> {
  const team = await hostsOf(tx, owner, type);
  const free: Host[] = [];
  for (const h of team) {
    const day = wall(start, h.zone).date;
    const found = await hostFree(tx, h, type, day, day, now, except, notice);
    if (found.some(s => Date.parse(s.start) === start.getTime())) free.push(h);
  }
  if (free.length < 2) return free;
  const counts = await tx<{ member_id: string; n: number }[]>`
    select member_id, count(*)::int as n from bookings where type_id = ${type.id} and status = 'confirmed' and ends_at > ${new Date(now)} and member_id in ${tx(free.map(h => h.memberId))} group by member_id`;
  const n = new Map(counts.map(c => [c.member_id, c.n]));
  return free.map((h, i) => ({ h, i })).sort((a, b) => (n.get(a.h.memberId) ?? 0) - (n.get(b.h.memberId) ?? 0) || a.i - b.i).map(x => x.h);
}

// book takes a free time for a visitor (or a host books it for them). In
// one transaction, the type locked, the time is checked again (the page
// may be old; the day may have filled up), and the database refuses two
// confirmed bookings of a host that overlap: two visitors on the same
// time, one gets "taken". A team type goes to the first of its hosts free.
export async function book(sql: Query, host: Host, type: BookingType, input: GuestInput, now = Date.now(), options: BookOptions = {}): Promise<{ booking: Booking; secret: string }> {
  if (host.away || !type.active) throw new AppError("not_found");
  const start = typeof input.start === "string" ? new Date(input.start) : null;
  if (!start || Number.isNaN(start.getTime())) throw new AppError("invalid");
  const name = clean(input.name, limits.name);
  const address = email(input.email);
  const byHost = options.bookedBy !== undefined;
  const phoneNumber = type.locationKind === "phone" ? (byHost && (input.phone === "" || input.phone === undefined) ? "" : phone(input.phone)) : "";
  const note = clean(input.note, limits.note, { optional: true, multiline: true });
  const zone = isZone(input.zone) ? input.zone : host.zone;
  const secret = newSecret();
  return transaction(sql, async tx => {
    const current = await lockType(tx, type);
    // The language the guest read the page in: theirs when the host wrote
    // their texts in it, otherwise the host's (lib/texts.ts); a host booking
    // for someone chose the language of their emails. The booking keeps the
    // type's name and the questions as the guest saw them.
    const asked: Locale = isLocale(input.language) ? input.language : "en";
    const language = byHost ? asked : pageLanguage(host, asked);
    const shown = localizeType(current, host, language);
    // Answered against the questions as they are now; a host booking for
    // someone may leave them.
    const answers = cleanAnswers(byHost ? shown.questions.map(q => ({ ...q, required: false })) : shown.questions, input.answers ?? {});
    const notice = byHost ? 0 : current.noticeMinutes;
    const end = new Date(start.getTime() + current.duration * 60000);
    const videoLink = current.locationKind === "video" && current.videoRooms && current.location ? roomLink(current.location, options.company ?? "") : "";
    for (const who of await candidates(tx, host, current, start, now, null, notice)) {
      try {
        return await transaction(tx, async step => {
          await lockHost(step, who.memberId);
          // Checked again once the host is ours (their daily maximum).
          const day = wall(start, who.zone).date;
          if (!(await hostFree(step, who, current, day, day, now, null, notice)).some(s => Date.parse(s.start) === start.getTime())) throw new AppError("taken");
          const [row] = await step<BookingRow[]>`
            insert into bookings (type_id, member_id, title, duration, location_kind, location, starts_at, ends_at, blocked, guest_name, guest_email, guest_phone, guest_note, answers, guest_zone, guest_language, secret_hash, secret, video_link, source, booked_by, payment_link)
            values (${current.id}, ${who.memberId}, ${shown.title}, ${current.duration}, ${current.locationKind}, ${current.location}, ${start}, ${end}, ${blockedRange(current, start, end)}::tstzrange,
              ${name}, ${address}, ${phoneNumber}, ${note}, ${step.json(answers as never)}, ${zone}, ${language}, ${hashSecret(secret)}, ${secret},
              ${videoLink}, ${byHost ? "host" : "page"}, ${options.bookedBy ?? null}, ${current.paymentLink})
            returning *`;
          return { booking: toBooking(row!), secret };
        });
      } catch (error) {
        // This host was just taken: the next one of the team, if any.
        if (isOverlap(error) || (error instanceof AppError && error.code === "taken")) continue;
        throw error;
      }
    }
    throw new AppError("taken");
  });
}

export async function bookingsByIds(sql: Query, ids: string[]): Promise<Booking[]> {
  if (ids.length === 0) return [];
  return (await sql<BookingRow[]>`select * from bookings where id in ${sql(ids)} order by starts_at`).map(toBooking);
}

// What a guest's link opens: their booking, and where to pick another time.
export async function bySecret(sql: Query, secret: string): Promise<{ booking: Booking; hostSlug: string | null; typeSlug: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{32}$/u.test(secret)) return null;
  const [row] = await sql<(BookingRow & { host_slug: string | null; type_slug: string | null })[]>`
    select b.*, h.slug as host_slug, t.slug as type_slug from bookings b
    left join types t on t.id = b.type_id and t.active
    left join hosts h on h.member_id = t.member_id and h.ready and not h.away
    where b.secret_hash = ${hashSecret(secret)}`;
  return row ? { booking: toBooking(row), hostSlug: row.type_slug ? row.host_slug : null, typeSlug: row.host_slug ? row.type_slug : null } : null;
}

export async function cancelByGuest(sql: Query, secret: string, reason: unknown, now = Date.now()): Promise<Booking> {
  const found = await bySecret(sql, secret);
  if (!found) throw new AppError("not_found");
  const why = clean(reason, limits.reason, { optional: true, multiline: true });
  if (found.booking.status !== "confirmed" || found.booking.startsAt.getTime() <= now) throw new AppError("too_late");
  const [row] = await sql<BookingRow[]>`
    update bookings set status = 'cancelled', cancelled_by = 'guest', cancel_reason = ${why}, cancelled_at = now()
    where id = ${found.booking.id} and status = 'confirmed' returning *`;
  if (!row) throw new AppError("too_late");
  return toBooking(row);
}

// moveTo moves a booking to another free time of its type: the same
// booking (the same link), a new time — with the same host when they are
// free then, else with another of the team (from: its host before).
async function moveTo(sql: Query, booking: Booking, owner: Host, type: BookingType, start: unknown, now: number, notice: "type" | 0): Promise<{ booking: Booking; before: Date; from: string }> {
  const when = typeof start === "string" ? new Date(start) : null;
  if (!when || Number.isNaN(when.getTime())) throw new AppError("invalid");
  return transaction(sql, async tx => {
    // As for a new booking: one at a time per type, checked again.
    const current = await lockType(tx, type);
    const wait = notice === 0 ? 0 : current.noticeMinutes;
    const free = await candidates(tx, owner, current, when, now, booking.id, wait);
    const order = [...free.filter(h => h.memberId === booking.memberId), ...free.filter(h => h.memberId !== booking.memberId)];
    const end = new Date(when.getTime() + current.duration * 60000);
    for (const who of order) {
      try {
        return await transaction(tx, async step => {
          await lockHost(step, who.memberId);
          const day = wall(when, who.zone).date;
          if (!(await hostFree(step, who, current, day, day, now, booking.id, wait)).some(s => Date.parse(s.start) === when.getTime())) throw new AppError("taken");
          const [row] = await step<BookingRow[]>`
            update bookings set member_id = ${who.memberId}, starts_at = ${when}, ends_at = ${end}, duration = ${current.duration}, blocked = ${blockedRange(current, when, end)}::tstzrange, moves = moves + 1, reminded_at = null
            where id = ${booking.id} and status = 'confirmed' returning *`;
          if (!row) throw new AppError("too_late");
          return { booking: toBooking(row), before: booking.startsAt, from: booking.memberId };
        });
      } catch (error) {
        if (isOverlap(error) || (error instanceof AppError && error.code === "taken")) continue;
        throw error;
      }
    }
    throw new AppError("taken");
  });
}

// A guest moves their booking to another free time of the same type.
export async function moveByGuest(sql: Query, secret: string, start: unknown, now = Date.now()): Promise<{ booking: Booking; before: Date; from: string }> {
  const found = await bySecret(sql, secret);
  if (!found) throw new AppError("not_found");
  const { booking } = found;
  if (booking.status !== "confirmed" || booking.startsAt.getTime() <= now) throw new AppError("too_late");
  if (booking.moves >= 5) throw new AppError("too_many_moves");
  // Its type as it is now, when its host's page is public.
  if (!found.hostSlug || !found.typeSlug) throw new AppError("not_found");
  const place = await typeForMove(sql, booking);
  if (!place) throw new AppError("not_found");
  return moveTo(sql, booking, place.host, place.type, start, now, "type");
}

// A host moves a meeting (the guest asked by phone): any free time of its
// type, the notice aside. The guest is told by the caller.
export async function moveByHost(sql: Query, actor: Member, bookingId: unknown, start: unknown, now = Date.now()): Promise<{ booking: Booking; before: Date; from: string }> {
  const booking = await bookingFor(sql, actor, bookingId);
  if (booking.status !== "confirmed" || booking.endsAt.getTime() <= now) throw new AppError("too_late");
  const place = await typeForMove(sql, booking);
  if (!place) throw new AppError("not_found");
  return moveTo(sql, booking, place.host, place.type, start, now, 0);
}

// The type a booking can move within, and its owner: null when the type
// was removed or turned off, or its owner left.
export async function typeForMove(sql: Query, booking: Pick<Booking, "typeId">): Promise<{ host: Host; type: BookingType } | null> {
  if (!booking.typeId) return null;
  const [row] = await sql<(HostRow & { type: TypeRow })[]>`
    select h.*, to_jsonb(t) as type from types t join hosts h on h.member_id = t.member_id
    where t.id = ${booking.typeId} and t.active and not h.away`;
  if (!row) return null;
  return { host: toHost(row), type: toType({ ...row.type, id: String(row.type.id) }) };
}

// A host books for a guest (a call, a visit to the shop): one of their
// own types, any free time (the notice aside); the guest gets their link.
export async function bookForGuest(sql: Query, actor: Member, typeId: unknown, input: GuestInput, now = Date.now(), company = ""): Promise<{ booking: Booking; secret: string }> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const type = await typeOf(sql, actor, typeId);
  const host = await hostOf(sql, actor.id);
  if (!host || host.away) throw new AppError("not_host");
  if (!type.active) throw new AppError("not_found");
  return book(sql, host, type, input, now, { bookedBy: actor.id, company });
}

// The free times a host sees for one of their types (booking for a guest,
// moving a meeting): the notice aside.
export async function hostTimes(sql: Query, actor: Member, typeId: unknown, from: string, to: string, except: unknown = null, now = Date.now()): Promise<Slot[]> {
  if (!can(actor, "host") && !can(actor, "bookings.all")) throw new AppError("forbidden");
  let exceptId: string | null = null;
  let place: { host: Host; type: BookingType } | null;
  if (except !== null && except !== undefined && except !== "") {
    const booking = await bookingFor(sql, actor, except);
    exceptId = booking.id;
    place = await typeForMove(sql, booking);
  } else {
    const type = await typeOf(sql, actor, typeId);
    const host = await hostOf(sql, actor.id);
    place = host ? { host, type } : null;
  }
  if (!place) throw new AppError("not_found");
  return freeTimes(sql, place.host, place.type, from, to, now, exceptId, { notice: 0 });
}

// The guest paid (the type asks for a payment): the host marks it.
export async function markPaid(sql: Query, actor: Member, bookingId: unknown, paid: boolean): Promise<void> {
  const booking = await bookingFor(sql, actor, bookingId);
  await sql`update bookings set paid = ${paid} where id = ${booking.id}`;
}

export type Scope = "upcoming" | "past" | "cancelled";

// A host's bookings; with all (administrators), everyone's.
export async function bookings(sql: Query, actor: Member, options: { scope: Scope; all?: boolean; now?: number; limit?: number }): Promise<Booking[]> {
  const everyone = options.all === true;
  if (everyone ? !can(actor, "bookings.all") : !can(actor, "host")) throw new AppError("forbidden");
  const now = new Date(options.now ?? Date.now());
  const limit = Math.min(options.limit ?? 200, 500);
  const who = everyone ? sql`true` : sql`member_id = ${actor.id}`;
  const rows =
    options.scope === "upcoming"
      ? await sql<BookingRow[]>`select * from bookings where ${who} and status = 'confirmed' and ends_at > ${now} order by starts_at limit ${limit}`
      : options.scope === "past"
        ? await sql<BookingRow[]>`select * from bookings where ${who} and status = 'confirmed' and ends_at <= ${now} order by starts_at desc limit ${limit}`
        : await sql<BookingRow[]>`select * from bookings where ${who} and status = 'cancelled' order by cancelled_at desc limit ${limit}`;
  return rows.map(toBooking);
}

export async function bookingFor(sql: Query, actor: Member, bookingId: unknown): Promise<Booking> {
  const [row] = await sql<BookingRow[]>`select * from bookings where id = ${id(bookingId)}`;
  if (!row) throw new AppError("not_found");
  const mine = row.member_id === actor.id && can(actor, "host");
  if (!mine && !can(actor, "bookings.all")) throw new AppError("not_found");
  return toBooking(row);
}

export async function cancelByHost(sql: Query, actor: Member, bookingId: unknown, reason: unknown, now = Date.now()): Promise<Booking> {
  const booking = await bookingFor(sql, actor, bookingId);
  const why = clean(reason, limits.reason, { optional: true, multiline: true });
  if (booking.status !== "confirmed" || booking.endsAt.getTime() <= now) throw new AppError("too_late");
  const [row] = await sql<BookingRow[]>`
    update bookings set status = 'cancelled', cancelled_by = 'host', cancel_reason = ${why}, cancelled_at = now()
    where id = ${booking.id} and status = 'confirmed' returning *`;
  if (!row) throw new AppError("too_late");
  return toBooking(row);
}

// The tile's count: each host's bookings still to come today, in their
// time zone.
export async function todayCounts(sql: Query, memberIds: string[], now = Date.now()): Promise<Map<string, number>> {
  const counts = new Map(memberIds.map(m => [m, 0]));
  if (memberIds.length === 0) return counts;
  const rows = await sql<{ member_id: string; zone: string; starts_at: Date }[]>`
    select b.member_id, h.zone, b.starts_at from bookings b join hosts h on h.member_id = b.member_id
    where b.member_id in ${sql(memberIds)} and b.status = 'confirmed' and b.ends_at > ${new Date(now)} and b.starts_at < ${new Date(now + 36 * 3600000)}`;
  for (const r of rows) if (wall(r.starts_at, r.zone).date === wall(now, r.zone).date) counts.set(r.member_id, (counts.get(r.member_id) ?? 0) + 1);
  return counts;
}

// ——— The public form's guard ———

export const formLimits = { perVisitorHour: 8, perHour: 200, minimumSeconds: 3 } as const;

export async function guard(sql: Query, visitor: string): Promise<void> {
  const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const key = "v:" + createHash("sha256").update(visitor).digest("hex").slice(0, 32);
  const counts = await sql<{ key: string; count: number }[]>`
    insert into form_counts (key, hour, count) values (${key}, ${hour}, 1), ('all', ${hour}, 1)
    on conflict (key, hour) do update set count = form_counts.count + 1
    returning key, count`;
  const mine = counts.find(c => c.key === key)?.count ?? 0;
  const all = counts.find(c => c.key === "all")?.count ?? 0;
  if (mine > formLimits.perVisitorHour || all > formLimits.perHour) throw new AppError("too_many");
}

// ——— Keeping data ———

// cleanup (the nightly schedule): bookings over for longer than the
// company keeps them are deleted, with the guest's data; old counters too.
export async function cleanup(sql: Query, now = Date.now()): Promise<number> {
  const s = await settings(sql);
  await sql`delete from form_counts where hour < ${new Date(now - 86400000)}`;
  if (s.retentionMonths === 0) return 0;
  const done = await sql`delete from bookings where ends_at < ${new Date(now)} - make_interval(months => ${s.retentionMonths})`;
  return done.count;
}

// eraseGuest deletes every booking of an email address (a guest asked);
// the bookings deleted (and their hosts), to take them out of the hosts'
// calendars.
export async function eraseGuest(sql: Query, actor: Member, address: unknown): Promise<{ id: string; memberId: string }[]> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; member_id: string }[]>`delete from bookings where lower(guest_email) = ${email(address).toLowerCase()} returning id::text as id, member_id`;
  return rows.map(r => ({ id: r.id, memberId: r.member_id }));
}

// The bookings whose reminder is due: starting within the next 26 hours,
// more than 2 hours from now, made more than a day before (a booking for
// tomorrow made today needs no reminder), not reminded yet. Marked as they
// are taken, so a run made again sends nothing twice.
export async function dueReminders(sql: Query, now = Date.now()): Promise<Booking[]> {
  const rows = await sql<BookingRow[]>`
    update bookings set reminded_at = ${new Date(now)}
    where status = 'confirmed' and reminded_at is null
      and starts_at > ${new Date(now + 2 * 3600000)} and starts_at <= ${new Date(now + 26 * 3600000)}
      and created_at < starts_at - interval '24 hours'
    returning *`;
  return rows.map(toBooking);
}

export async function exportRows(sql: Query, actor: Member, all: boolean): Promise<Booking[]> {
  if (all ? !can(actor, "bookings.all") : !can(actor, "host")) throw new AppError("forbidden");
  const rows = await sql<BookingRow[]>`select * from bookings where ${all ? sql`true` : sql`member_id = ${actor.id}`} order by starts_at desc limit 20000`;
  return rows.map(toBooking);
}
