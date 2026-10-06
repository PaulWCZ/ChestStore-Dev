import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { db, type Query } from "./db.ts";
import { getSetting, putSetting } from "./settings.ts";

// The company's websites allowed to show the public forms inside their own
// pages (an iframe), which a manager lists on a form's Share tab: they
// become the public pages' frame-ancestors (src/app.tsx, framed()). The
// team's pages are never framed.
//
// On a Chest today this is not enough: the Chest's front adds its own
// `frame-ancestors 'none'` to every public response (the contract's floor
// policy), and two policies combine — the stricter wins. The Chest needs
// to let a tool's public part be framed by the sites an administrator
// allows (SDK report); until then, the popup button works.
export const maxSites = 10;
const isOrigin = (o: string) => /^https:\/\/[a-z0-9.-]{1,253}(:\d{1,5})?$/u.test(o);

// sites reads what a manager typed: one address per line (or comma), the
// site's address only ("https://www.atelier-martin.fr"), https, ten at most.
export function sites(value: unknown): string[] {
  const lines = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/u) : null;
  if (!lines) throw new AppError("invalid");
  const out: string[] = [];
  for (const raw of lines) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new AppError("invalid_site", { site: raw.trim().slice(0, 60) });
    }
    if (url.protocol !== "https:" || url.username || url.password || !isOrigin(url.origin)) throw new AppError("invalid_site", { site: raw.trim().slice(0, 60) });
    if (!out.includes(url.origin)) out.push(url.origin);
  }
  if (out.length > maxSites) throw new AppError("at_most", { max: maxSites });
  return out;
}

export async function embedSites(sql: Query): Promise<string[]> {
  const value = await getSetting<unknown>(sql, "embed_origins");
  return Array.isArray(value) ? value.filter((o): o is string => typeof o === "string" && isOrigin(o)) : [];
}

export async function saveSites(sql: Query, actor: Member | null, value: unknown): Promise<string[]> {
  if (!can(actor, "forms.all")) throw new AppError("forbidden");
  const list = sites(value);
  await putSetting(sql, "embed_origins", list);
  return list;
}

// Read from the database for every public form's page (src/app.tsx,
// framed()), never kept in the process: a newly allowed website works at
// once, and two processes never disagree. One row by its key: as cheap as
// a query gets.
export async function embedOrigins(sql: Query = db()): Promise<string[]> {
  try {
    return await embedSites(sql);
  } catch {
    // No database yet (a build, a Chest starting): nobody frames it.
    return [];
  }
}

// frameAncestors: nobody for the team's pages; the allowed websites for
// the public ones (none: nobody).
export function frameAncestors(origins: string[], team: boolean): string {
  return team || origins.length === 0 ? "frame-ancestors 'none'" : `frame-ancestors 'self' ${origins.join(" ")}`;
}
