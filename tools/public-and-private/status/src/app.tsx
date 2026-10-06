import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import * as checks from "@argentic/chest-sdk/checks";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { AppError, createApp, log, page, publicPage, type MemberContext, type View } from "@argentic/chest-app";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { actions } from "./actions.ts";
import { catalogue, isLocale, locales, publicLocale, words, type Locale } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { apiHeaders, api, type Endpoint } from "./lib/api.ts";
import { badge, brandLabel, labelColour } from "./lib/badge.ts";
import { receive } from "./lib/check-results.ts";
import { allComponents } from "./lib/components.ts";
import { db } from "./lib/db.ts";
import { embedCss, embedHtml, embedTheme } from "./lib/embed.ts";
import { exportAll, subscribersCsv } from "./lib/export.ts";
import { atomFeed, feedHeaders, maintenanceCalendar, rssFeed } from "./lib/feeds.ts";
import { beat } from "./lib/heartbeats.ts";
import { hookDisabled } from "./lib/hooks.ts";
import { pass } from "./lib/jobs.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { pageSettings } from "./lib/page-settings.ts";
import { publicContext } from "./lib/public-page.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import { publicSummary } from "./lib/public-summary.ts";
import { rememberPublicOrigin } from "./lib/settings.ts";
import { heartbeatChanged } from "./lib/tell.ts";
import { lookOf, servedLook } from "./lib/theme.ts";
import { chatSubscribePage } from "./pages/ChatSubscribe.tsx";
import { chatSubscriptionPage } from "./pages/ChatSubscription.tsx";
import { checksPage } from "./pages/Checks.tsx";
import { componentsPage } from "./pages/Components.tsx";
import { newIncident } from "./pages/NewIncident.tsx";
import { newMaintenance } from "./pages/NewMaintenance.tsx";
import { overview } from "./pages/Overview.tsx";
import { publicHistory } from "./pages/PublicHistory.tsx";
import { publicIncidentPage } from "./pages/PublicIncident.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { statusPage } from "./pages/StatusPage.tsx";
import { subscribePage } from "./pages/Subscribe.tsx";
import { subscriberPage } from "./pages/Subscriber.tsx";
import { subscribersPage } from "./pages/Subscribers.tsx";
import { teamHistory } from "./pages/TeamHistory.tsx";
import { teamIncident } from "./pages/TeamIncident.tsx";
import { teamStatus } from "./pages/TeamStatus.tsx";
import { unsubscribedPage } from "./pages/Unsubscribed.tsx";

// Status's routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name> and /actions/<name>, the look
// (/chest/look.css for the team, /look.css for the public pages: the
// company's choice, the five state colours — src/lib/theme.ts), the member
// of every /chest request (401 without), /lang/<code>, the error pages,
// and 404 for anything else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => servedLook(viewer.member !== null ? "team" : "public"),
  // The team's pages are kept from search engines; each public page says
  // its own (src/pages/parts/meta.tsx).
  head: viewer => <>{viewer.member !== null && <meta name="robots" content="noindex, nofollow" />}<link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- Caching of the public part.

// The status page, its history and its incidents are read again and again
// when something breaks: any cache may keep them 30 seconds, one copy per
// language (the switch's cookie, the browser's languages). An editor's
// links carry ?fresh= and always show the page as it is now.
app.use(async (c, next) => {
  await next();
  const first = c.req.path.split("/")[1] ?? "";
  if (c.req.method === "GET" && c.res.status === 200 && (first === "" || first === "history" || first === "incidents") && c.req.query("fresh") === undefined) {
    c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
    c.header("Vary", "Accept-Language, Cookie");
  }
  // A subscriber's page holds their address and their link: never kept by
  // a cache (the package's default, no-store), never passed on to another
  // site, not even to the company's.
  if (first === "s" || first === "w" || first === "subscribe" || first === "unsubscribed") c.header("Referrer-Policy", "no-referrer");
});

// ---- The team's part (/chest…). An editor sees every page; a member
// without a role sees the team's status page (read only) whatever the
// address — every member of the company may know what works.
type Render = (context: MemberContext & { param(name: string): string; query(name: string): string | undefined }) => Promise<View> | View;
const team = (render: Render) => page(context => (roleOf(context.member) ? render(context) : teamStatus(context)));

app.get("/chest", team(context => overview(context)));
app.get("/chest/incidents/new", team(context => newIncident(context, context.query("component"))));
app.get("/chest/incidents/:id", team(context => teamIncident(context, context.param("id"))));
app.get("/chest/maintenance/new", team(context => newMaintenance(context)));
app.get("/chest/components", team(context => componentsPage(context)));
app.get("/chest/checks", team(context => checksPage(context)));
app.get("/chest/subscribers", team(context => subscribersPage(context)));
app.get("/chest/history", team(context => teamHistory(context, context.query("before"))));
app.get("/chest/settings", team(context => settingsPage(context)));

// Download everything (lib/export.ts), as one JSON file; the subscribers
// as a spreadsheet. Editors only.
app.get("/chest/export", async c => {
  try {
    const body = await exportAll(db(), c.get("viewer").member);
    return download(JSON.stringify(body, null, 2), "application/json; charset=utf-8", `status-export-${chest.today()}.json`);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 403);
    throw error;
  }
});
app.get("/chest/export/subscribers.csv", async c => {
  try {
    return download("﻿" + await subscribersCsv(db(), c.get("viewer").member), "text/csv; charset=utf-8", `status-subscribers-${chest.today()}.csv`);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 403);
    throw error;
  }
});

// ---- The public part ("public": true in chest.json): anonymous, in the
// visitor's language, readable without JavaScript.
app.get("/", publicPage(async ({ locale }) => statusPage(await publicContext(locale))));
app.get("/history", publicPage(async ({ locale, query }) => publicHistory(await publicContext(locale), query("page"))));
app.get("/incidents/:id", publicPage(async ({ locale, param }) => publicIncidentPage(await publicContext(locale), param("id"))));
app.get("/subscribe", publicPage(async ({ locale, query, request }) => subscribePage(await publicContext(locale), publicOrigin(request.headers) ?? "", { sent: query("sent"), error: query("error") })));
app.get("/subscribe/chat", publicPage(async ({ locale, query }) => chatSubscribePage(await publicContext(locale), { error: query("error"), kind: query("kind") })));
app.get("/s/:token", publicPage(async ({ locale, param, query }) => subscriberPage(await publicContext(locale), param("token"), { done: query("done"), error: query("error") })));
app.get("/w/:token", publicPage(async ({ locale, param, query }) => chatSubscriptionPage(await publicContext(locale), param("token"), { done: query("done"), error: query("error"), new: query("new") })));
app.get("/unsubscribed", publicPage(async ({ locale }) => unsubscribedPage(await publicContext(locale))));

// The feeds: incidents (Atom, RSS) and planned maintenance (a calendar to
// subscribe to), in the visitor's language, kept a minute.
app.get("/feed.atom", async c => new Response(await atomFeed(c.req.raw.headers, visitorLocale(c)), { headers: feedHeaders("application/atom+xml; charset=utf-8") }));
app.get("/feed.rss", async c => new Response(await rssFeed(c.req.raw.headers, visitorLocale(c)), { headers: feedHeaders("application/rss+xml; charset=utf-8") }));
app.get("/maintenance.ics", async c => new Response(await maintenanceCalendar(c.req.raw.headers, visitorLocale(c)), { headers: { ...feedHeaders("text/calendar; charset=utf-8"), "Content-Disposition": 'inline; filename="maintenance.ics"' } }));

// The public JSON API in Statuspage's shape (lib/api.ts): readable from
// any site, GET only, kept 30 seconds.
const endpoints: Record<string, Endpoint> = {
  "summary.json": "summary",
  "status.json": "status",
  "components.json": "components",
  "incidents.json": "incidents",
  "incidents/unresolved.json": "unresolved",
  "scheduled-maintenances.json": "maintenances",
  "scheduled-maintenances/upcoming.json": "upcoming",
  "scheduled-maintenances/active.json": "active",
};
for (const [path, endpoint] of Object.entries(endpoints)) {
  app.get(`/api/v2/${path}`, async c => {
    const origin = publicOrigin(c.req.raw.headers) ?? "";
    await rememberPublicOrigin(db(), origin || null);
    return new Response(JSON.stringify(await api(endpoint, { origin })), { headers: apiHeaders });
  });
  app.options(`/api/v2/${path}`, () => new Response(null, { status: 204, headers: { ...apiHeaders, "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "text/plain" } }));
}

// The status badge (lib/badge.ts): <img src="…/badge.svg"> on any site.
// Its state colours never change; its label wears the company's colour
// when the Chest gives its brand (and white reads on it). ?lang=fr or
// ?lang=en chooses its words; without it, the reader's browser languages
// do. Kept a minute by caches, per language. A picture: its own policy.
app.get("/badge.svg", async c => {
  const asked = c.req.query("lang");
  const locale: Locale = isLocale(asked) ? asked : publicLocale(undefined, c.req.header("accept-language"));
  const t = catalogue(locale);
  const [{ state }, look] = await Promise.all([publicSummary(), lookOf("public")]);
  const message = state === "none" ? t.public.badgeSetup : t.banner[state];
  return new Response(badge(t.public.badgeLabel, message, state, `${t.public.badgeLabel}: ${message}`, brandLabel(look) ?? labelColour), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...(isLocale(asked) ? {} : { Vary: "Accept-Language" }),
      "Access-Control-Allow-Origin": "*",
      "Content-Security-Policy": "default-src 'none'; style-src 'none'; frame-ancestors 'none'",
    },
  });
});

// The banner for the company's own site (lib/embed.ts), framed only by the
// sites an editor listed: its own policy, their frame-ancestors. Its
// stylesheet beside it.
app.get("/embed", async c => {
  const asked = c.req.query("lang");
  const locale: Locale = isLocale(asked) ? asked : publicLocale(undefined, c.req.header("accept-language"));
  const theme = embedTheme(c.req.query("theme"));
  const [{ state, open }, settings, look] = await Promise.all([publicSummary(), pageSettings(db()), lookOf("public")]);
  const sheet = createHash("sha256").update(embedCss(look, theme)).digest("base64url").slice(0, 16);
  const html = embedHtml({ state, open, origin: publicOrigin(c.req.raw.headers) ?? "", locale, t: catalogue(locale), theme, sheet });
  const ancestors = settings.embedSites.length ? settings.embedSites.join(" ") : "'none'";
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`,
      "Cache-Control": "public, max-age=30",
      ...(isLocale(asked) ? {} : { Vary: "Accept-Language" }),
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
});
app.get("/embed.css", async c => new Response(embedCss(await lookOf("public"), embedTheme(c.req.query("theme"))), { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": c.req.query("v") ? "public, max-age=31536000, immutable" : "public, max-age=300" } }));

// A heartbeat (lib/heartbeats.ts): a job calls this secret address after
// each run — GET or POST, nothing to send (`curl -fsS <address>`). The
// answer says nothing but "received" or "unknown"; never cached.
const heartbeat = async (c: Context) => {
  const sql = db();
  const found = await beat(sql, c.req.param("token"));
  if (!found) return c.body(null, 404);
  if (found.back) {
    const name = (await allComponents(sql)).find(x => x.id === found.componentId)?.name ?? "";
    await heartbeatChanged({ componentId: found.componentId, kind: "up", since: new Date() }, name).catch(error => log.warn("heartbeat back not told", { error: (error as Error).name }));
  }
  c.header("Referrer-Policy", "no-referrer");
  return c.body(null, 204);
};
app.get("/heartbeat/:token", heartbeat);
app.post("/heartbeat/:token", heartbeat);

// ---- What the Chest sends by itself, signed, at least once (never under
// /chest, never behind a session, the body read by handle() only). A
// handler that throws makes the Chest send it again: they are idempotent.

// The members' lifecycle (lib/lifecycle.ts): an erased member's name goes.
app.post("/chest-events", async c => {
  const sql = db();
  return new Response(null, { status: await events.handle(c.req.raw, handlers(sql), { seen: seen(sql) }) });
});

// Every 15 minutes, "updates" (lib/jobs.ts): the automatic posts of
// maintenance windows that started or ended (dated at the window's edges),
// the emails and chat deliveries still waiting, the check results older
// than 90 days, the heartbeats that fell silent. An editor's visit to Now
// does the same, so a Chest that misses a run loses nothing.
app.post("/chest-schedules", async c => {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(c.req.raw, {
      updates: async run => {
        const done = await pass(sql, new Date(Math.max(Date.parse(run.scheduledAt), Date.now())));
        log.info("updates", done);
      },
    }, { seen: seen(sql) }),
  });
});

// Results of the checks the Chest runs (Proposal (studio): checks).
app.post("/chest-checks", async c => {
  const sql = db();
  return new Response(null, { status: await checks.handle(c.req.raw, result => receive(sql, result), { seen: seen(sql) }) });
});

// The Chest's word about the updates it delivers to Slack, Teams and web
// addresses (Proposal (studio): webhooks): an address kept failing, or is
// gone, so the Chest stopped it. Its subscription's page says so and
// offers "Try again".
app.post("/chest-webhooks", async c => {
  const sql = db();
  return new Response(null, { status: await webhooks.handle(c.req.raw, { disabled: async event => { await hookDisabled(sql, event); } }, { seen: seen(sql) }) });
});

// ---- Helpers of the routes above.

// A visitor's language outside a page (a feed): the switch's cookie, the
// browser's languages, the Chest's own language, English.
function visitorLocale(c: Context): Locale {
  return publicLocale(getCookie(c, "lang"), c.req.header("accept-language"), chest.language);
}

// A file to download, kept by no cache.
function download(text: string, type: string, name: string): Response {
  return new Response(text, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}
