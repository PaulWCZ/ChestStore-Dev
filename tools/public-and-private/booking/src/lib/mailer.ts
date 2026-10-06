import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { meetingPlace, type Booking } from "./booking.ts";
import { calendar } from "./ics.ts";
import { catalogue, format, isLocale, meetingTime } from "../i18n/index.ts";
import { answerText } from "./questions.ts";
import { addDays, wall } from "./zone.ts";

// Email to guests through the Chest's mail (Proposal (studio): the "mail"
// capability, chest.proposals.json). On a Chest without mail yet, nothing
// is sent and the tool says so: the guest keeps their booking page's link,
// shown when they booked.
export type Delivery = "email" | "page";

type Context = { hostName: string; company: string; link: string; bookAgain: string };

// The guest's confirmation, a move and a cancellation are transactional
// (mail.send's studio.15 flag): the person must get them whatever email
// they chose in a Chest — a guest who is also a member of it included. A
// reminder and the host's own notice honour the member's choice (the host
// also has "Email me" in their settings).
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

// Whether the Chest would send email now (mail.available, studio.16),
// asked before a page promises one: "not_granted" (a Chest without mail),
// "not_connected" (the owner has not connected the company's email),
// "suspended", "quota" (the day's emails are used), "unknown" (the Chest
// did not answer: the pages promise nothing, and say nothing false).
export type MailState = "ready" | "not_granted" | "not_connected" | "suspended" | "quota" | "unknown";
export async function mailState(): Promise<MailState> {
  try {
    const state = await mail.available();
    return state.ok ? "ready" : state.reason ?? "suspended";
  } catch (error) {
    if (error instanceof ChestError) return "unknown";
    throw error;
  }
}

// Every key carries its recipient (studio.16): after a restore from a
// backup, a booking's id can name another guest's meeting.

function where(b: Booking, hostName: string, t: ReturnType<typeof wordsFor>["mail"]): string {
  if (b.locationKind === "phone") return format(t.wherePhone, { host: hostName, phone: b.guestPhone });
  const place = meetingPlace(b);
  if (place === "") return b.locationKind === "video" ? format(t.whereLater, { host: hostName }) : "";
  return format(t.where, { where: place });
}

// The calendar file of a booking, as the guest's calendar reads it. The
// sequence grows with each move, so calendars replace the old time.
export function invitation(b: Booking, c: Pick<Context, "hostName" | "link">, cancelled = false): string {
  const t = wordsFor(b.guestLanguage);
  return calendar(
    [
      {
        uid: b.uid,
        sequence: b.moves + (cancelled ? 1 : 0),
        start: b.startsAt,
        end: b.endsAt,
        summary: `${b.title} — ${c.hostName}`,
        description: `${c.link}`,
        ...(b.locationKind === "place" || b.locationKind === "video" ? (meetingPlace(b) ? { location: meetingPlace(b) } : {}) : {}),
        url: c.link,
        cancelled,
      },
    ],
    { method: cancelled ? "CANCEL" : "PUBLISH", name: t.tool.name },
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

// The guest's answers to the host's questions, as a block of the
// confirmation (nothing when there were none).
function answersBlock(b: Booking): string {
  if (b.answers.length === 0) return "";
  const words = wordsFor(b.guestLanguage);
  return `\n\n${words.mail.answersIntro}\n` + b.answers.map(a => `${a.label}: ${answerText(a, words.answers)}`).join("\n");
}

export async function confirmed(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = { ...values(b, c), answers: answersBlock(b) + (b.paymentLink && !b.paid ? "\n\n" + format(t.payLine, { link: b.paymentLink }) : "") };
  return send({ to: b.guestEmail, subject: format(t.confirmedSubject, v), text: format(t.confirmedBody, v), fromName: from(c), attachments: [attachment(b, c)], key: `booked:${b.id}:${b.guestEmail}`, transactional: true });
}

export async function moved(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = values(b, c);
  return send({ to: b.guestEmail, subject: format(t.movedSubject, v), text: format(t.movedBody, v), fromName: from(c), attachments: [attachment(b, c)], key: `moved:${b.id}:${b.moves}:${b.guestEmail}`, transactional: true });
}

export async function cancelled(b: Booking, c: Context): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = { ...values(b, c), link: c.bookAgain, reason: b.cancelReason ? format(t.reasonLine, { reason: b.cancelReason }) : "" };
  const body = b.cancelledBy === "host" ? t.cancelledByHost : t.cancelledByGuest;
  return send({ to: b.guestEmail, subject: format(t.cancelledSubject, v), text: format(body, v), fromName: from(c), attachments: [attachment(b, c, true)], key: `cancelled:${b.id}:${b.guestEmail}`, transactional: true });
}

export async function reminder(b: Booking, c: Context, now = Date.now()): Promise<Delivery> {
  const t = wordsFor(b.guestLanguage).mail;
  const v = values(b, c);
  // "Tomorrow" only when it is tomorrow in the guest's zone (a run missed
  // and sent again later may fall on the day itself).
  const today = wall(now, b.guestZone).date, day = wall(b.startsAt, b.guestZone).date;
  const subject = day === today ? t.reminderSubjectToday : day === addDays(today, 1) ? t.reminderSubject : t.reminderSubjectLater;
  return send({ to: b.guestEmail, subject: format(subject, v), text: format(t.reminderBody, v), fromName: from(c), key: `reminder:${b.id}:${b.moves}:${b.guestEmail}` });
}

// The host's copy: an email with the booking's calendar file, which their
// calendar app adds at once (the Chest's calendar feed is read by
// calendar apps hours later). In the host's language and time zone.
export async function toHost(kind: "booked" | "moved" | "cancelled", b: Booking, c: { locale: string; zone: string; link: string }): Promise<Delivery> {
  const words = wordsFor(c.locale);
  const t = words.mail;
  // A phone call is the host's to make: "Call Alex at +33…", never the
  // guest's sentence ("… will call you").
  const place = b.locationKind === "phone" ? format(t.hostWherePhone, { guest: b.guestName, phone: b.guestPhone }) : where(b, "", t);
  const v = { guest: b.guestName, title: b.title, when: meetingTime(b.startsAt, c.zone, c.locale), where: place, link: c.link };
  const subject = format(kind === "booked" ? t.hostBookedSubject : kind === "moved" ? t.hostMovedSubject : t.hostCancelledSubject, v);
  const file = calendar(
    [{ uid: b.uid, sequence: b.moves + (kind === "cancelled" ? 1 : 0), start: b.startsAt, end: b.endsAt, summary: format(words.calendar.title, { title: b.title, guest: b.guestName }), description: c.link, ...(meetingPlace(b) && b.locationKind !== "phone" ? { location: meetingPlace(b) } : {}), url: c.link, cancelled: kind === "cancelled" }],
    { method: kind === "cancelled" ? "CANCEL" : "PUBLISH", name: words.tool.name },
  );
  return send({ to: { member: b.memberId }, subject, text: format(t.hostBody, v), attachments: [{ name: t.fileName, type: "text/calendar; charset=utf-8", content: file }], key: `host:${kind}:${b.id}:${b.moves}:${b.memberId}` });
}
