import { chest } from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import { db } from "./db.ts";
import { atom, rss, type Feed } from "./feed.ts";
import { calendar } from "./ics.ts";
import { format, stamp } from "./i18n/index.ts";
import { recentActivity, upcomingMaintenance } from "./incidents.ts";
import { pick } from "./texts.ts";
import { publicOrigin } from "./public-origin.ts";
import { publicWords } from "./session.ts";
import { rememberPublicOrigin } from "./settings.ts";

// The public feeds: incidents (Atom and RSS) and planned maintenance (a
// calendar). Anonymous, like the page, cached as briefly.
export const feedHeaders = (type: string) => ({ "Content-Type": type, "Cache-Control": "public, max-age=60", Vary: "Accept-Language, Cookie", "X-Content-Type-Options": "nosniff" });

async function origin(): Promise<string> {
  const sql = db();
  const found = publicOrigin(await headers()) ?? "";
  await rememberPublicOrigin(sql, found || null);
  return found;
}

export async function incidentFeed(): Promise<Feed> {
  const { t, locale } = await publicWords();
  const sql = db();
  const base = await origin();
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

export async function atomFeed(): Promise<string> {
  return atom(await incidentFeed());
}

export async function rssFeed(): Promise<string> {
  const feed = await incidentFeed();
  return rss({ ...feed, self: feed.self.replace(/feed\.atom$/u, "feed.rss") });
}

export async function maintenanceCalendar(): Promise<string> {
  const { t, locale } = await publicWords();
  const sql = db();
  const base = await origin();
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
