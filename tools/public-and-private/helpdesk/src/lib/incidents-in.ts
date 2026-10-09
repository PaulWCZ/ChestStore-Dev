import type { ToolEvent } from "@argentic/chest-sdk/events";
import { log } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, isLocale, locales, type Locale } from "../i18n/index.ts";
import { fillReply } from "./model.ts";

// What Status tells Support (Proposal (studio): events between tools, once
// an administrator linked the two): an incident customers can see on the
// public status page was opened, updated, resolved or removed —
// "status.incident", version 1 (Status' README, "With the other tools"):
//
//   { v: 1, action: "opened" | "updated" | "resolved" | "removed",
//     incident: { id, title, language, titles: {en?, fr?}, status, impact,
//                 started_at, resolved_at, url,
//                 services: [{ id, names: {en?, fr?}, state }] },
//     update: { id, status, at } }
//
// While an incident is open, the inbox says so ("Incident in progress:
// Payments unavailable", with its public page) and the answer box offers a
// saved reply that tells the customer, with the link — so forty "payment
// failed" tickets get the same true answer in two clicks. Resolved or
// removed, both disappear.
//
// The data comes from another tool: read as untrusted — texts bounded and
// cleaned, the link https (or a local harness), the states from a closed
// list. Events arrive at least once and may arrive out of order: one
// published earlier (the Chest's occurredAt) never replaces a later one.

export const incidentLimits = { title: 160, service: 80, services: 30 } as const;

export type IncidentNews = {
  id: string;
  action: "opened" | "updated" | "resolved" | "removed";
  titles: Partial<Record<Locale, string>>;
  language: Locale;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  impact: "degraded" | "partial" | "major" | "maintenance" | "operational";
  url: string | null;
  services: { names: Partial<Record<Locale, string>>; state: string }[];
  startedAt: Date;
  at: Date;
};

const actions = ["opened", "updated", "resolved", "removed"] as const;
const statuses = ["investigating", "identified", "monitoring", "resolved"] as const;
const impacts = ["degraded", "partial", "major", "maintenance", "operational"] as const;
const object = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null);
// One line as a person wrote it: no control or direction characters, runs
// of spaces made one, bounded.
function line(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return [...value.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, " ").replace(/\s+/gu, " ").trim()].slice(0, max).join("").trim();
}
function date(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
// A text per language, only the tool's languages.
function perLanguage(value: unknown, max: number): Partial<Record<Locale, string>> {
  const o = object(value);
  const out: Partial<Record<Locale, string>> = {};
  if (!o) return out;
  for (const l of locales) {
    const text = line(o[l], max);
    if (text) out[l] = text;
  }
  return out;
}
// The public page's address: https, or http on a local harness; no
// credentials; never anything a browser would run.
function publicLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const u = new URL(value);
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    if ((u.protocol !== "https:" && !local) || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

// readIncident reads a delivered "status.incident", or null when it is not
// one this version understands.
export function readIncident(event: Pick<ToolEvent, "data"> & { occurredAt?: string }): IncidentNews | null {
  const d = event.data;
  if (typeof d["v"] !== "number" || !Number.isInteger(d["v"]) || d["v"] < 1) return null;
  const action = oneOf(actions, d["action"]);
  const i = object(d["incident"]), u = object(d["update"]);
  if (!action || !i) return null;
  const id = typeof i["id"] === "string" && /^[0-9]{1,18}$/u.test(i["id"]) ? i["id"] : null;
  const language = isLocale(i["language"]) ? i["language"] : null;
  const status = oneOf(statuses, i["status"]);
  const impact = oneOf(impacts, i["impact"]) ?? "operational";
  const startedAt = date(i["started_at"]);
  if (!id || !language || !status || !startedAt) return null;
  const titles = perLanguage(i["titles"], incidentLimits.title);
  const title = line(i["title"], incidentLimits.title);
  if (title && !titles[language]) titles[language] = title;
  if (Object.keys(titles).length === 0) return null;
  const services = (Array.isArray(i["services"]) ? i["services"].slice(0, incidentLimits.services) : []).flatMap(raw => {
    const s = object(raw);
    const names = s ? perLanguage(s["names"], incidentLimits.service) : {};
    return s && Object.keys(names).length > 0 ? [{ names, state: oneOf(impacts, s["state"]) ?? "operational" }] : [];
  });
  // Ordered by when Status published it (the Chest's stamp), else by
  // the update it tells.
  return { id, action, titles, language, status, impact, url: publicLink(i["url"]), services, startedAt, at: date(event.occurredAt) ?? date(u?.["at"]) ?? startedAt };
}

// received keeps what an event says of an incident, unless a newer update
// of it is already known.
export async function received(sql: Sql, event: Pick<ToolEvent, "data" | "occurredAt">): Promise<void> {
  const news = readIncident(event);
  if (!news) {
    log.warn("status.incident ignored: not an incident of version 1");
    return;
  }
  const status = news.action === "removed" ? "removed" : news.action === "resolved" ? "resolved" : news.status;
  await sql`
    insert into incidents (source_id, titles, language, services, impact, status, url, started_at, at)
    values (${news.id}, ${sql.json(news.titles as never)}, ${news.language}, ${sql.json(news.services as never)}, ${news.impact}, ${status}, ${news.url}, ${news.startedAt}, ${news.at})
    on conflict (source_id) do update set titles = excluded.titles, language = excluded.language, services = excluded.services, impact = excluded.impact,
      status = excluded.status, url = excluded.url, started_at = excluded.started_at, at = excluded.at, received_at = now()
    where incidents.at <= excluded.at`;
  // Resolved long ago: nothing to keep.
  await sql`delete from incidents where status in ('resolved', 'removed') and at < now() - interval '30 days'`;
}

// ---- What the team sees ----------------------------------------------------

export type OpenIncident = { id: string; title: string; lang: Locale; services: string[]; impact: IncidentNews["impact"]; url: string | null; startedAt: string };

// The title (or a service's name) in the reader's language, else in the
// incident's own.
function pick(texts: Partial<Record<Locale, string>>, locale: Locale, fallback: Locale): { text: string; lang: Locale } {
  if (texts[locale]) return { text: texts[locale]!, lang: locale };
  if (texts[fallback]) return { text: texts[fallback]!, lang: fallback };
  const [l, text] = Object.entries(texts)[0] as [Locale, string];
  return { text, lang: l };
}

// openIncidents: the incidents in progress, for whoever reads tickets, in
// their language; the latest first, three at most.
export async function openIncidents(sql: Query, actor: Member | null, locale: Locale): Promise<OpenIncident[]> {
  if (!can(actor, "tickets.read")) throw new AppError("forbidden");
  const rows = await sql<{ source_id: string; titles: Partial<Record<Locale, string>>; language: Locale; services: IncidentNews["services"]; impact: IncidentNews["impact"]; url: string | null; started_at: Date }[]>`
    select source_id, titles, language, services, impact, url, started_at from incidents where status not in ('resolved', 'removed') order by started_at desc limit 3`;
  return rows.map(r => {
    const title = pick(r.titles, locale, r.language);
    return { id: r.source_id, title: title.text, lang: title.lang, services: (r.services ?? []).map(s => pick(s.names, locale, r.language).text), impact: r.impact, url: r.url, startedAt: r.started_at.toISOString() };
  });
}

// incidentReplies: a saved reply per incident in progress, written in the
// ticket's language (the customer's), with its public page when Status
// gave one; {customer} and {agent} filled as in any saved reply.
export async function incidentReplies(sql: Query, actor: Member | null, language: string, values: { customer: string; agent: string }, readerLocale: Locale): Promise<{ id: string; title: string; filled: string; note: string }[]> {
  const theirs: Locale = isLocale(language) ? language : "en";
  const list = await openIncidents(sql, actor, theirs);
  const reader = catalogue(readerLocale).incident;
  const words = catalogue(theirs).incident;
  const shown = new Map((await openIncidents(sql, actor, readerLocale)).map(i => [i.id, i.title]));
  return list.map(i => ({
    id: `incident:${i.id}`,
    title: format(reader.replyTitle, { title: shown.get(i.id) ?? i.title }),
    note: reader.replyNote,
    // A customer without a name: "Hello," — never "Hello ,".
    filled: fillReply(format(i.url ? words.reply : words.replyNoLink, { title: i.title, url: i.url ?? "" }), values).replace(/ +,/u, ","),
  }));
}
