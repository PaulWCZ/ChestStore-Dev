import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { db, type Query } from "./db.ts";
import { catalogue } from "./i18n/index.ts";
import { latestIncidents, upcomingMaintenance, type Incident, type Update } from "./incidents.ts";
import { chestLanguage } from "./languages.ts";
import { severity, worst, type Impact, type State } from "./model.ts";
import { publicOrigin } from "./public-origin.ts";
import { rememberPublicOrigin } from "./settings.ts";
import { statusView, type ComponentView, type StatusView } from "./status-view.ts";
import { maintenancePhase } from "./timeline.ts";

// The public API, in the shape of Atlassian Statuspage's public status API
// (v2: /api/v2/summary.json, status.json, components.json, incidents.json,
// incidents/unresolved.json, scheduled-maintenances.json and its upcoming
// and active lists), so the dashboards, Slack apps and widgets written
// for Statuspage read a Chest's page unchanged. Shape as documented on the
// API pages every Statuspage page publishes (for example
// https://status.atlassian.com/api, https://metastatuspage.com/api — found
// by a web search on 2026-09-29; the pages themselves could not be opened
// from the studio) and as Atlassian's own widget reads it
// (@statuspage/status-widget 1.0.5, Apache-2.0: `status.indicator`,
// `status.description` of /api/v2/summary.json). Only what visitors see:
// no hidden service, no service for the team only, no removed incident,
// no name of a member.

type ApiStatus = "operational" | "under_maintenance" | "degraded_performance" | "partial_outage" | "major_outage";
export type Indicator = "none" | "minor" | "major" | "critical" | "maintenance";

const componentStatus: Record<State, ApiStatus> = { operational: "operational", maintenance: "under_maintenance", degraded: "degraded_performance", partial: "partial_outage", major: "major_outage" };

// Statuspage's documented rule for an incident's impact and for the page's
// top-level status ("Top-level status and incident impact calculations",
// https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations/,
// read through a web search on 2026-09-29), applied in its order: all
// major → critical; all partial → major; any major → major; any partial →
// minor; any degraded → minor; any maintenance → maintenance; else none.
export function indicatorOf(states: State[]): Indicator {
  if (states.length > 0 && states.every(s => s === "major")) return "critical";
  if (states.length > 0 && states.every(s => s === "partial")) return "major";
  if (states.includes("major")) return "major";
  if (states.includes("partial") || states.includes("degraded")) return "minor";
  if (states.includes("maintenance")) return "maintenance";
  return "none";
}

const iso = (d: Date | number | null | undefined) => (d === null || d === undefined ? null : new Date(d).toISOString());

type Context = { origin: string; pageId: string; view: StatusView; now: Date; created: Map<string, Date>; touchedAt: Map<string, Date> };

// A stable identifier of this page (Statuspage's are 12 characters).
function pageIdOf(origin: string): string {
  return createHash("sha256").update(`status:${origin || process.env["CHEST_TOOL"] || "status"}`).digest("hex").slice(0, 12);
}

function pageOf(c: Context) {
  const t = catalogue(chestLanguage());
  const company = chest.organization.name;
  const latest = [c.view.updatedAt?.getTime() ?? 0, ...[...c.created.values()].map(d => d.getTime())].reduce((a, b) => Math.max(a, b), 0);
  return { id: c.pageId, name: company ? company : t.meta.publicPlain, url: c.origin, time_zone: chest.timeZone, updated_at: iso(latest || c.now) };
}

// Every visible service and group, in the page's order, flat, as
// Statuspage lists them (a group lists its services' ids).
function componentsOf(c: Context) {
  const out: Record<string, unknown>[] = [];
  let position = 1;
  const one = (v: ComponentView, groupId: string | null) => ({
    id: v.id,
    name: v.name,
    status: componentStatus[v.state],
    created_at: iso(c.created.get(v.id)),
    updated_at: iso(c.touchedAt.get(v.id) ?? c.created.get(v.id)),
    position: position++,
    description: v.description || null,
    showcase: true,
    start_date: iso(c.created.get(v.id))?.slice(0, 10) ?? null,
    group_id: groupId,
    page_id: c.pageId,
    group: false,
    only_show_if_degraded: false,
  });
  for (const e of c.view.entries) {
    if (e.kind === "group") {
      out.push({
        id: e.id, name: e.name, status: componentStatus[e.state], created_at: iso(c.created.get(e.id)), updated_at: iso(c.created.get(e.id)),
        position: position++, description: e.description || null, showcase: false, start_date: null, group_id: null, page_id: c.pageId, group: true,
        only_show_if_degraded: false, components: e.children.map(k => k.id),
      });
      for (const k of e.children) out.push(one(k, e.id));
    } else if (e.self) out.push(one(e.self, null));
  }
  return out;
}

const visible = (i: Incident, now: Date) => i.updates.filter(u => u.removedAt === null && u.postedAt.getTime() <= now.getTime());

// The worst state each service reached during an incident.
function worstStates(i: Incident, now: Date): Map<string, State> {
  const found = new Map<string, State>();
  if (i.kind === "maintenance") for (const c of i.components) found.set(c, "maintenance");
  for (const u of visible(i, now)) for (const [c, s] of Object.entries(u.states) as [string, Impact][]) if (severity[s] > severity[found.get(c) ?? "operational"]) found.set(c, s);
  return found;
}

function incidentOf(c: Context, i: Incident, components: Record<string, unknown>[]) {
  const now = c.now;
  const ups = visible(i, now).filter(u => u.status !== "postmortem");
  const byComponent = new Map(components.map(k => [String(k.id), k]));
  const touched = worstStates(i, now);
  const phase = i.kind === "maintenance" ? maintenancePhase({ status: i.status, startedAt: i.startedAt.getTime(), endsAt: i.endsAt?.getTime() ?? null, resolvedAt: i.resolvedAt?.getTime() ?? null }, now.getTime()) : null;
  const status = phase ?? i.status;
  // Each update says which services changed, from what, to what.
  const chronological = [...ups].reverse();
  const before = new Map<string, State>();
  const changes = new Map<string, { code: string; name: string; old_status: ApiStatus; new_status: ApiStatus }[]>();
  for (const u of chronological) {
    const after = new Map<string, State>(i.kind === "maintenance" ? [] : (Object.entries(u.states) as [string, State][]));
    if (i.kind === "maintenance") {
      const inside = u.status === "in_progress" || (u.status === "update" && i.endsAt !== null && u.postedAt >= i.startedAt && u.postedAt < i.endsAt);
      for (const k of i.components) after.set(k, inside ? "maintenance" : "operational");
    }
    const list: { code: string; name: string; old_status: ApiStatus; new_status: ApiStatus }[] = [];
    for (const k of new Set([...before.keys(), ...after.keys()])) {
      const from = before.get(k) ?? "operational", to = after.get(k) ?? "operational";
      const named = byComponent.get(k);
      if (from !== to && named) list.push({ code: k, name: String(named.name), old_status: componentStatus[from], new_status: componentStatus[to] });
    }
    changes.set(u.id, list);
    before.clear();
    for (const [k, v] of after) before.set(k, v);
  }
  const updateOf = (u: Update) => ({
    id: u.id,
    status: i.kind === "maintenance" ? maintenanceStep(u, i) : u.status,
    body: u.body,
    incident_id: i.id,
    created_at: iso(u.postedAt),
    updated_at: iso(u.editedAt ?? u.postedAt),
    display_at: iso(u.postedAt),
    affected_components: changes.get(u.id)?.length ? changes.get(u.id) : null,
    deliver_notifications: !i.backfilled,
    custom_tweet: null,
    tweet_id: null,
  });
  const postmortem = i.updates.find(u => u.status === "postmortem" && u.removedAt === null && u.postedAt.getTime() <= now.getTime()) ?? null;
  const monitoring = chronological.find(u => u.status === "monitoring");
  return {
    id: i.id,
    name: i.title,
    status,
    created_at: iso(i.createdAt),
    updated_at: iso(ups[0]?.editedAt && ups[0].editedAt > ups[0].postedAt ? ups[0].editedAt : ups[0]?.postedAt ?? i.createdAt),
    monitoring_at: iso(monitoring?.postedAt ?? null),
    resolved_at: i.kind === "incident" ? iso(i.resolvedAt) : phase === "completed" ? iso(i.resolvedAt ?? i.endsAt) : null,
    impact: i.kind === "maintenance" ? "maintenance" : indicatorOf([...touched.values()]),
    shortlink: `${c.origin}/incidents/${i.id}`,
    started_at: iso(i.startedAt),
    page_id: c.pageId,
    incident_updates: ups.map(updateOf),
    components: [...touched.keys()].map(k => byComponent.get(k)).filter(Boolean),
    ...(i.kind === "maintenance" ? { scheduled_for: iso(i.startedAt), scheduled_until: iso(i.endsAt) } : { postmortem_body: postmortem?.body ?? null, postmortem_published_at: iso(postmortem?.postedAt ?? null) }),
  };
}

function maintenanceStep(u: Update, i: Incident): string {
  if (u.status === "update") return i.endsAt !== null && u.postedAt >= i.startedAt && u.postedAt < i.endsAt ? "in_progress" : "scheduled";
  return u.status;
}

async function context(sql: Query, now: Date, origin: string): Promise<Context> {
  const zone = chest.timeZone;
  const [view, rows, touches] = await Promise.all([
    statusView(sql, zone, now),
    sql<{ id: string; created_at: Date }[]>`select id, created_at from components`,
    sql<{ component_id: string; at: Date }[]>`
      select s.component_id, max(u.posted_at) as at from update_states s join updates u on u.id = s.update_id
      where u.removed_at is null and u.posted_at <= ${now} group by s.component_id`,
  ]);
  return {
    origin,
    pageId: pageIdOf(origin),
    view,
    now,
    created: new Map(rows.map(r => [String(r.id), new Date(r.created_at)])),
    touchedAt: new Map(touches.map(r => [String(r.component_id), new Date(r.at)])),
  };
}

function statusOf(c: Context) {
  const t = catalogue(chestLanguage());
  const states = c.view.entries.flatMap(e => (e.self ? [e.self.state] : e.children.map(k => k.state)));
  // Before any service is listed the page is being set up: nothing is
  // wrong, and the description says so rather than "operational".
  if (states.length === 0) return { indicator: "none" as Indicator, description: t.public.setupTitle };
  return { indicator: indicatorOf(states), description: t.banner[worst(states)] };
}

export type Endpoint = "summary" | "status" | "components" | "incidents" | "unresolved" | "maintenances" | "upcoming" | "active";

// The body of one endpoint; origin: the public page's address.
export async function api(endpoint: Endpoint, options: { origin: string; now?: Date }): Promise<unknown> {
  const sql = db();
  const now = options.now ?? new Date();
  const c = await context(sql, now, options.origin);
  const page = pageOf(c);
  const components = componentsOf(c);
  if (endpoint === "status") return { page, status: statusOf(c) };
  if (endpoint === "components") return { page, components };
  const phase = (i: Incident) => maintenancePhase({ status: i.status, startedAt: i.startedAt.getTime(), endsAt: i.endsAt?.getTime() ?? null, resolvedAt: i.resolvedAt?.getTime() ?? null }, now.getTime());
  const unresolved = () => c.view.open.map(i => incidentOf(c, i, components));
  const maintenance = async (which: "all" | "upcoming" | "active" | "current") => {
    const list = (await upcomingMaintenance(sql, now)).filter(m => m.status !== "cancelled" && visible(m, now).length > 0);
    const kept = list.filter(m => which === "all" || (which === "upcoming" && phase(m) === "scheduled") || (which === "active" && phase(m) === "in_progress") || (which === "current" && phase(m) !== "completed"));
    return kept.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 50).map(m => incidentOf(c, m, components));
  };
  if (endpoint === "summary") return { page, components, incidents: unresolved(), scheduled_maintenances: await maintenance("current"), status: statusOf(c) };
  if (endpoint === "unresolved") return { page, incidents: unresolved() };
  if (endpoint === "incidents") return { page, incidents: (await latestIncidents(sql, now, 50)).map(i => incidentOf(c, i, components)) };
  if (endpoint === "maintenances") return { page, scheduled_maintenances: await maintenance("all") };
  if (endpoint === "upcoming") return { page, scheduled_maintenances: await maintenance("upcoming") };
  return { page, scheduled_maintenances: await maintenance("active") };
}

// The answer of a GET: JSON anyone may read from any site (CORS), kept 30
// seconds by caches — the same for every visitor (no language, no cookie).
export const apiHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "public, max-age=30",
  "X-Content-Type-Options": "nosniff",
};

export function apiRoute(endpoint: Endpoint) {
  return {
    async GET(request: Request): Promise<Response> {
      const origin = publicOrigin(request.headers) ?? "";
      await rememberPublicOrigin(db(), origin || null);
      return new Response(JSON.stringify(await api(endpoint, { origin })), { headers: apiHeaders });
    },
    OPTIONS(): Response {
      return new Response(null, { status: 204, headers: { ...apiHeaders, "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "text/plain" } });
    },
  };
}
