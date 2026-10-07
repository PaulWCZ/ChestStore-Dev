import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import type { ToolEvent } from "@argentic/chest-sdk/events";
import * as members from "@argentic/chest-sdk/members";
import type { Query, Sql } from "./db.ts";
import { companyNamed, isObject, line, match, refPattern, safe } from "./from-forms.ts";
import { format, formatDate, type Catalogue, type Locale } from "../i18n/index.ts";
import { limits, memberPattern, phone as checkPhone } from "../shared/model.ts";
import { email as checkEmail } from "./email.ts";
import { cut as bounded, notify } from "./notify.ts";
import { managers } from "./team.ts";

// What Booking tells Clients (Proposal (studio): events between tools, once
// an administrator linked the two): `booking.confirmed` — a meeting booked
// with a member, or moved — and `booking.cancelled`. The contract is
// Booking's (its README, "With the other tools"; version 1):
//
//   { v: 1, booking: "42", status: "confirmed" | "cancelled", at,
//     host: "mbr_…" | null, start, end, type: {id, name: {en, fr}},
//     kind, contact: {name, email, phone, company, language}, source,
//     moves, cancelledBy?, path: "/chest/bookings/42" }
//
// A version other than 1 is ignored (a later one may mean other things).
//
// Who the guest is: the rule of form answers (lib/from-forms.ts) — the
// same email (whatever its case) is the same person; a phone only with the
// same name; otherwise a new contact, marked "maybe the same person" when
// its phone is someone else's. Never by the phone alone.
//
// One line of history per booking (kind 'booking'), on the contact (and
// their company): "Booked a meeting: Project call", its time and host.
// - the first `confirmed` makes it (and the contact, when new);
// - a later `confirmed` with more moves replaces its time (and host); an
//   older or repeated one does nothing;
// - `cancelled` marks it cancelled, and is final: a `confirmed` after it is
//   ignored — even one arriving before it by the Chest's delivery order,
//   since a cancelled booking never comes back in Booking;
// - the same event twice does nothing (booked_meetings holds the state).
// A contact deleted or erased in Clients is never brought back by a later
// event of the same booking.
//
// Who owns a new contact: the host, when they work on clients here (a
// salesperson or a manager with the tool: they are meeting them); else
// nobody — a lead in My day, the managers told — as a form's contact. An
// existing contact keeps its owner and what the team wrote; only an empty
// email or phone is filled in. The contact counts as in touch when they
// booked (the prospects' three-year rule).
//
// The meeting shows on the contact's history and, while it is to come, on
// the My day of its host and of the contact's owner, each linking back to
// the booking in Booking (chest.tools.link("booking", path), made when the
// page is shown: its path is stored, never an address).

export type BookingEvent = {
  event: string;
  booking: string;
  status: "confirmed" | "cancelled";
  at: Date;
  host: string | null;
  start: Date;
  end: Date;
  type: { en: string; fr: string };
  kind: string;
  moves: number;
  cancelledBy: "guest" | "host" | null;
  path: string;
  name: string;
  email: string;
  phone: string;
  company: string;
};

const kinds = new Set(["place", "phone", "video", "ask"]);
const pathPattern = /^\/chest\/[\x21-\x7e]{0,299}$/u;
const day = 86_400_000;
const instant = (value: unknown): Date | null => {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

// readBooking: the event as Clients uses it, or null when it is not one to
// act on (another version, another shape, no way to know who booked).
export function readBooking(event: Pick<ToolEvent, "id" | "type" | "data">, now = new Date()): BookingEvent | null {
  const d = event.data;
  if (d["v"] !== 1) return null;
  const status = event.type === "booking.confirmed" ? "confirmed" : event.type === "booking.cancelled" ? "cancelled" : null;
  if (!status || d["status"] !== status) return null;
  const booking = d["booking"];
  if (typeof booking !== "string" || !refPattern.test(booking)) return null;
  const start = instant(d["start"]), end = instant(d["end"]);
  // A meeting of at most a day, within the Chest's calendar bounds.
  if (!start || !end || end <= start || end.getTime() - start.getTime() > day || Math.abs(start.getTime() - now.getTime()) > 3 * 366 * day) return null;
  const moves = d["moves"];
  if (typeof moves !== "number" || !Number.isInteger(moves) || moves < 0 || moves > 1_000_000) return null;
  const host = d["host"];
  if (host !== null && host !== undefined && (typeof host !== "string" || !memberPattern.test(host))) return null;
  const contact = d["contact"];
  if (!isObject(contact)) return null;
  const email = safe(() => checkEmail(line(contact["email"], limits.email)));
  const phone = safe(() => checkPhone(line(contact["phone"], limits.phone)));
  if (!email && !phone) return null;
  const type = isObject(d["type"]) && isObject(d["type"]["name"]) ? d["type"]["name"] : {};
  const en = line(type["en"], limits.title), fr = line(type["fr"], limits.title);
  const at = instant(d["at"]);
  const path = typeof d["path"] === "string" && pathPattern.test(d["path"]) ? d["path"] : "";
  const by = d["cancelledBy"];
  return {
    event: event.id,
    booking,
    status,
    // Never in the future: a clock ahead does not reorder the history.
    at: at && at.getTime() <= now.getTime() ? at : now,
    host: typeof host === "string" ? host : null,
    start,
    end,
    type: { en: en || fr, fr: fr || en },
    kind: typeof d["kind"] === "string" && kinds.has(d["kind"]) ? d["kind"] : "ask",
    moves,
    cancelledBy: status === "cancelled" && (by === "guest" || by === "host") ? by : null,
    path,
    name: line(contact["name"], limits.name),
    email,
    phone,
    company: line(contact["company"], limits.name),
  };
}

// Whether the host works on clients here: then a new contact is theirs.
async function hostWorksHere(host: string | null): Promise<boolean> {
  if (!host) return false;
  try {
    const found = (await members.lookup([host])).members.find(m => m.id === host);
    return Boolean(found?.role && (found.role === "sales" || found.role === "manager"));
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}

type Meeting = { booking: string; status: "confirmed" | "cancelled"; moves: number; activity_id: string | null };
export type BookingReceived = { change: "new" | "moved" | "cancelled"; contact: { id: string; name: string; owner: string | null }; created: boolean; maybe: { id: string; name: string } | null };

// The line's data: what the history shows, and nothing of the guest's note,
// answers or link (Booking never sends them).
const lineData = (b: BookingEvent) => ({
  event: b.event, booking: b.booking, status: b.status, start: b.start.toISOString(), end: b.end.toISOString(),
  host: b.host, type: b.type, kind: b.kind, moves: b.moves, cancelledBy: b.cancelledBy, path: b.path,
  who: { name: b.name, email: b.email, phone: b.phone },
});

// receiveBooking: the meeting made, moved or cancelled on the contact's
// history; null when there is nothing to do (another shape, a repeat, an
// older move, a confirmation after a cancellation, a contact since
// deleted).
export async function receiveBooking(sql: Sql, event: Pick<ToolEvent, "id" | "type" | "data">): Promise<BookingReceived | null> {
  const b = readBooking(event);
  if (!b) return null;
  const hostOwns = await hostWorksHere(b.host);
  const received = await sql.begin(async (tx): Promise<BookingReceived | null> => {
    // One row per booking, taken first: two deliveries at once wait for
    // each other here.
    const made = await tx`insert into booked_meetings (booking, status, moves, starts_at, ends_at, host) values (${b.booking}, ${b.status}, ${b.moves}, ${b.start}, ${b.end}, ${b.host})
      on conflict (booking) do nothing returning booking`;
    // New: a confirmation makes the line (and the contact). A cancellation
    // of a booking never heard of is only remembered — so that a
    // confirmation delivered after it is ignored — and brings nobody in.
    if (made.length === 1) return b.status === "confirmed" ? create(tx, b, hostOwns) : null;
    const [known] = await tx<Meeting[]>`
      select booking, status, moves, activity_id::text as activity_id from booked_meetings where booking = ${b.booking} for update`;
    // A row without a line — a cancellation that came first, or a contact
    // deleted since: nothing comes back.
    if (!known || known.activity_id === null) {
      if (known && b.status === "cancelled") await tx`update booked_meetings set status = 'cancelled', updated_at = now() where booking = ${b.booking}`;
      return null;
    }
    return change(tx, b, known);
  });
  if (received) await tell(received, b);
  return received;
}

async function change(tx: Query, b: BookingEvent, known: Meeting): Promise<BookingReceived | null> {
  if (known.status === "cancelled") return null;
  if (b.status === "confirmed" && b.moves <= known.moves) return null;
  const [a] = await tx<{ contact_id: string; name: string; owner: string | null }[]>`
    select a.contact_id::text as contact_id, c.name, c.owner from activities a join contacts c on c.id = a.contact_id where a.id = ${known.activity_id}`;
  await tx`update booked_meetings set status = ${b.status}, moves = ${Math.max(b.moves, known.moves)}, updated_at = now(),
    ${b.status === "confirmed" ? tx`starts_at = ${b.start}, ends_at = ${b.end}, host = ${b.host}` : tx`host = host`}
    where booking = ${b.booking}`;
  const [line] = await tx<{ data: Record<string, unknown> }[]>`select data from activities where id = ${known.activity_id}`;
  const data = b.status === "confirmed" ? lineData(b) : { ...line!.data, event: b.event, status: "cancelled", cancelledBy: b.cancelledBy };
  await tx`update activities set data = ${tx.json(data as never)} where id = ${known.activity_id}`;
  if (!a) return null;
  return { change: b.status === "cancelled" ? "cancelled" : "moved", contact: { id: a.contact_id, name: a.name, owner: a.owner }, created: false, maybe: null };
}

async function create(tx: Query, b: BookingEvent, hostOwns: boolean): Promise<BookingReceived> {
  const { found, maybe } = await match(tx, b);
  let contact: BookingReceived["contact"];
  let companyId: string | null;
  const from = { booking: b.booking };
  if (found) {
    companyId = found.company_id ? String(found.company_id) : await companyNamed(tx, b.company, "", b.at, from);
    await tx`
      update contacts set
        email = ${found.email === "" ? b.email : found.email},
        phone = ${found.phone === "" && found.phone2 === "" ? b.phone : found.phone},
        company_id = ${companyId},
        last_contact_at = greatest(coalesce(last_contact_at, ${b.at}), ${b.at}),
        updated_at = now()
      where id = ${found.id}`;
    contact = { id: String(found.id), name: found.name, owner: found.owner };
  } else {
    companyId = await companyNamed(tx, b.company, "", b.at, from);
    const name = b.name || b.email || b.phone;
    const owner = hostOwns ? b.host : null;
    const [row] = await tx<{ id: string }[]>`
      insert into contacts (name, email, phone, company_id, owner, created_by, last_contact_at, maybe_same, lead_since)
      values (${name}, ${b.email}, ${b.phone}, ${companyId}, ${owner}, 'chest', ${b.at}, ${maybe ? maybe.id : null}, ${owner ? null : new Date()})
      returning id`;
    await tx`insert into activities (kind, contact_id, company_id, author, data, at) values ('created', ${row!.id}, ${companyId}, 'chest', ${tx.json(from)}, ${b.at})`;
    contact = { id: String(row!.id), name, owner };
  }
  const [line] = await tx<{ id: string }[]>`
    insert into activities (kind, data, contact_id, company_id, author, at)
    values ('booking', ${tx.json(lineData(b) as never)}, ${contact.id}, ${companyId}, 'chest', ${b.at})
    returning id`;
  await tx`update booked_meetings set activity_id = ${line!.id}, updated_at = now() where booking = ${b.booking}`;
  return { change: b.status === "cancelled" ? "cancelled" : "new", contact, created: !found, maybe: maybe && !found ? { id: String(maybe.id), name: maybe.name } : null };
}

// typeName: the meeting's type in the reader's language.
export const typeName = (type: unknown, locale: Locale): string => (isObject(type) && typeof type[locale] === "string" ? String(type[locale]) : isObject(type) && typeof type["en"] === "string" ? String(type["en"]) : "");

// meetingTime: "Tue 6 Oct, 10:00" in the reader's language and the Chest's
// time zone.
export const meetingTime = (start: Date | string, locale: Locale): string =>
  formatDate(start, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: chest.timeZone });

// Who hears of it: the contact's owner, unless they are the host (Booking
// told them); a new contact of nobody's, the managers. One bell item per
// booking (its key hashed: a bell key is lower case), replaced as it moves.
export const bookingKey = (booking: string) => "booking:" + createHash("sha256").update(booking).digest("hex").slice(0, 40);
async function tell(received: BookingReceived, b: BookingEvent): Promise<void> {
  const owner = received.contact.owner?.startsWith("mbr_") ? received.contact.owner : null;
  const to = owner ? (owner === b.host ? [] : [owner]) : received.created ? await managers() : [];
  if (to.length === 0) return;
  await notify(to, (t: Catalogue, locale: Locale) => {
    const words = { name: received.contact.name, type: typeName(b.type, locale) || t.booking.meeting, when: meetingTime(b.start, locale) };
    const title = received.change === "cancelled" ? t.bell.bookingCancelled : received.created ? t.bell.bookingNew : received.change === "moved" ? t.bell.bookingMoved : t.bell.bookingKnown;
    const body = [received.maybe ? format(t.bell.formMaybe, { other: received.maybe.name }) : "", format(t.bell.bookingWhen, words)].filter(Boolean).join(" ");
    return { title: format(title, words), body: bounded(body, 280) };
  }, { path: `/chest/contacts/${received.contact.id}`, key: bookingKey(b.booking) });
}

// ——— My day ———

export type UpcomingMeeting = { booking: string; start: string; end: string; host: string | null; contact: { id: string; name: string }; type: Record<string, string>; path: string };

// upcoming: the meetings booked to come in the next days whose host is the
// member, or whose contact they own; the earliest first.
export async function upcoming(sql: Query, memberId: string, now = new Date(), days = 7, limit = 12): Promise<UpcomingMeeting[]> {
  const rows = await sql<{ booking: string; starts_at: Date; ends_at: Date; host: string | null; contact_id: string; name: string; data: Record<string, unknown> }[]>`
    select m.booking, m.starts_at, m.ends_at, m.host, c.id::text as contact_id, c.name, a.data
    from booked_meetings m
    join activities a on a.id = m.activity_id
    join contacts c on c.id = a.contact_id
    where m.status = 'confirmed' and m.activity_id is not null
      and m.ends_at > ${now} and m.starts_at < ${new Date(now.getTime() + days * day)}
      and (m.host = ${memberId} or c.owner = ${memberId})
    order by m.starts_at, m.booking
    limit ${limit}`;
  return rows.map(r => ({
    booking: r.booking, start: r.starts_at.toISOString(), end: r.ends_at.toISOString(), host: r.host,
    contact: { id: String(r.contact_id), name: r.name },
    type: isObject(r.data["type"]) ? Object.fromEntries(Object.entries(r.data["type"]).filter(([, v]) => typeof v === "string")) as Record<string, string> : {},
    path: typeof r.data["path"] === "string" ? r.data["path"] : "",
  }));
}

// bookingLink: the booking in Booking, made now from the addresses the
// Chest gives (chest.toolLink); null when Booking is not installed or the
// path is not one it would open — then the meeting shows without a link.
export const bookingLink = (path: unknown): string | null => (typeof path === "string" && path !== "" ? chest.tools.link("booking", path) : null);

// ——— When a member is erased ———

// forgetHost: the erased member's id leaves the meetings they hosted.
export async function forgetHost(tx: Query, memberId: string): Promise<void> {
  await tx`update booked_meetings set host = null where host = ${memberId}`;
  await tx`update activities set data = jsonb_set(data, '{host}', 'null') where kind = 'booking' and data->>'host' = ${memberId}`;
}
