// Proposal (studio): the Chest's own settings, which every tool needs and
// none should ask its admin for again — the company's name, its time zone,
// its currency and language, and the addresses the tool is served at. The
// Chest gives them to each tool in its environment (read at call time: a
// change by the owner reaches the tool at its next start):
//
//   CHEST_COMPANY     the company's name, as the owner wrote it ("Atelier Martin")
//   CHEST_TIMEZONE    an IANA zone ("Europe/Paris")
//   CHEST_CURRENCY    an ISO 4217 code ("EUR")
//   CHEST_LOCALE      the Chest's default language ("fr")
//   CHEST_TEAM_URL    the tool's team host ("https://tasks-chest.atelier-martin.fr")
//   CHEST_PUBLIC_URL  its public host, for a tool with a public part
//                     ("https://booking.atelier-martin.fr"); absent otherwise
//
// Before: every tool hard-coded Europe/Paris, derived its public address
// from X-Forwarded-Host (and remembered it in its database for emails sent
// by a schedule), and asked its admin for the company's name in its own
// settings.
import { localeOf, type Locale } from "./member.js";

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

// company is the company's name ("" when the Chest has none).
export function company(): string {
  const value = env("CHEST_COMPANY");
  return value && value.length <= 120 && !/[\u0000-\u001f]/u.test(value) ? value : "";
}

// timeZone is the Chest's time zone: the day of "due today", the hour of a
// reminder. Europe/Paris when the Chest says none, or one this runtime does
// not know.
export function timeZone(): string {
  const value = env("CHEST_TIMEZONE");
  if (value && value.length <= 64) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return value;
    } catch {
      // Not a zone this runtime knows: the default.
    }
  }
  return "Europe/Paris";
}

// today is the date ("YYYY-MM-DD") at that instant in the Chest's zone (or
// the one given).
export function today(at: Date | number = Date.now(), zone: string = timeZone()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(typeof at === "number" ? new Date(at) : at).map(p => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

// currency is the company's currency (ISO 4217), EUR by default.
export function currency(): string {
  const value = env("CHEST_CURRENCY");
  return value && /^[A-Z]{3}$/u.test(value) ? value : "EUR";
}

// locale is the Chest's default language: the language of what a tool
// writes for no one in particular (a public page before the visitor
// chooses, an export's default).
export function locale(): Locale {
  return localeOf(env("CHEST_LOCALE"));
}

const origin = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
};

// teamUrl is the origin of the tool's team host (links in an export, in a
// notification's email, in a calendar feed); null outside a Chest.
export function teamUrl(): string | null {
  return origin(env("CHEST_TEAM_URL"));
}

// publicUrl is the origin of the tool's public host (a customer's link in
// an email sent by a schedule, a feed's address); null for a tool without
// a public part, or outside a Chest.
export function publicUrl(): string | null {
  return origin(env("CHEST_PUBLIC_URL"));
}
