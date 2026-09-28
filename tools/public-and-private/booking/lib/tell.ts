import type { Booking } from "./booking.ts";
import { format, meetingTime } from "./i18n/index.ts";
import { cut, notify, withdraw } from "./notify.ts";
import { answerText } from "./questions.ts";

// The bell for hosts, in their language and time zone: a booking made,
// moved or cancelled by a guest. Keyed by the booking, so the latest news
// replaces the earlier one.
const path = (b: Pick<Booking, "id">) => `/chest/bookings/${b.id}`;

export async function booked(b: Booking, hostZone: string): Promise<void> {
  // The body: the type, the guest's note and their answers, as far as the
  // bell shows; the booking's page has everything.
  await notify([b.memberId], (t, locale) => ({
    title: format(t.bell.booked, { guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }),
    body: cut([b.title, b.guestNote, ...b.answers.map(a => `${a.label}: ${answerText(a, t.answers)}`)].filter(x => x !== "").join(" — "), 280),
  }), { path: path(b), key: `booking:${b.id}` });
}

export async function moved(b: Booking, hostZone: string): Promise<void> {
  await notify([b.memberId], (t, locale) => ({ title: format(t.bell.moved, { guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }), body: cut(b.title, 280) }), { path: path(b), key: `booking:${b.id}` });
}

export async function cancelled(b: Booking, hostZone: string): Promise<void> {
  await notify([b.memberId], (t, locale) => ({ title: format(t.bell.cancelled, { guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }), body: cut(b.cancelReason || b.title, 280) }), { path: path(b), key: `booking:${b.id}` });
}

// A host who cancels needs no bell of their own.
export async function quiet(b: Pick<Booking, "id">): Promise<void> {
  await withdraw(`booking:${b.id}`);
}
