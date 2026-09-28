import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Booking } from "./booking.ts";
import { calendar } from "./ics.ts";
import { catalogue, format, isLocale, meetingTime } from "./i18n/index.ts";

// Email to guests through the Chest's mail (Proposal (studio): the "mail"
// capability, chest.proposals.json). On a Chest without mail yet, nothing
// is sent and the tool says so: the guest keeps their booking page's link,
// shown when they booked.
export type Delivery = "email" | "page";

type Context = { hostName: string; company: string; link: string; bookAgain: string };

const wordsFor = (language: string) => catalogue(isLocale(language) ? language : "en");

async function send(message: mail.Message): Promise<Delivery> {
  try {
    await mail.send(message);
    return "email";
  } catch (error) {
    if (error instanceof ChestError) return "page";
    throw error;
  }
}

function where(b: Booking, hostName: string, t: ReturnType<typeof wordsFor>["mail"]): string {
  if (b.locationKind === "phone") return format(t.wherePhone, { host: hostName, phone: b.guestPhone });
  if (b.location === "") return b.locationKind === "video" ? format(t.whereLater, { host: hostName }) : "";
  return format(t.where, { where: b.location });
}

// The calendar file of a booking, as the guest's calendar reads it. The
// sequence grows with each move, so calendars replace the old time.
export function invitation(b: Booking, c: Pick<Context, "hostName" | "link">, cancelled = false): string {
  const t = wordsFor(b.guestLanguage);
  return calendar(
    [
      {
        uid: `booking-${b.id}@chest`,
        sequence: b.moves + (cancelled ? 1 : 0),
        start: b.startsAt,
        end: b.endsAt,
        summary: `${b.title} — ${c.hostName}`,
        description: `${c.link}`,
        ...(b.locationKind === "place" || b.locationKind === "video" ? (b.location ? { location: b.location } : {}) : {}),
        url: c.link,
        cancelled,
      },
    ],
    { method: cancelled ? "CANCEL" : "PUBLISH", name: t.meta.name },
  );
}

function values(b: Booking, c: Context) {
  const t = wordsFor(b.guestLanguage).mail;
  return {
    name: b.guestName || t.there,
    title: b.title,
    host: c.hostName,
    when: meetingTime(b.startsAt, b.guestZone, b.guestLanguage),
    where: where(b, c.hostName, t),
    link: c.link,
    company: c.company || t.team,
  };
}

const attachment = (b: Booking, c: Context, cancelled = false): mail.Attachment => ({ name: wordsFor(b.guestLanguage).mail.fileName, type: "text/calendar; charset=utf-8", content: invitation(b, c, cancelled) });
const from = (c: Context) => (c.company ? `${c.hostName} — ${c.company}` : c.hostName);

export async function confirmed(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = values(b, c);
  return send({ to: b.guestEmail, subject: format(t.confirmedSubject, v), text: format(t.confirmedBody, v), fromName: from(c), attachments: [attachment(b, c)], key: `booked:${b.id}` });
}

export async function moved(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = values(b, c);
  return send({ to: b.guestEmail, subject: format(t.movedSubject, v), text: format(t.movedBody, v), fromName: from(c), attachments: [attachment(b, c)], key: `moved:${b.id}:${b.moves}` });
}

export async function cancelled(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = { ...values(b, c), link: c.bookAgain, reason: b.cancelReason ? format(t.reasonLine, { reason: b.cancelReason }) : "" };
  const body = b.cancelledBy === "host" ? t.cancelledByHost : t.cancelledByGuest;
  return send({ to: b.guestEmail, subject: format(t.cancelledSubject, v), text: format(body, v), fromName: from(c), attachments: [attachment(b, c, true)], key: `cancelled:${b.id}` });
}

export async function reminder(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = values(b, c);
  return send({ to: b.guestEmail, subject: format(t.reminderSubject, v), text: format(t.reminderBody, v), fromName: from(c), key: `reminder:${b.id}:${b.moves}` });
}
