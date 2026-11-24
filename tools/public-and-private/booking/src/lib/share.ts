import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { ownBusy, titlesOf, type Booking } from "./booking.ts";
import { busyData, busyFingerprint, busySnapshot, readBusy } from "./busy-snapshot.ts";
import type { Query, Sql } from "./db.ts";

// What Booking tells the other tools of the Chest, and what it hears from
// them (SDK 0.7.0 events between tools: chest.json "emits", each type with
// the schema of its data, and "receives"; README "With the other tools").
// Each goes only where the owner approved the link — the Chest's decision,
// never the tool's. A courtesy: when the Chest cannot take an event, the
// booking stands and nothing is said.
//
// booking.busy       a host's busy times (times only), for Hiring: its
//                    candidates never pick a time the host already gave
// booking.confirmed  a booking made or moved, for Clients (the CRM): who
//                    booked (name, email, phone), which type, when
// booking.cancelled  a booking cancelled, for Clients
//
// Heard: hiring.busy — the interviews a member is on — and leave.busy —
// the days a member is off (approved leave in Leave): times only, never
// offered here.

const day = 86_400_000;

// An event's key and subject are identifiers of the tool's own (letters,
// digits, ". _ : -", 128 at most): a guest's address goes in as a short
// hash (after a restore from a backup, a booking's id can name another
// guest's meeting: the key tells them apart).
export const guestTag = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);

async function emit(type: string, data: Record<string, unknown>, options: events.EmitOptions): Promise<boolean> {
  try {
    await events.emit(type, data, options);
    return true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return false;
  }
}

// ——— booking.busy ———

// shareBusy tells the other tools the busy times of some hosts, when they
// changed since last told (a new booking, a time blocked, a calendar read;
// the window moves on each day). Says how many were told. Stops at the
// first refusal of the Chest (no events here, or not granted).
export async function shareBusy(sql: Query, memberIds: string[], now = Date.now()): Promise<number> {
  const ids = [...new Set(memberIds.filter(m => /^mbr_[a-z2-7]{26}$/u.test(m)))];
  if (ids.length === 0) return 0;
  const hosts = await sql<{ member_id: string; hash: string | null }[]>`
    select h.member_id, s.hash from hosts h left join shared_busy s on s.member_id = h.member_id where h.member_id in ${sql(ids)}`;
  let told = 0;
  for (const h of hosts) {
    const from = Math.floor(now / day) * day;
    const spans = await ownBusy(sql, h.member_id, new Date(from), new Date(from + 90 * day));
    const snapshot = busySnapshot(h.member_id, spans, now);
    const hash = createHash("sha256").update(busyFingerprint(snapshot)).digest("hex");
    if (hash === h.hash) continue;
    // The key names the time and the content: a retry is one event, two
    // different snapshots never are.
    if (!(await emit("booking.busy", busyData(snapshot), { subject: h.member_id, key: `busy:${h.member_id}:${now}:${hash.slice(0, 8)}` }))) return told;
    await sql`insert into shared_busy (member_id, hash, told_at) values (${h.member_id}, ${hash}, ${new Date(now)})
      on conflict (member_id) do update set hash = excluded.hash, told_at = excluded.told_at`;
    told++;
  }
  return told;
}

// shareAllBusy: every host (the calendars schedule, every 15 minutes: what
// their other calendars said, and the window of each new day).
export async function shareAllBusy(sql: Query, now = Date.now()): Promise<number> {
  const rows = await sql<{ member_id: string }[]>`select member_id from hosts order by member_id limit 2000`;
  return shareBusy(sql, rows.map(r => r.member_id), now);
}

// ——— booking.confirmed, booking.cancelled ———

// The booking as Clients reads it (version 1), flat as the schema of
// chest.json "emits" declares it (booking.confirmed, booking.cancelled).
// The contact is the guest as they gave themselves — not a member: their
// name and address are text; the form asks no company. The type's name in
// every language of the store (typeName English, typeNameFr French). Never
// the guest's note, their answers or their link: those stay in Booking
// (path opens the booking for a member who may see it).
// at is when that happened, as recorded — made, last moved, cancelled —
// never the time of telling: a retry of the same key carries the same
// data, so the Chest takes it as the same event (a key reused for other
// data is refused: key_reused).
export async function bookingData(sql: Query, b: Booking, status: "confirmed" | "cancelled"): Promise<Record<string, unknown>> {
  const at = status === "cancelled" ? (b.cancelledAt ?? b.movedAt ?? b.createdAt) : b.moves > 0 ? (b.movedAt ?? b.createdAt) : b.createdAt;
  const names = await titlesOf(sql, b);
  return {
    v: 1,
    booking: b.id,
    status,
    at: at.toISOString(),
    host: b.memberId === "erased" ? null : b.memberId,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    type: b.typeId,
    typeName: names.en,
    typeNameFr: names.fr,
    kind: b.locationKind,
    contactName: b.guestName,
    contactEmail: b.guestEmail,
    contactPhone: b.guestPhone || null,
    contactLanguage: b.guestLanguage,
    source: b.source,
    moves: b.moves,
    ...(status === "cancelled" ? { cancelledBy: b.cancelledBy } : {}),
    path: `/chest/bookings/${b.id}`,
  };
}

// Who in Booking may see a booking: its host and the administrators (who
// see everyone's). A receiver shows it to them only (SDK 0.7.0 audience).
export const bookingAudience = (b: Pick<Booking, "memberId">): events.EmitAudience =>
  b.memberId === "erased" ? { roles: ["admin"] } : { members: [b.memberId], roles: ["admin"] };

// changed: a booking was made, moved or cancelled — Clients hears of it,
// and the busy times of its host (and of the one it left, a team type
// moved to another host) are told again. Says whether the Chest took the
// booking's event (told again, the same one: taken as the same event).
export async function changed(sql: Query, kind: "booked" | "moved" | "cancelled", b: Booking, options: { previousHost?: string; now?: number } = {}): Promise<boolean> {
  const now = options.now ?? Date.now();
  const base = `booking:${b.id}:${guestTag(b.guestEmail)}`;
  const common = { subject: `booking:${b.id}`, audience: bookingAudience(b) };
  const taken = kind === "cancelled"
    ? await emit("booking.cancelled", await bookingData(sql, b, "cancelled"), { ...common, key: `${base}:cancelled` })
    : await emit("booking.confirmed", await bookingData(sql, b, "confirmed"), { ...common, key: `${base}:confirmed:${b.moves}` });
  await shareBusy(sql, [b.memberId, ...(options.previousHost ? [options.previousHost] : [])], now);
  return taken;
}

// ——— What other tools tell Booking ———

// takeBusy keeps a member's busy times as another tool told them
// (hiring.busy, leave.busy): the snapshot replaces that tool's earlier one, unless it
// is older than the one kept. Says whether it was kept. The event's
// audience (who in the teller may see it) is kept with it: the agenda's
// grey rows show it only to them; the times are never offered either way
// (a visitor learns only that a time is not free).
export async function takeBusy(sql: Sql, event: events.ToolEvent): Promise<boolean> {
  const source = event.source;
  if (typeof source !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(source) || source.length > 63 || source === "booking") return false;
  const s = readBusy(event.data);
  if (!s) return false;
  const audience = event.audience === "all" ? null : sql.json([...new Set(event.audience)].filter(m => /^mbr_[a-z2-7]{26}$/u.test(m)) as never);
  return sql.begin(async tx => {
    const [kept] = await tx<{ member_id: string }[]>`
      insert into told_busy (source, member_id, taken_at, period, audience) values (${source}, ${s.member}, ${s.at}, tstzrange(${s.from}, ${s.to}), ${audience})
      on conflict (source, member_id) do update set taken_at = excluded.taken_at, period = excluded.period, audience = excluded.audience
      where told_busy.taken_at < excluded.taken_at
      returning member_id`;
    if (!kept) return false;
    await tx`delete from told_spans where source = ${source} and member_id = ${s.member}`;
    for (let i = 0; i < s.spans.length; i += 500) {
      const part = s.spans.slice(i, i + 500).map(x => ({ source, member_id: s.member, span: `[${new Date(x.start).toISOString()},${new Date(x.end).toISOString()})` }));
      await tx`insert into told_spans ${tx(part, "source", "member_id", "span")}`;
    }
    return true;
  });
}

// A member who leaves or is erased: what other tools told of them, and
// what Booking last told, are forgotten.
export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`delete from told_busy where member_id = ${memberId}`;
  await sql`delete from shared_busy where member_id = ${memberId}`;
}
