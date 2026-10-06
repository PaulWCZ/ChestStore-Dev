import { chest } from "@argentic/chest-sdk/chest";
import { db } from "./db.ts";
import { atom, rss, type Feed } from "./feed.ts";
import { calendar } from "./ics.ts";
import { catalogue, format, stamp, type Locale } from "../i18n/index.ts";
import { recentActivity, upcomingMaintenance } from "./incidents.ts";
import { pick } from "./texts.ts";
import { publicOrigin } from "./public-origin.ts";
import { rememberPublicOrigin } from "./settings.ts";

// The public feeds: incidents (Atom and RSS) and planned maintenance (a
// calendar). Anonymous, like the page, cached as briefly.
export const feedHeaders = (type: string) => ({ "Content-Type": type, "Cache-Control": "public, max-age=60", Vary: "Accept-Language, Cookie", "X-Content-Type-Options": "nosniff" });

async function origin(headers: Headers): Promise<string> {
  const sql = db();
  const found = publicOrigin(headers) ?? "";
  await rememberPublicOrigin(sql, found || null);
  return found;
}

// Each in the visitor's language (the switch's cookie, the browser's),
// its links on the public address (lib/public-origin.ts).
export async function incidentFeed(headers: Headers, locale: Locale): Promise<Feed> {
  const t = catalogue(locale);
  const sql = db();
  const base = await origin(headers);
  const zone = chest.timeZone;
  const now = new Date();
  const company = chest.organization.name || t.mail.team;
  const list = await recentActivity(sql, now, 50);
  const entries = list.map(i => {
    const visible = i.updates.filter(u => u.postedAt.getTime() <= now.getTime());
    const text = visible.map(u => `${t.steps[u.status]} — ${stamp(u.postedAt, zone, locale, now)}\n${pick(u.body, u.bodySecond, i, locale).text}`).join("\n\n");
    const updated = visible[0]?.postedAt ?? i.createdAt;
    const title = pick(i.title, i.titleSecond, i, locale).text;
    return { id: `${base}/incidents/${i.id}`, title: i.kind === "maintenance" ? `${t.public.maintenanceTag} — ${title}` : title, link: `${base}/incidents/${i.id}`, published: i.createdAt, updated, text };
  });
  return {
    title: format(t.public.feedTitle, { company }),
    subtitle: format(t.public.feedSubtitle, { company }),
    link: `${base}/`,
    self: `${base}/feed.atom`,
    updated: entries.reduce((a, e) => (e.updated > a ? e.updated : a), new Date(0)),
    entries,
  };
}

export async function atomFeed(headers: Headers, locale: Locale): Promise<string> {
  return atom(await incidentFeed(headers, locale));
}

export async function rssFeed(headers: Headers, locale: Locale): Promise<string> {
  const feed = await incidentFeed(headers, locale);
  return rss({ ...feed, self: feed.self.replace(/feed\.atom$/u, "feed.rss") });
}

export async function maintenanceCalendar(headers: Headers, locale: Locale): Promise<string> {
  const t = catalogue(locale);
  const sql = db();
  const base = await origin(headers);
  const company = chest.organization.name || t.mail.team;
  const host = (() => {
    try {
      return new URL(base).host || "status";
    } catch {
      return "status";
    }
  })();
  const list = await upcomingMaintenance(sql, new Date());
  return calendar(list.map(m => ({
    uid: `maintenance-${m.id}@${host}`,
    sequence: m.updates.length,
    start: m.startedAt,
    end: m.status === "completed" && m.resolvedAt && m.endsAt && m.resolvedAt < m.endsAt ? m.resolvedAt : m.endsAt ?? m.startedAt,
    summary: `${t.public.maintenanceTag} — ${pick(m.title, m.titleSecond, m, locale).text}`,
    description: (() => { const first = [...m.updates].reverse()[0]; return first ? pick(first.body, first.bodySecond, m, locale).text : ""; })(),
    url: `${base}/incidents/${m.id}`,
    cancelled: m.status === "cancelled",
    stamp: m.createdAt,
  })), { name: format(t.public.calendarName, { company }), refreshHours: 1 });
}
