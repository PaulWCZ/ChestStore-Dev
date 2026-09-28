import { hostOf, settings, rememberDelivery, type Booking } from "./booking.ts";
import type { Query } from "./db.ts";
import { catalogue, isLocale } from "./i18n/index.ts";
import * as mailer from "./mailer.ts";
import { nameOf, people } from "./people.ts";

// What an email to a guest needs around the booking: the host's name (from
// the Chest, never stored), the company, the guest's link, where to book
// again. origin: the public host's address (from the request, or the one
// remembered when there is none — a scheduled run).
export async function contextOf(sql: Query, b: Booking, origin: string | null) {
  const s = await settings(sql);
  const base = origin ?? s.publicOrigin ?? "";
  const language = isLocale(b.guestLanguage) ? b.guestLanguage : "en";
  const host = await hostOf(sql, b.memberId);
  const person = (await people([b.memberId])).get(b.memberId);
  const hostName = person && person.status === "member" ? person.name : s.companyName || catalogue(language).mail.team;
  return { hostName: hostName || nameOf(person, language), company: s.companyName, link: `${base}/b/${b.secret}`, bookAgain: `${base}/${host && !host.away ? host.slug : ""}` };
}

// Send one of the guest's emails, and remember whether email works here.
export async function email(sql: Query, kind: "confirmed" | "moved" | "cancelled" | "reminder", b: Booking, origin: string | null): Promise<mailer.Delivery> {
  const delivery = await mailer[kind](b, await contextOf(sql, b, origin));
  await rememberDelivery(sql, delivery);
  return delivery;
}
