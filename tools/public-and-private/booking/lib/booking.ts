import { createHash, randomBytes } from "node:crypto";
import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { clean, colors, email, id, isColor, isLocationKind, limits, minutes, phone, slug, slugify, type Color, type LocationKind } from "./model.ts";
import { defaultWeek, slots, validRanges, type Busy, type Ranges, type Slot } from "./slots.ts";
import { addDays, isDate, isZone, wall } from "./zone.ts";

// Booking's services: hosts and their hours, booking types, the free times
// a visitor sees and the bookings they make. Every function takes the
// database (or a transaction) and, on the team side, who acts; it checks
// the right itself and throws an AppError code when it refuses.

export type Host = { memberId: string; slug: string; zone: string; weekly: Ranges[]; listed: boolean; away: boolean; welcome: string; hasFeed: boolean };
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
  color: Color;
  active: boolean;
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
};
// mailWorks: whether the last email the tool tried went out (null: none
// tried yet) — the pages say when guests get no email.
export type Settings = { companyName: string; retentionMonths: number; defaultZone: string; publicOrigin: string | null; mailWorks: boolean | null };

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = () => randomBytes(24).toString("base64url");

// ——— Settings ———

// The Chest gives its company name, time zone and public address (Proposal
// (studio): the chest module); an administrator may name the company
// otherwise for visitors, and the address seen in requests is remembered
// for a Chest that does not give it yet.
export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const s: Settings = { companyName: chest.company(), retentionMonths: 24, defaultZone: chest.timeZone(), publicOrigin: chest.publicUrl(), mailWorks: null };
  for (const { key, value } of rows) {
    if (key === "company_name" && typeof value === "string" && value !== "") s.companyName = value;
    if (key === "retention_months" && typeof value === "number") s.retentionMonths = value;
    if (key === "default_zone" && isZone(value)) s.defaultZone = value;
    if (key === "public_origin" && typeof value === "string" && !chest.publicUrl()) s.publicOrigin = value;
    if (key === "mail_works" && typeof value === "boolean") s.mailWorks = value;
  }
  return s;
}

async function put(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

export async function saveSettings(sql: Query, actor: Member, input: { companyName: unknown; retentionMonths: unknown; defaultZone: unknown }): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const name = clean(input.companyName, limits.name, { optional: true });
  const months = minutes(input.retentionMonths, 0, 120);
  if (!isZone(input.defaultZone)) throw new AppError("invalid");
  await put(sql, "company_name", name);
  await put(sql, "retention_months", months);
  await put(sql, "default_zone", input.defaultZone);
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

type HostRow = { member_id: string; slug: string; zone: string; weekly: Ranges[]; listed: boolean; away: boolean; welcome: string; feed_hash: string | null };
const toHost = (r: HostRow): Host => ({ memberId: r.member_id, slug: r.slug, zone: r.zone, weekly: r.weekly, listed: r.listed, away: r.away, welcome: r.welcome, hasFeed: r.feed_hash !== null });

export async function hostOf(sql: Query, memberId: string): Promise<Host | null> {
  const [row] = await sql<HostRow[]>`select * from hosts where member_id = ${memberId}`;
  return row ? toHost(row) : null;
}

// ensureHost gives a member who may host a page of their own the first time
// they open the tool: an address from their name, the company's time zone,
// weekday hours and one booking type to start from. Coming back after being
// away (access given again) makes their page work again.
export async function ensureHost(sql: Query, actor: Member, first: { title: string; slug: string }): Promise<Host> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const existing = await hostOf(sql, actor.id);
  if (existing) {
    if (existing.away) await sql`update hosts set away = false where member_id = ${actor.id}`;
    return { ...existing, away: false };
  }
  const s = await settings(sql);
  const base = slugify(actor.name || "page");
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 36)}-${n}`;
    const [row] = await sql<HostRow[]>`
      insert into hosts (member_id, slug, zone, weekly) values (${actor.id}, ${candidate}, ${s.defaultZone}, ${sql.json(defaultWeek as never)})
      on conflict do nothing returning *`;
    if (row) {
      await sql`insert into types (member_id, slug, title, duration, interval, location_kind) values (${actor.id}, ${first.slug}, ${first.title}, 30, 30, 'video')`;
      return toHost(row);
    }
    // Another request created this host meanwhile: take it.
    const again = await hostOf(sql, actor.id);
    if (again) return again;
  }
  throw new AppError("slug_taken");
}

export async function saveHost(sql: Query, actor: Member, input: { slug: unknown; zone: unknown; welcome: unknown; listed: unknown }): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const s = slug(input.slug);
  if (!isZone(input.zone)) throw new AppError("invalid");
  const welcome = clean(input.welcome, limits.welcome, { optional: true, multiline: true });
  try {
    const done = await sql`update hosts set slug = ${s}, zone = ${input.zone}, welcome = ${welcome}, listed = ${input.listed === true} where member_id = ${actor.id}`;
    if (done.count === 0) throw new AppError("not_host");
  } catch (error) {
    if (isUnique(error)) throw new AppError("slug_taken");
    throw error;
  }
}

export async function saveWeekly(sql: Query, actor: Member, weekly: unknown): Promise<void> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (!Array.isArray(weekly) || weekly.length !== 7 || !weekly.every(validRanges)) throw new AppError("invalid");
  const sorted = (weekly as Ranges[]).map(day => [...day].sort((a, b) => a[0] - b[0]));
  const done = await sql`update hosts set weekly = ${sql.json(sorted as never)} where member_id = ${actor.id}`;
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
  color: string;
  active: boolean;
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
  color: isColor(r.color) ? r.color : "sky",
  active: r.active,
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
  color: unknown;
  active: unknown;
};

function typeValues(input: TypeInput) {
  const title = clean(input.title, limits.title);
  const duration = minutes(input.duration, 5, 480);
  if (!isLocationKind(input.locationKind)) throw new AppError("invalid");
  const location = clean(input.location, limits.location, { optional: true });
  // A video link is a web address the guest opens: only https.
  if (input.locationKind === "video" && location !== "" && !/^https:\/\/[^\s<>"]+$/u.test(location)) throw new AppError("invalid_link");
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
    color: isColor(input.color) ? input.color : colors[0],
    active: input.active !== false,
  };
}

export async function createType(sql: Query, actor: Member, input: TypeInput): Promise<BookingType> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const v = typeValues(input);
  if (!(await hostOf(sql, actor.id))) throw new AppError("not_host");
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from types where member_id = ${actor.id}`;
  const n = row?.n ?? 0;
  if (n >= limits.typesPerHost) throw new AppError("too_many_types", { max: limits.typesPerHost });
  try {
    const [row] = await sql<TypeRow[]>`insert into types ${sql({ ...v, member_id: actor.id, position: n })} returning *`;
    return toType(row!);
  } catch (error) {
    if (isUnique(error)) throw new AppError("slug_taken");
    throw error;
  }
}

export async function updateType(sql: Query, actor: Member, typeId: unknown, input: TypeInput): Promise<BookingType> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  const v = typeValues(input);
  try {
    const [row] = await sql<TypeRow[]>`update types set ${sql(v)} where id = ${id(typeId)} and member_id = ${actor.id} returning *`;
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

// ——— What visitors see ———

// The hosts on the company's booking page: listed, here, with at least one
// active type.
export async function listedHosts(sql: Query): Promise<(Host & { types: number })[]> {
  const rows = await sql<(HostRow & { types: number })[]>`
    select h.*, count(t.id)::int as types from hosts h join types t on t.member_id = h.member_id and t.active
    where h.listed and not h.away group by h.member_id order by h.created_at limit 200`;
  return rows.map(r => ({ ...toHost(r), types: r.types }));
}

export async function publicHost(sql: Query, hostSlug: string): Promise<{ host: Host; types: BookingType[] } | null> {
  if (!/^[a-z0-9-]{1,40}$/u.test(hostSlug)) return null;
  const [row] = await sql<HostRow[]>`select * from hosts where slug = ${hostSlug} and not away`;
  if (!row) return null;
  return { host: toHost(row), types: await typesOf(sql, row.member_id, { activeOnly: true }) };
}

export async function publicType(sql: Query, hostSlug: string, typeSlug: string): Promise<{ host: Host; type: BookingType } | null> {
  if (!/^[a-z0-9-]{1,40}$/u.test(hostSlug) || !/^[a-z0-9-]{1,40}$/u.test(typeSlug)) return null;
  const [row] = await sql<(HostRow & { type: TypeRow })[]>`
    select h.*, to_jsonb(t) as type from hosts h join types t on t.member_id = h.member_id
    where h.slug = ${hostSlug} and t.slug = ${typeSlug} and t.active and not h.away`;
  if (!row) return null;
  return { host: toHost(row), type: toType({ ...row.type, id: String(row.type.id) }) };
}

async function busyOf(sql: Query, memberId: string, from: Date, to: Date, except: string | null): Promise<Busy[]> {
  const rows = await sql<{ lo: Date; hi: Date }[]>`
    select lower(blocked) as lo, upper(blocked) as hi from bookings
    where member_id = ${memberId} and status = 'confirmed' and blocked && tstzrange(${from}, ${to})
    ${except ? sql`and id <> ${except}` : sql``}`;
  return rows.map(r => ({ start: r.lo.getTime(), end: r.hi.getTime() }));
}

// freeTimes: the starts a visitor can pick between two dates of the host's
// calendar (a week at most at a time).
export async function freeTimes(sql: Query, host: Host, type: BookingType, from: string, to: string, now = Date.now(), except: string | null = null): Promise<Slot[]> {
  if (!isDate(from) || !isDate(to) || to < from || addDays(from, 42) < to) throw new AppError("invalid");
  const overrides = Object.fromEntries((await overridesOf(sql, host.memberId, addDays(from, -1))).map(o => [o.day, o.ranges]));
  // Wide enough for any zone: a day before, a day after.
  const busy = await busyOf(sql, host.memberId, new Date(Date.parse(from + "T00:00:00Z") - 2 * 86400000), new Date(Date.parse(to + "T00:00:00Z") + 3 * 86400000), except);
  return slots({ weekly: host.weekly, overrides, zone: host.zone }, rulesOf(type), busy, { from, to }, now);
}

const rulesOf = (t: BookingType) => ({ duration: t.duration, interval: t.interval, bufferBefore: t.bufferBefore, bufferAfter: t.bufferAfter, noticeMinutes: t.noticeMinutes, windowDays: t.windowDays });

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
  guest_zone: string;
  guest_language: string;
  status: "confirmed" | "cancelled";
  cancelled_by: "guest" | "host" | null;
  cancel_reason: string;
  created_at: Date;
  cancelled_at: Date | null;
  moves: number;
  secret: string;
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
  guestZone: r.guest_zone,
  guestLanguage: r.guest_language,
  status: r.status,
  cancelledBy: r.cancelled_by,
  cancelReason: r.cancel_reason,
  createdAt: r.created_at,
  cancelledAt: r.cancelled_at,
  moves: r.moves,
  secret: r.secret,
});

const isUnique = (error: unknown) => (error as { code?: string } | null)?.code === "23505";
const isOverlap = (error: unknown) => (error as { code?: string } | null)?.code === "23P01";

async function isFree(sql: Query, host: Host, type: BookingType, start: Date, now: number, except: string | null): Promise<boolean> {
  const day = wall(start, host.zone).date;
  const found = await freeTimes(sql, host, type, day, day, now, except);
  return found.some(s => Date.parse(s.start) === start.getTime());
}

function blockedRange(type: Pick<BookingType, "bufferBefore" | "bufferAfter">, start: Date, end: Date): string {
  return `[${new Date(start.getTime() - type.bufferBefore * 60000).toISOString()},${new Date(end.getTime() + type.bufferAfter * 60000).toISOString()})`;
}

export type GuestInput = { start: unknown; name: unknown; email: unknown; phone?: unknown; note: unknown; zone: unknown; language: string };

// book takes a free time for a visitor. The time is checked again (the
// page may be old), and the database refuses two confirmed bookings of a
// host that overlap: two visitors on the same time, one gets "taken".
export async function book(sql: Query, host: Host, type: BookingType, input: GuestInput, now = Date.now()): Promise<{ booking: Booking; secret: string }> {
  if (host.away || !type.active) throw new AppError("not_found");
  const start = typeof input.start === "string" ? new Date(input.start) : null;
  if (!start || Number.isNaN(start.getTime())) throw new AppError("invalid");
  const name = clean(input.name, limits.name);
  const address = email(input.email);
  const phoneNumber = type.locationKind === "phone" ? phone(input.phone) : "";
  const note = clean(input.note, limits.note, { optional: true, multiline: true });
  const zone = isZone(input.zone) ? input.zone : host.zone;
  if (!(await isFree(sql, host, type, start, now, null))) throw new AppError("taken");
  const end = new Date(start.getTime() + type.duration * 60000);
  const secret = newSecret();
  try {
    const [row] = await sql<BookingRow[]>`
      insert into bookings (type_id, member_id, title, duration, location_kind, location, starts_at, ends_at, blocked, guest_name, guest_email, guest_phone, guest_note, guest_zone, guest_language, secret_hash, secret)
      values (${type.id}, ${host.memberId}, ${type.title}, ${type.duration}, ${type.locationKind}, ${type.location}, ${start}, ${end}, ${blockedRange(type, start, end)}::tstzrange,
        ${name}, ${address}, ${phoneNumber}, ${note}, ${zone}, ${input.language}, ${hashSecret(secret)}, ${secret})
      returning *`;
    return { booking: toBooking(row!), secret };
  } catch (error) {
    if (isOverlap(error)) throw new AppError("taken");
    throw error;
  }
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
    left join hosts h on h.member_id = b.member_id and not h.away
    left join types t on t.id = b.type_id and t.active
    where b.secret_hash = ${hashSecret(secret)}`;
  return row ? { booking: toBooking(row), hostSlug: row.host_slug, typeSlug: row.type_slug } : null;
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

// A guest moves their booking to another free time of the same type: the
// same booking (the same link), a new time.
export async function moveByGuest(sql: Query, secret: string, start: unknown, now = Date.now()): Promise<{ booking: Booking; before: Date }> {
  const found = await bySecret(sql, secret);
  if (!found) throw new AppError("not_found");
  const { booking } = found;
  if (booking.status !== "confirmed" || booking.startsAt.getTime() <= now) throw new AppError("too_late");
  if (booking.moves >= 5) throw new AppError("too_many_moves");
  if (!found.hostSlug || !found.typeSlug) throw new AppError("not_found");
  const place = await publicType(sql, found.hostSlug, found.typeSlug);
  if (!place) throw new AppError("not_found");
  const when = typeof start === "string" ? new Date(start) : null;
  if (!when || Number.isNaN(when.getTime())) throw new AppError("invalid");
  if (!(await isFree(sql, place.host, place.type, when, now, booking.id))) throw new AppError("taken");
  const end = new Date(when.getTime() + place.type.duration * 60000);
  try {
    const [row] = await sql<BookingRow[]>`
      update bookings set starts_at = ${when}, ends_at = ${end}, duration = ${place.type.duration}, blocked = ${blockedRange(place.type, when, end)}::tstzrange, moves = moves + 1, reminded_at = null
      where id = ${booking.id} and status = 'confirmed' returning *`;
    if (!row) throw new AppError("too_late");
    return { booking: toBooking(row), before: booking.startsAt };
  } catch (error) {
    if (isOverlap(error)) throw new AppError("taken");
    throw error;
  }
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

// eraseGuest deletes every booking of an email address (a guest asked).
export async function eraseGuest(sql: Query, actor: Member, address: unknown): Promise<number> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const done = await sql`delete from bookings where lower(guest_email) = ${email(address).toLowerCase()}`;
  return done.count;
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
