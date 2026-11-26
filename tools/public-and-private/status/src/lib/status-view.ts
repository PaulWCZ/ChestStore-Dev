import { measured, type Measured } from "./checks.ts";
import { allComponents, shownComponents, tree, type Component } from "./components.ts";
import type { Query } from "./db.ts";
import { forTimeline, recent, touched, type Incident } from "./incidents.ts";
import { worst, type State } from "./model.ts";
import { currentStates, history, lastDays, maintenancePhase, spans, uptime, type Day } from "./timeline.ts";

// Everything the status page shows, read at once: the components with their
// state now, their 90 days and uptime; the open incidents, the maintenance
// under way and ahead, the last week's incidents. The public page and the
// editors' overview read the same thing, so editors see what customers see.

// since: the first day with data when the service is younger than the
// bar (it existed only from that day: the bar is empty before it, and the
// uptime is counted from it — never "90 days, 100 %" for a service added
// a minute ago). lang: the language of name and description.
export type ComponentView = { id: string; name: string; description: string; lang: string; teamOnly: boolean; state: State; days: Day[]; uptime: number | null; since: string | null; measured: Measured | null };
export type EntryView = { id: string; kind: "component" | "group"; name: string; description: string; lang: string; state: State; children: ComponentView[]; self: ComponentView | null };
export type StatusView = {
  entries: EntryView[];
  overall: State;
  open: Incident[];
  maintenanceNow: Incident[];
  maintenanceAhead: Incident[];
  recent: Incident[];
  incidents: Map<string, Incident>;
  names: Map<string, string>;
  updatedAt: Date | null;
};

// team: the members' own status page — services for the team only and
// their incidents included (never on the public page). locale: the
// reader's language, for the services' names and descriptions.
export async function statusView(sql: Query, zone: string, now = new Date(), options: { team?: boolean; locale?: string } = {}): Promise<StatusView> {
  const at = now.getTime();
  const team = options.team === true;
  const [components, incidents, checked] = await Promise.all([allComponents(sql, options.locale ? { locale: options.locale } : {}), recent(sql, now, undefined, { team }), measured(sql, new Date(lastDays(at, zone, 90)[0]!.from), now)]);
  const timeline = forTimeline(incidents);
  const all = spans(timeline, at);
  const current = currentStates(timeline, at);
  const shown = new Set(shownComponents(components, { team }).map(c => c.id));
  const view = (c: Component): ComponentView => {
    const days = history(c.id, c.createdAt.getTime(), all, at, zone);
    const first = days.findIndex(d => d.state !== "none");
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      lang: c.lang,
      teamOnly: c.teamOnly,
      state: current.get(c.id) ?? "operational",
      days,
      uptime: uptime(c.id, c.createdAt.getTime(), all, at, zone),
      since: first > 0 ? days[first]!.date : null,
      measured: checked.get(c.id) ?? null,
    };
  };
  const entries: EntryView[] = tree(components, { shown: true, team }).map(e => {
    if (e.kind === "group") {
      const children = e.children.filter(c => shown.has(c.id)).map(view);
      return { id: e.id, kind: "group" as const, name: e.name, description: e.description, lang: e.lang, state: worst(children.map(c => c.state)), children, self: null };
    }
    const self = view(e);
    return { id: e.id, kind: "component" as const, name: e.name, description: e.description, lang: e.lang, state: self.state, children: [], self };
  }).filter(e => e.kind === "component" ? shown.has(e.id) : e.children.length > 0);
  const visibleStates = entries.flatMap(e => (e.self ? [e.self.state] : e.children.map(c => c.state)));
  const week = at - 7 * 86400000;
  const phase = (i: Incident) => maintenancePhase({ status: i.status, startedAt: i.startedAt.getTime(), endsAt: i.endsAt?.getTime() ?? null, resolvedAt: i.resolvedAt?.getTime() ?? null }, at);
  const byStart = (a: Incident, b: Incident) => a.startedAt.getTime() - b.startedAt.getTime();
  const latest = incidents.flatMap(i => i.updates.map(u => u.postedAt.getTime())).filter(t => t <= at);
  return {
    entries,
    overall: worst(visibleStates),
    open: incidents.filter(i => i.kind === "incident" && i.status !== "resolved"),
    maintenanceNow: incidents.filter(i => i.kind === "maintenance" && phase(i) === "in_progress").sort(byStart),
    maintenanceAhead: incidents.filter(i => i.kind === "maintenance" && phase(i) === "scheduled").sort(byStart),
    recent: incidents.filter(i => (i.kind === "incident" && i.status === "resolved" && (i.resolvedAt?.getTime() ?? 0) >= week) || (i.kind === "maintenance" && phase(i) === "completed" && (i.endsAt?.getTime() ?? 0) >= week && (i.endsAt?.getTime() ?? 0) <= at)),
    incidents: new Map(incidents.map(i => [i.id, i])),
    names: new Map(components.filter(c => shown.has(c.id)).map(c => [c.id, c.name])),
    updatedAt: latest.length ? new Date(Math.max(...latest)) : null,
  };
}

// The worst impact an incident has now (for its colour), and the names of
// what it touches.
export function impactOf(i: Incident, now = new Date()): State {
  if (i.kind === "maintenance") return "maintenance";
  const last = i.updates.filter(u => u.removedAt === null && u.status !== "resolved" && u.status !== "postmortem" && u.postedAt.getTime() <= now.getTime())[0];
  const picked = last ?? i.updates.find(u => u.removedAt === null && Object.keys(u.states).length > 0);
  return worst(Object.values(picked?.states ?? {}));
}

export function touchedNames(i: Incident, names: Map<string, string>): string[] {
  return touched(i).map(c => names.get(c)).filter((n): n is string => Boolean(n));
}
