import type { Booking } from "./booking.ts";
import { format, meetingTime, type Locale } from "../i18n/index.ts";
import { cut, notify, withdraw } from "./notify.ts";
import { answerText } from "./questions.ts";

// The bell for hosts, in their time zone: a booking made, moved or
// cancelled by a guest (English and French in one notice: the Chest shows
// each host theirs, and mails it to them by their own choice). Keyed by the booking, so the latest news
// replaces the earlier one. titles: the type's name in each language
// (booking.titlesOf) — a host reads one type under one name, whatever
// language the guest booked in.
const path = (b: Pick<Booking, "id">) => `/chest/bookings/${b.id}`;
type Titles = Partial<Record<Locale, string>>;

export async function booked(b: Booking, hostZone: string, titles: Titles = {}): Promise<void> {
  // The body: the type, the guest's note and their answers, as far as the
  // bell shows; the booking's page has everything.
  await notify([b.memberId], (t, locale) => ({
    title: format(t.bell.booked, { guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }),
    body: cut([titles[locale] ?? b.title, b.guestNote, ...b.answers.map(a => `${a.label}: ${answerText(a, t.answers)}`)].filter(x => x !== "").join(" — "), 280),
  }), { path: path(b), key: `booking:${b.id}` });
}

export async function moved(b: Booking, hostZone: string, titles: Titles = {}): Promise<void> {
  await notify([b.memberId], (t, locale) => ({ title: format(t.bell.moved, { guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }), body: cut(titles[locale] ?? b.title, 280) }), { path: path(b), key: `booking:${b.id}` });
}

export async function cancelled(b: Booking, hostZone: string, titles: Titles = {}): Promise<void> {
  await notify([b.memberId], (t, locale) => ({ title: format(t.bell.cancelled, { guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }), body: cut(b.cancelReason || (titles[locale] ?? b.title), 280) }), { path: path(b), key: `booking:${b.id}` });
}

// A colleague (who may manage every booking) moved or cancelled a host's
// booking: the host hears of it, with who did it. The guest is emailed by
// the caller, as for the host's own changes.
export async function changedFor(kind: "moved" | "cancelled", b: Booking, by: string, hostZone: string, titles: Titles = {}): Promise<void> {
  await notify([b.memberId], (t, locale) => ({
    title: format(kind === "moved" ? t.bell.movedFor : t.bell.cancelledFor, { member: cut(by, 40), guest: cut(b.guestName, 40), when: meetingTime(b.startsAt, hostZone, locale) }),
    body: cut(kind === "cancelled" && b.cancelReason ? b.cancelReason : (titles[locale] ?? b.title), 280),
  }), { path: path(b), key: `booking:${b.id}` });
}

// A host who cancels needs no bell of their own.
export async function quiet(b: Pick<Booking, "id">): Promise<void> {
  await withdraw(`booking:${b.id}`);
}
