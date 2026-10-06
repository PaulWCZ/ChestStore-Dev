import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { allComponents } from "./components.ts";
import type { Query } from "./db.ts";
import { allFor } from "./incidents.ts";
import { pageSettings } from "./page-settings.ts";
import { listTemplates } from "./templates.ts";

// Everything the tool holds about the page, for an editor to keep or to
// move elsewhere: services, every incident and maintenance with every
// update (removed ones and the log of corrections included: it is the
// evidence), templates, the page's settings. Members appear as their ids
// (mbr_…), never names. Subscribers are a separate file (personal data).
export async function exportAll(sql: Query, actor: Member | null, now = new Date()): Promise<unknown> {
  if (!can(actor, "read") || !can(actor, "settings")) throw new AppError("forbidden");
  const incidents = [];
  let before: string | null = null;
  for (;;) {
    const page = await allFor(sql, actor, { limit: 200, before });
    incidents.push(...page);
    if (page.length < 200) break;
    before = page.at(-1)!.id;
  }
  return {
    format: "chest-status-export",
    version: 1,
    exportedAt: now.toISOString(),
    settings: await pageSettings(sql),
    components: await allComponents(sql),
    templates: await listTemplates(sql, actor),
    incidents,
  };
}

// The subscribers as a spreadsheet: address, language, what they follow,
// when they confirmed. RFC 4180 quoting; a cell that starts like a formula
// is prefixed with ' so a spreadsheet does not run it.
export async function subscribersCsv(sql: Query, actor: Member | null): Promise<string> {
  if (!can(actor, "subscribers")) throw new AppError("forbidden");
  const [rows, components] = await Promise.all([
    sql<{ email: string; language: string; components: string[] | null; created_at: Date; confirmed_at: Date | null }[]>`select email, language, components, created_at, confirmed_at from subscribers order by created_at, id`,
    allComponents(sql),
  ]);
  const names = new Map(components.map(c => [c.id, c.name]));
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/u.test(v) ? `'${v}` : v;
    return /[",\n\r]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
  };
  const lines = [["email", "language", "follows", "subscribed_at", "confirmed_at"].join(",")];
  for (const r of rows) {
    const follows = r.components === null ? "*" : r.components.map(id => names.get(String(id)) ?? "").filter(Boolean).join("; ");
    lines.push([r.email, r.language, follows, new Date(r.created_at).toISOString(), r.confirmed_at ? new Date(r.confirmed_at).toISOString() : ""].map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
