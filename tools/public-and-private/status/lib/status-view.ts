import { allComponents, shownComponents, tree, type Component } from "./components.ts";
import type { Query } from "./db.ts";
import { forTimeline, recent, touched, type Incident } from "./incidents.ts";
import { worst, type State } from "./model.ts";
import { currentStates, history, maintenancePhase, spans, uptime, type Day } from "./timeline.ts";

// Everything the status page shows, read at once: the components with their
// state now, their 90 days and uptime; the open incidents, the maintenance
// under way and ahead, the last week's incidents. The public page and the
// editors' overview read the same thing, so editors see what customers see.

export type ComponentView = { id: string; name: string; description: string; state: State; days: Day[]; uptime: number | null };
export type EntryView = { id: string; kind: "component" | "group"; name: string; description: string; state: State; children: ComponentView[]; self: ComponentView | null };
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

export async function statusView(sql: Query, zone: string, now = new Date(), options: { hidden?: boolean } = {}): Promise<StatusView> {
  const [components, incidents] = await Promise.all([allComponents(sql), recent(sql, now)]);
  const at = now.getTime();
  const timeline = forTimeline(incidents);
  const all = spans(timeline, at);
  const current = currentStates(timeline, at);
  const shown = new Set((options.hidden ? components.filter(c => c.kind === "component") : shownComponents(components)).map(c => c.id));
  const view = (c: Component): ComponentView => ({
    id: c.id,
    name: c.name,
    description: c.description,
    state: current.get(c.id) ?? "operational",
    days: history(c.id, c.createdAt.getTime(), all, at, zone),
    uptime: uptime(c.id, c.createdAt.getTime(), all, at, zone),
  });
  const entries: EntryView[] = tree(components, { shown: !options.hidden }).map(e => {
    if (e.kind === "group") {
      const children = e.children.filter(c => shown.has(c.id)).map(view);
      return { id: e.id, kind: "group" as const, name: e.name, description: e.description, state: worst(children.map(c => c.state)), children, self: null };
    }
    const self = view(e);
    return { id: e.id, kind: "component" as const, name: e.name, description: e.description, state: self.state, children: [], self };
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
    names: new Map(components.filter(c => options.hidden || shown.has(c.id)).map(c => [c.id, c.name])),
    updatedAt: latest.length ? new Date(Math.max(...latest)) : null,
  };
}

// The worst impact an incident has now (for its colour), and the names of
// what it touches.
export function impactOf(i: Incident, now = new Date()): State {
  if (i.kind === "maintenance") return "maintenance";
  const last = i.updates.filter(u => u.removedAt === null && u.status !== "resolved" && u.postedAt.getTime() <= now.getTime())[0];
  const picked = last ?? i.updates.find(u => u.removedAt === null && Object.keys(u.states).length > 0);
  return worst(Object.values(picked?.states ?? {}));
}

export function touchedNames(i: Incident, names: Map<string, string>): string[] {
  return touched(i).map(c => names.get(c)).filter((n): n is string => Boolean(n));
}
