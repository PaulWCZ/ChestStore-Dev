import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { ownBusy, titlesOf, type Booking } from "./booking.ts";
import { busyFingerprint, busySnapshot, readBusy } from "./busy-snapshot.ts";
import type { Query, Sql } from "./db.ts";

// What Booking tells the other tools of the Chest, and what it hears from
// them (Proposal (studio): events between tools, chest.proposals.json
// "emits" and "receives"; README "With the other tools"). Each goes only
// where an admin of the Chest linked the two tools — the Chest's decision,
// never the tool's. A courtesy: when the Chest cannot take an event, the
// booking stands and nothing is said.
//
// booking.busy       a host's busy times (times only), for Hiring: its
//                    candidates never pick a time the host already gave
// booking.confirmed  a booking made or moved, for Clients (the CRM): who
//                    booked (name, email, phone), which type, when
// booking.cancelled  a booking cancelled, for Clients
//
// Heard: hiring.busy — the interviews a member is on (times only): not
// offered here.

const day = 86_400_000;

async function publish(type: string, data: Record<string, unknown>, key: string): Promise<boolean> {
  try {
    await events.publish(type, data, { key });
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
// first refusal of the Chest (no events here, or its hourly quota).
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
    if (!(await publish("booking.busy", snapshot, `busy:${h.member_id}:${now}:${hash.slice(0, 8)}`))) return told;
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

// The booking as Clients reads it (version 1). The contact is the guest as
// they gave themselves; company is null (the form does not ask it). The
// type's name in every language of the store. Never the guest's note, their
// answers or their link: those stay in Booking (path opens the booking for
// a member who may see it, through chest.toolLink("booking", path)).
async function bookingData(sql: Query, b: Booking, status: "confirmed" | "cancelled", now: number): Promise<Record<string, unknown>> {
  return {
    v: 1,
    booking: b.id,
    status,
    at: new Date(now).toISOString(),
    host: b.memberId === "erased" ? null : b.memberId,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    type: { id: b.typeId, name: await titlesOf(sql, b) },
    kind: b.locationKind,
    contact: { name: b.guestName, email: b.guestEmail, phone: b.guestPhone || null, company: null, language: b.guestLanguage },
    source: b.source,
    moves: b.moves,
    ...(status === "cancelled" ? { cancelledBy: b.cancelledBy } : {}),
    path: `/chest/bookings/${b.id}`,
  };
}

// changed: a booking was made, moved or cancelled — Clients hears of it,
// and the busy times of its host (and of the one it left, a team type
// moved to another host) are told again.
export async function changed(sql: Query, kind: "booked" | "moved" | "cancelled", b: Booking, options: { previousHost?: string; now?: number } = {}): Promise<void> {
  const now = options.now ?? Date.now();
  if (kind === "cancelled") await publish("booking.cancelled", await bookingData(sql, b, "cancelled", now), `booking:${b.id}:cancelled`);
  else await publish("booking.confirmed", await bookingData(sql, b, "confirmed", now), `booking:${b.id}:confirmed:${b.moves}`);
  await shareBusy(sql, [b.memberId, ...(options.previousHost ? [options.previousHost] : [])], now);
}

// ——— What other tools tell Booking ———

// takeBusy keeps a member's busy times as another tool told them
// (hiring.busy): the snapshot replaces that tool's earlier one, unless it
// is older than the one kept. Says whether it was kept.
export async function takeBusy(sql: Sql, event: events.ToolEvent): Promise<boolean> {
  const source = event.source;
  if (typeof source !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(source) || source.length > 63 || source === "booking") return false;
  const s = readBusy(event.data);
  if (!s) return false;
  return sql.begin(async tx => {
    const [kept] = await tx<{ member_id: string }[]>`
      insert into told_busy (source, member_id, taken_at, period) values (${source}, ${s.member}, ${s.at}, tstzrange(${s.from}, ${s.to}))
      on conflict (source, member_id) do update set taken_at = excluded.taken_at, period = excluded.period
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
