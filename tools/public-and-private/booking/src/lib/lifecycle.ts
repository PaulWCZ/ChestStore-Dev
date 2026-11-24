import * as events from "@argentic/chest-sdk/events";
import { bookingsByIds, settings, type Booking } from "./booking.ts";
import type { Sql } from "./db.ts";
import { catalogue, isLocale } from "../i18n/index.ts";
import * as mailer from "./mailer.ts";
import { unpublish } from "./publish.ts";
import * as live from "./live.ts";
import { changed, forget } from "./share.ts";

// What Booking does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: their page takes no new booking (it says so
//   to visitors); the bookings already made stay, for them or an
//   administrator to keep or cancel. Given access again, their page comes
//   back the next time they open the tool.
// - Erasure: their page, types and hours are deleted; their future
//   meetings are cancelled and each guest is told (the host cannot meet
//   them); past bookings stay for the company, their host written
//   "Former member". Then the erasure is acknowledged.
// Their other calendars' secret addresses are theirs, not the company's:
// forgotten when they go (they paste them again if they come back), as
// what other tools told of their busy times.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql`update hosts set away = true where member_id = ${memberId}`;
  await sql`delete from calendars where member_id = ${memberId}`;
  await forget(sql, memberId);
  // They follow no agenda live any more (lib/live.ts).
  await live.forget(sql, memberId);
}

export async function erase(sql: Sql, memberId: string, now = Date.now()): Promise<Booking[]> {
  const cancelled = await sql.begin(async tx => {
    const rows = await tx<{ id: string }[]>`
      update bookings set status = 'cancelled', cancelled_by = 'host', cancelled_at = now()
      where member_id = ${memberId} and status = 'confirmed' and starts_at > ${new Date(now)} returning id`;
    await tx`update bookings set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update bookings set booked_by = null where booked_by = ${memberId}`;
    await tx`delete from hosts where member_id = ${memberId}`;
    // Their id goes from who follows agendas live, as reader and as host.
    await live.forget(tx, memberId, { asHost: true });
    return rows.map(r => String(r.id));
  });
  await forget(sql, memberId);
  return bookingsByIds(sql, cancelled);
}

async function tellGuests(sql: Sql, list: Booking[]): Promise<void> {
  for (const b of list) await unpublish(sql, b);
  // Clients hears each meeting was called off (lib/share.ts).
  for (const b of list) await changed(sql, "cancelled", b);
  const s = await settings(sql);
  const again = `${s.publicOrigin ?? ""}/`;
  for (const b of list) {
    const t = catalogue(isLocale(b.guestLanguage) ? b.guestLanguage : "en");
    await mailer.cancelled(b, { hostName: s.companyName || t.mail.team, company: s.companyName, link: again, bookAgain: again });
  }
}

export function handlers(sql: Sql): events.Handlers<"member.updated" | "access.revoked" | "member.removed" | "member.erased"> {
  return {
    // Their role changed (an administrator no longer, say): the agendas
    // they follow live are checked again (lib/live.ts).
    "member.updated": async event => { if (event.data.changed.includes("role")) await live.forget(sql, event.data.id); },
    "access.revoked": event => leave(sql, event.data.id),
    "member.removed": event => leave(sql, event.data.id),
    "member.erased": async event => {
      await tellGuests(sql, await erase(sql, event.data.id));
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of the events already handled, kept in the database.
export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}
