import { log } from "@argentic/chest-app";
import * as calendar from "@argentic/chest-sdk/calendar";
import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Sql } from "./db.ts";
import { catalogue, format, formatDay, formatTime, localeOf } from "../i18n/index.ts";
import { people } from "./people.ts";
import { instantOf } from "./wall-clock.ts";
import { teamOrigin } from "./zone.ts";

// A visitor's invitation by email (Proposal (studio): "mail": {"send":
// true} — mail to people OUTSIDE the company, through the company's own
// mail provider connected to the Chest; not built yet). A visitor is not
// a member: whoever announces them may give their address, and they get
// the time, the office's address and a calendar file, in the language of
// whoever announced them; a cancellation tells them too (and takes the
// visit out of their calendar).
//
// Members never get a mail from Rooms: the host hears of their visitor in
// the bell (lib/tell.ts), which the Chest mails them by their own choice.
//
// Replies: Rooms sets no Reply-To of its own, so the Chest's connector
// puts the company's reply address (the owner's choice, said on the form
// when the Chest gives it): a visitor's answer lands in the company's
// usual inbox. The Chest receives no mail; Rooms reads none.
//
// No silent loss: when the Chest cannot send (no mail, not connected,
// paused, the day's emails spent, the address refused), the visit stands,
// the announcer is told "the invitation could not be sent" and the
// visitor's row says it; the address is then not kept.

export type Reach = { ok: boolean; replyTo: string | null };

// Whether an invitation would go now, and where replies land — for the
// form. A Chest that does not answer: not promised.
export async function reach(): Promise<Reach> {
  try {
    const a = await mail.available();
    return { ok: a.ok, replyTo: a.replyTo };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { ok: false, replyTo: null };
  }
}

type Row = { id: string; email: string | null; language: string; name: string; day: string; at_minute: number; host: string; mail_sequence: number; office: string | null; address: string | null };

// send writes the invitation ("invite") or the cancellation ("cancel") of
// one visit to its visitor, when an address is kept. Answers what became
// of it: "sent" (the Chest took it), "not_sent", or null when there is
// nobody to write to. Each message has its own key (the visit and its
// sequence): a retry of the same never sends twice, an invitation after a
// cancellation is a new message.
export async function send(sql: Sql, visitId: string, kind: "invite" | "cancel", zone: string): Promise<"sent" | "not_sent" | null> {
  const [v] = await sql<Row[]>`
    update visits set mail_sequence = mail_sequence + 1 where id = ${visitId} and email is not null
    returning id, email, language, name, to_char(day, 'YYYY-MM-DD') as day, at_minute, host, mail_sequence,
      (select o.name from offices o where o.id = visits.office_id) as office, (select o.address from offices o where o.id = visits.office_id) as address`;
  if (!v || !v.email) return null;
  const hostPerson = v.host.startsWith("mbr_") ? (await people([v.host])).get(v.host) : undefined;
  const host = hostPerson && hostPerson.status === "member" ? hostPerson.name : null;
  const origin = teamOrigin();
  const message = compose(v, kind, { company: chest.organization.name, host, zone, domain: origin ? new URL(origin).hostname : "rooms.invalid" });
  try {
    await mail.send(message);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    // Logged without the address: the visit, the kind and the Chest's code.
    log.warn("a visitor's email was not sent", { visit: v.id, kind, code: error.code });
    if (kind === "invite") await sql`update visits set invitation = 'not_sent', email = null where id = ${v.id}`;
    return "not_sent";
  }
  if (kind === "invite") await sql`update visits set invitation = 'sent' where id = ${v.id}`;
  return "sent";
}

// compose writes one message to a visitor: an invitation or its
// cancellation, in the language of the visit, with the visit as a
// calendar file (the same UID each time, its SEQUENCE growing). Pure.
export function compose(v: Pick<Row, "id" | "email" | "language" | "name" | "day" | "at_minute" | "mail_sequence" | "office" | "address">, kind: "invite" | "cancel", context: { company: string; host: string | null; zone: string; domain: string }): mail.Message {
  const locale = localeOf(v.language);
  const t = catalogue(locale);
  const w = t.mail;
  const { company, host } = context;
  const when = format(t.bell.visitWhen, { day: formatDay(v.day, locale, { weekday: "long", day: "numeric", month: "long" }), time: formatTime(Number(v.at_minute), locale) });
  const place = [v.office, v.address].filter(p => p && p.trim()).join(", ");
  const start = instantOf(v.day, Number(v.at_minute), context.zone);
  const ics = calendar.ics([{
    uid: calendar.uidOf("rooms", `visit:${v.id}`, context.domain),
    stamp: new Date(),
    sequence: Number(v.mail_sequence),
    title: format(w.event, { company }).slice(0, 120),
    ...(host ? { description: format(w.eventHost, { host }) } : {}),
    ...(place ? { location: place.slice(0, 200) } : {}),
    busy: true,
    // A visit has a time, not an end: an hour, as a calendar needs one.
    start,
    end: new Date(start.getTime() + 3600_000),
    ...(kind === "cancel" ? { cancelled: true } : {}),
  }], { method: kind === "cancel" ? "CANCEL" : "PUBLISH" });
  const lines = kind === "invite"
    ? [
        format(w.hello, { name: v.name }), "",
        host ? format(w.expects, { host, company, when }) : format(w.expectsNoHost, { company, when }),
        ...(place ? [format(w.address, { place })] : []), "",
        host ? format(w.reception, { host }) : w.receptionNoHost,
        w.ics, "",
        w.replyChange,
      ]
    : [format(w.hello, { name: v.name }), "", format(w.cancelled, { company, when }), w.icsCancel, "", w.replyQuestion];
  return {
    to: v.email!,
    subject: format(kind === "invite" ? w.subject : w.cancelSubject, { company, when }),
    text: lines.join("\n"),
    fromName: (host ? format(w.fromName, { host, company }) : company).slice(0, 100),
    attachments: [{ name: `${w.file}.ics`, type: "text/calendar", content: ics }],
    key: `visit:${v.id}:${v.mail_sequence}`,
  };
}
