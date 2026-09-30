import { createHash, randomBytes } from "node:crypto";
import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { bookingsByIds, hashSecret, hostOf, typesOf, type Booking } from "./booking.ts";
import { parseCsv } from "./csv.ts";
import type { Query } from "./db.ts";
import { email as checkEmail, limits } from "./model.ts";
import { instantOf, isZone } from "./zone.ts";

// Importing the meetings a host already has in Calendly, from the export
// of its "Scheduled events" page (Export → CSV), so switching loses none:
// the ones still to come become bookings of this host, found by the type
// of the same name when there is one. A time already taken here is not
// booked twice: it is listed back. Past and cancelled rows are skipped;
// importing the same file again adds nothing. Guests are not emailed
// (they booked in Calendly); their link works if they are given it.
//
// The columns are read by their names — "Invitee Name", "Invitee Email",
// "Event Type Name", "Start Date & Time", "End Date & Time", "Location",
// "Invitee Time Zone", "Canceled" — as Calendly's help pages name them
// (search results read 2026-09-29; the pages themselves could not be
// opened from here). Times: ISO 8601 with an offset, or a wall-clock time
// ("2026-10-12 14:30", "10/12/2026 2:30 pm") in the zone the host picks.

export const importLimits = { bytes: 2 * 1024 * 1024, rows: 2000 } as const;
export type ImportResult = { imported: number; conflicts: { name: string; start: string }[]; skipped: number };

const columns = {
  name: ["invitee name", "name", "invitee full name"],
  email: ["invitee email", "email", "invitee email address"],
  type: ["event type name", "event type", "event name"],
  start: ["start date & time", "start date and time", "start time", "event start time", "start"],
  end: ["end date & time", "end date and time", "end time", "event end time", "end"],
  location: ["location"],
  zone: ["invitee time zone", "time zone", "timezone"],
  cancelled: ["canceled", "cancelled", "status"],
} as const;

// A time as Calendly's file may write it, read in zone when it has no
// offset. null: not a time.
export function readTime(text: string, zone: string): Date | null {
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/u.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/iu.exec(value);
  let y: number, mo: number, d: number;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    // Month first, as Calendly's (US) exports write it.
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/iu.exec(value);
    if (!m) return null;
    [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  let hours = Number(m[4]);
  const minutes = Number(m[5]);
  const half = m[6]?.toLowerCase();
  if (half) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (half === "pm" ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (Number.isNaN(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) return null;
  return instantOf(date, hours * 60 + minutes, zone);
}

export async function importCalendly(sql: Query, actor: Member, text: unknown, zone: unknown, now = Date.now()): Promise<ImportResult & { bookings: Booking[] }> {
  if (!can(actor, "host")) throw new AppError("forbidden");
  if (typeof text !== "string" || text.length > importLimits.bytes) throw new AppError("import_unreadable");
  const host = await hostOf(sql, actor.id);
  if (!host) throw new AppError("not_host");
  const fileZone = isZone(zone) ? zone : host.zone;
  const rows = parseCsv(text, importLimits.rows + 1);
  const header = (rows[0] ?? []).map(h => h.trim().toLowerCase());
  const at = (names: readonly string[]) => header.findIndex(h => names.includes(h));
  const col = Object.fromEntries(Object.entries(columns).map(([k, names]) => [k, at(names)])) as Record<keyof typeof columns, number>;
  if (col.name < 0 || col.email < 0 || col.start < 0) throw new AppError("import_unreadable");
  const types = await typesOf(sql, actor.id);
  const byTitle = new Map(types.map(t => [t.title.trim().toLowerCase(), t]));
  const result: ImportResult = { imported: 0, conflicts: [], skipped: 0 };
  const made: string[] = [];
  for (const row of rows.slice(1, importLimits.rows + 1)) {
    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    if (row.every(c => c.trim() === "")) continue;
    const cancelled = cell(col.cancelled).toLowerCase();
    if (["true", "yes", "canceled", "cancelled", "1"].includes(cancelled)) {
      result.skipped++;
      continue;
    }
    const start = readTime(cell(col.start), fileZone);
    const name = cell(col.name).replace(/\s+/gu, " ").slice(0, limits.name);
    let address: string;
    try {
      address = checkEmail(cell(col.email));
    } catch {
      result.skipped++;
      continue;
    }
    if (!start || name === "" || start.getTime() <= now) {
      result.skipped++;
      continue;
    }
    const typeName = cell(col.type).slice(0, limits.title);
    const type = byTitle.get(typeName.toLowerCase()) ?? null;
    const endRead = readTime(cell(col.end), fileZone);
    const minutes = endRead && endRead > start ? Math.min(480, Math.round((endRead.getTime() - start.getTime()) / 60000)) : type?.duration ?? 30;
    const end = new Date(start.getTime() + minutes * 60000);
    const guestZone = isZone(cell(col.zone)) ? cell(col.zone) : fileZone;
    const location = cell(col.location).slice(0, limits.location);
    const kind = type?.locationKind ?? (/^https:\/\//u.test(location) ? "video" : location ? "place" : "other");
    const ref = createHash("sha256").update(`${address.toLowerCase()}|${start.toISOString()}`).digest("hex").slice(0, 32);
    const secret = randomBytes(24).toString("base64url");
    try {
      const insert = (step: Query) => step<{ id: string }[]>`
        insert into bookings (type_id, member_id, title, duration, location_kind, location, starts_at, ends_at, blocked, guest_name, guest_email, guest_zone, guest_language, secret_hash, secret, source, booked_by, import_ref)
        values (${type?.id ?? null}, ${actor.id}, ${type?.title ?? (typeName || "Calendly")}, ${minutes}, ${kind}, ${location || type?.location || ""}, ${start}, ${end}, tstzrange(${start}, ${end}),
          ${name}, ${address}, ${guestZone}, ${localeOf(actor.language)}, ${hashSecret(secret)}, ${secret}, 'import', ${actor.id}, ${ref})
        on conflict (member_id, import_ref) where import_ref is not null do nothing
        returning id::text as id`;
      // Each row alone: one refused leaves the others.
      const [inserted] = await ("begin" in sql ? sql.begin(insert) : sql.savepoint(insert));
      if (inserted) {
        made.push(inserted.id);
        result.imported++;
      } else result.skipped++;
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "23P01") throw error;
      result.conflicts.push({ name, start: start.toISOString() });
    }
  }
  return { ...result, bookings: await bookingsByIds(sql, made) };
}
