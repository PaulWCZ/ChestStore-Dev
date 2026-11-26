import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { isZone } from "./zone.ts";

// What an editor sets for the public page: the company's website ("Back
// to atelier-martin.fr") and where customers reach support, the sites
// allowed to show the status widget in a frame, and the page's time zone.
// Kept in the settings table; every value is checked here, never trusted
// from a form.
//
// The time zone: the page's times (incidents, maintenance windows, the
// history's days, the feeds, the emails, the API's `time_zone`) are written
// in it; each visitor's browser then shows them on its own clock. null is
// the company's zone (chest.timeZone, captured once by the Chest, set on
// no screen): a company whose customers live elsewhere, or whose services
// run in another zone, chooses one here (SDK 0.7.0: the zone is the tool's
// business). It never changes the Chest's.

export type PageSettings = { website: string | null; support: string | null; embedSites: string[]; timeZone: string | null };

const empty: PageSettings = { website: null, support: null, embedSites: [], timeZone: null };

// A time zone this runtime knows by its IANA name ("Europe/Paris"), or
// null (the company's).
export function pageTimeZone(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !isZone(value) || !zoneNames().includes(value)) throw new AppError("invalid");
  return value;
}
let names: string[] | null = null;
export function zoneNames(): string[] {
  names ??= [...Intl.supportedValuesOf("timeZone"), ...(Intl.supportedValuesOf("timeZone").includes("UTC") ? [] : ["UTC"])];
  return names;
}

// pageZone is the zone the page's times are written in.
export async function pageZone(sql: Query): Promise<string> {
  return (await pageSettings(sql)).timeZone ?? chest.timeZone;
}
export const maxEmbedSites = 10;

// A web address customers may be sent to: https only (http on localhost,
// for a harness), no credentials, 300 characters at most.
export function webAddress(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AppError("invalid_url");
  const text = value.trim();
  if (text === "") return null;
  if (text.length > 300) throw new AppError("invalid_url");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("invalid_url");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!(url.protocol === "https:" || (url.protocol === "http:" && local)) || url.username || url.password || !url.hostname.includes(".") && !local) throw new AppError("invalid_url");
  return url.href;
}

// Support: a web address, or an email address (mailto:).
export function supportAddress(value: unknown): string | null {
  if (typeof value === "string" && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/iu.test(value.trim())) return "mailto:" + value.trim();
  if (typeof value === "string" && value.trim().toLowerCase().startsWith("mailto:")) {
    const address = value.trim().slice(7);
    if (/^[^\s@<>()[\]\\,;:"?&]+@[^\s@<>()[\]\\,;:"?&]+\.[a-z]{2,}$/iu.test(address)) return "mailto:" + address;
    throw new AppError("invalid_url");
  }
  return webAddress(value);
}

// A site that may frame the widget, as a Content-Security-Policy source:
// "https://www.example.com", or every subdomain "https://*.example.com".
// Written "www.example.com" it is read as https. Nothing else (no path, no
// 'self', no scheme alone, no wildcard in the middle): the list goes into a
// header as it is.
export function embedSite(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_url");
  let text = value.trim().toLowerCase().replace(/\/+$/u, "");
  if (!/^[a-z]+:\/\//u.test(text)) text = "https://" + text;
  const m = /^(https):\/\/(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(:[0-9]{1,5})?$/u.exec(text)
    ?? /^(http):\/\/()(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/u.exec(text);
  if (!m || text.length > 200) throw new AppError("invalid_url");
  return `${m[1]}://${m[2] ?? ""}${m[3]}${m[4] ?? ""}`;
}

export async function pageSettings(sql: Query): Promise<PageSettings> {
  const [row] = await sql<{ value: Partial<PageSettings> }[]>`select value from settings where key = 'page'`;
  if (!row) return empty;
  const v = row.value;
  // Read again through the same rules: a value that no longer passes is dropped.
  const safe = <T,>(f: () => T, fallback: T): T => {
    try {
      return f();
    } catch {
      return fallback;
    }
  };
  return {
    website: safe(() => webAddress(v.website), null),
    support: safe(() => supportAddress(v.support), null),
    embedSites: Array.isArray(v.embedSites) ? v.embedSites.flatMap(s => safe(() => [embedSite(s)], [] as string[])).slice(0, maxEmbedSites) : [],
    timeZone: safe(() => pageTimeZone(v.timeZone), null),
  };
}

export async function savePageSettings(sql: Sql, actor: Member | null, input: { website?: unknown; support?: unknown; embedSites?: unknown; timeZone?: unknown }): Promise<PageSettings> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const current = await pageSettings(sql);
  const lines = typeof input.embedSites === "string" ? input.embedSites.split(/[\s,]+/u) : Array.isArray(input.embedSites) ? input.embedSites : null;
  const next: PageSettings = {
    website: input.website === undefined ? current.website : webAddress(input.website),
    support: input.support === undefined ? current.support : supportAddress(input.support),
    embedSites: lines === null ? current.embedSites : [...new Set(lines.filter(l => typeof l !== "string" || l.trim() !== "").map(embedSite))],
    timeZone: input.timeZone === undefined ? current.timeZone : pageTimeZone(input.timeZone),
  };
  if (next.embedSites.length > maxEmbedSites) throw new AppError("too_many", { max: maxEmbedSites });
  await sql`insert into settings (key, value) values ('page', ${sql.json(next as never)}) on conflict (key) do update set value = excluded.value`;
  return next;
}

// The host of an address, as people write it: "atelier-martin.fr".
export function siteName(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./u, "");
  } catch {
    return address;
  }
}
