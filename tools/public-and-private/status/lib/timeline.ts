import { downtimeWeight, severity, worst, type Impact, type State } from "./model.ts";
import { addDays, instantOf, wall } from "./zone.ts";

// What the page says of each component, read from the incidents and the
// maintenance windows: its state now, the worst state of each of the last
// 90 days, and its uptime. Nothing is measured — the Chest cannot check a
// website by itself — so the history is exactly what the team posted. Pure:
// tested alone, safe in the browser.

// A stretch of time one component spent in one state, because of one
// incident or maintenance.
export type Span = { componentId: string; state: State; from: number; to: number; incidentId: string };

export type TimelineUpdate = { postedAt: number; status: string; states: Map<string, Impact> };
export type TimelineIncident = { id: string; kind: "incident" | "maintenance"; status: string; startedAt: number; endsAt: number | null; resolvedAt: number | null; updates: TimelineUpdate[]; components: string[] };

// When a maintenance really holds its components: from the start of its
// window to its end, or to when it was completed early; never once cancelled.
export function maintenanceWindow(m: Pick<TimelineIncident, "status" | "startedAt" | "endsAt" | "resolvedAt">): { from: number; to: number } | null {
  if (m.status === "cancelled" || m.endsAt === null) return null;
  const to = m.status === "completed" && m.resolvedAt !== null ? Math.min(m.resolvedAt, m.endsAt) : m.endsAt;
  return to > m.startedAt ? { from: m.startedAt, to } : null;
}

// Where a maintenance stands at this moment: before, during, after.
export function maintenancePhase(m: Pick<TimelineIncident, "status" | "startedAt" | "endsAt" | "resolvedAt">, now: number): "scheduled" | "in_progress" | "completed" | "cancelled" {
  if (m.status === "cancelled") return "cancelled";
  const w = maintenanceWindow(m);
  if (!w || now >= w.to) return "completed";
  return now >= w.from ? "in_progress" : "scheduled";
}

// spans cuts every incident into the stretches each component spent in a
// state: an update's picture holds until the next update, the resolution,
// or now.
export function spans(list: TimelineIncident[], now: number): Span[] {
  const out: Span[] = [];
  for (const i of list) {
    if (i.kind === "maintenance") {
      const w = maintenanceWindow(i);
      if (!w) continue;
      for (const c of i.components) out.push({ componentId: c, state: "maintenance", from: w.from, to: Math.min(w.to, now), incidentId: i.id });
      continue;
    }
    const ups = [...i.updates].sort((a, b) => a.postedAt - b.postedAt);
    const end = i.status === "resolved" && i.resolvedAt !== null ? i.resolvedAt : now;
    for (let k = 0; k < ups.length; k++) {
      const u = ups[k]!;
      if (u.status === "resolved") break;
      const to = Math.min(k + 1 < ups.length ? ups[k + 1]!.postedAt : end, end, now);
      if (to <= u.postedAt) continue;
      for (const [c, state] of u.states) out.push({ componentId: c, state, from: u.postedAt, to, incidentId: i.id });
    }
  }
  return out.filter(s => s.to > s.from);
}

// The state of each component at this moment.
export function currentStates(list: TimelineIncident[], now: number): Map<string, State> {
  const found = new Map<string, State>();
  const put = (c: string, s: State) => found.set(c, worst([found.get(c) ?? "operational", s]));
  for (const i of list) {
    if (i.kind === "maintenance") {
      if (maintenancePhase(i, now) === "in_progress") for (const c of i.components) put(c, "maintenance");
      continue;
    }
    if (i.status === "resolved") continue;
    const last = [...i.updates].filter(u => u.postedAt <= now).sort((a, b) => a.postedAt - b.postedAt).at(-1);
    if (last) for (const [c, s] of last.states) put(c, s);
  }
  return found;
}

export type Day = { date: string; state: State | "none"; incidents: string[] };

// The last `count` days in the Chest's time zone, today last.
export function lastDays(now: number, zone: string, count: number): { date: string; from: number; to: number }[] {
  const today = wall(now, zone).date;
  const days = [];
  for (let n = count - 1; n >= 0; n--) {
    const date = addDays(today, -n);
    days.push({ date, from: instantOf(date, 0, zone).getTime(), to: instantOf(addDays(date, 1), 0, zone).getTime() });
  }
  return days;
}

// history gives one component's days: the worst state of each and the
// incidents that touched it. A day before the component existed (and
// before any incident entered for it) has no data.
export function history(componentId: string, createdAt: number, all: Span[], now: number, zone: string, count = 90): Day[] {
  const mine = all.filter(s => s.componentId === componentId);
  return lastDays(now, zone, count).map(d => {
    if (d.to <= createdAt && !mine.some(s => s.from < d.to && s.to > d.from)) return { date: d.date, state: "none", incidents: [] };
    const touching = mine.filter(s => s.from < d.to && s.to > d.from);
    return { date: d.date, state: worst(touching.map(s => s.state)), incidents: [...new Set(touching.map(s => s.incidentId))] };
  });
}

// uptime is the share of the window the component was up, as a percentage
// (null when the window is empty): at each moment the worst state counts,
// never two incidents twice.
export function uptime(componentId: string, createdAt: number, all: Span[], now: number, zone: string, count = 90): number | null {
  // From its creation — or from an incident entered before it, when the
  // history was filled in afterwards.
  const own = all.filter(s => s.componentId === componentId);
  const since = Math.min(createdAt, ...own.map(s => s.from));
  const start = Math.max(lastDays(now, zone, count)[0]!.from, Math.min(since, now));
  const total = now - start;
  if (total <= 0) return null;
  const mine = own.filter(s => s.to > start && s.from < now).map(s => ({ ...s, from: Math.max(s.from, start), to: Math.min(s.to, now) }));
  const edges = [...new Set(mine.flatMap(s => [s.from, s.to]))].sort((a, b) => a - b);
  let down = 0;
  for (let k = 0; k + 1 < edges.length; k++) {
    const a = edges[k]!, b = edges[k + 1]!;
    const here = mine.filter(s => s.from <= a && s.to >= b).map(s => downtimeWeight[s.state]);
    if (here.length) down += (b - a) * Math.max(...here);
  }
  return Math.max(0, Math.min(100, (1 - down / total) * 100));
}

// The banner at the top of the page: the worst state of what is shown.
export function overall(states: Iterable<State>): State {
  return worst(states);
}

export const bySeverity = (a: State, b: State) => severity[b] - severity[a];
