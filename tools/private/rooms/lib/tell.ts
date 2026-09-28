import type { Member } from "@argentic/chest-sdk/member";
import type { CancelledDesk } from "./places.ts";
import { format, formatDay, formatSpan, type Catalogue, type Locale } from "./i18n/index.ts";
import { cut, notify } from "./notify.ts";
import type { RoomBooking } from "./room-bookings.ts";

// What Rooms tells people through the Chest's bell, each in their own
// language. The people invited to a room booking hear of it, of its
// changes and of its cancellation (one item per booking, replaced as it
// changes: key room:<id>, or series:<n> for a weekly one). Booking a desk
// for oneself is silent; a desk or room someone else cancels for you is
// not. No badge: nothing here waits for an answer (see README).

const when = (b: Pick<RoomBooking, "day" | "start" | "end">, locale: Locale) => formatDay(b.day, locale, { weekday: "short", day: "numeric", month: "short" }) + " " + formatSpan(b.start, b.end, locale);
const titleOf = (b: RoomBooking, t: Catalogue) => b.title || t.bell.meeting;
const pathOf = (b: RoomBooking) => `/chest/rooms?day=${b.day}&booking=${b.id}`;

export async function invited(actor: Member, people: string[], bookings: RoomBooking[]): Promise<void> {
  const first = bookings[0];
  const others = people.filter(p => p !== actor.id);
  if (!first || others.length === 0) return;
  if (bookings.length > 1 && first.series) {
    await notify(others, (t, locale) => ({
      title: format(t.bell.invitedWeekly, { name: actor.name, weekday: formatDay(first.day, locale, { weekday: "long" }), title: cut(titleOf(first, t), 40) }),
      body: format(t.bell.whereWeekly, { room: first.roomName, time: formatSpan(first.start, first.end, locale), count: bookings.length, date: formatDay(first.day, locale, { day: "numeric", month: "long" }) }),
    }), { path: pathOf(first), key: `series:${first.series}` });
    return;
  }
  for (const b of bookings) {
    await notify(others, (t, locale) => ({
      title: format(t.bell.invited, { name: actor.name, title: cut(titleOf(b, t), 40) }),
      body: format(t.bell.where, { room: b.roomName, when: when(b, locale) }),
    }), { path: pathOf(b), key: `room:${b.id}` });
  }
}

// A booking moved or changed: those still invited hear it; those added are
// invited; those removed hear it is cancelled for them.
export async function changed(actor: Member, before: RoomBooking, after: RoomBooking): Promise<void> {
  const added = after.attendees.filter(a => !before.attendees.includes(a));
  const removed = before.attendees.filter(a => !after.attendees.includes(a));
  const kept = after.attendees.filter(a => before.attendees.includes(a) && a !== actor.id);
  const moved = before.day !== after.day || before.start !== after.start || before.end !== after.end || before.roomId !== after.roomId || before.title !== after.title;
  if (moved && kept.length > 0) {
    await notify(kept, (t, locale) => ({ title: format(t.bell.changed, { title: cut(titleOf(after, t), 40) }), body: format(t.bell.where, { room: after.roomName, when: when(after, locale) }) }), { path: pathOf(after), key: `room:${after.id}` });
  }
  await invited(actor, added, [after]);
  if (removed.length > 0) await cancelled(actor, [{ ...before, attendees: removed }], "none");
}

// Bookings cancelled: their people hear it; the organiser too when someone
// else cancelled it (an admin, the room removed, the organiser left).
export type Why = "none" | "admin" | "left" | "room";
export async function cancelled(actor: Member | null, bookings: RoomBooking[], why: Why): Promise<void> {
  const bySeries = new Map<string, RoomBooking[]>();
  for (const b of bookings) {
    const key = b.series ? `series:${b.series}:${b.attendees.join(",")}` : `room:${b.id}`;
    bySeries.set(key, [...(bySeries.get(key) ?? []), b]);
  }
  for (const group of bySeries.values()) {
    const b = group[0]!;
    const attendees = b.attendees.filter(a => a !== actor?.id);
    const body = (t: Catalogue, locale: Locale) => {
      const w = when(b, locale) + (group.length > 1 ? ` (+${group.length - 1})` : "");
      if (why === "left") return format(t.bell.organiserLeft, { room: b.roomName, when: w });
      if (why === "room") return format(t.bell.roomRemoved, { room: b.roomName, when: w });
      return format(t.bell.where, { room: b.roomName, when: w });
    };
    const key = group.length > 1 && b.series ? `series:${b.series}` : `room:${b.id}`;
    if (attendees.length > 0) await notify(attendees, (t, locale) => ({ title: format(t.bell.cancelled, { title: cut(titleOf(b, t), 40) }), body: body(t, locale) }), { path: `/chest?day=${b.day}`, key });
    if (actor && b.memberId !== actor.id && b.memberId.startsWith("mbr_") && why !== "left") {
      await notify([b.memberId], (t, locale) => ({
        title: format(t.bell.yourRoomCancelled, { room: b.roomName }),
        body: why === "room" ? format(t.bell.roomRemoved, { room: b.roomName, when: when(b, locale) }) : format(t.bell.byAdmin, { when: when(b, locale), name: actor.name }),
      }), { path: `/chest?day=${b.day}`, key });
    }
  }
}

// Desks someone else freed for you (an admin, the desk given or removed).
export async function desksCancelled(actor: Member, desks: CancelledDesk[], why: "admin" | "given" | "removed"): Promise<void> {
  for (const d of desks) {
    if (d.memberId === actor.id || !d.memberId.startsWith("mbr_")) continue;
    await notify([d.memberId], (t, locale) => {
      const w = formatDay(d.day, locale, { weekday: "long", day: "numeric", month: "long" });
      return {
        title: format(t.bell.yourDeskCancelled, { desk: d.deskName }),
        body: why === "given" ? format(t.bell.deskGiven, { when: w }) : why === "removed" ? format(t.bell.deskRemoved, { when: w }) : format(t.bell.byAdmin, { when: w, name: actor.name }),
      };
    }, { path: `/chest?day=${d.day}`, key: `desk:${d.id}` });
  }
}
