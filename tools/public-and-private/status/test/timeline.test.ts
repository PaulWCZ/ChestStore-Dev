import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStates, history, lastDays, maintenancePhase, spans, uptime, type TimelineIncident } from "../src/lib/timeline.ts";

const zone = "Europe/Paris";
const H = 3600000;
// Noon in Paris, 30 September 2026.
const now = Date.parse("2026-09-30T10:00:00Z");

const incident = (id: string, updates: { at: number; status: string; states: Record<string, "degraded" | "partial" | "major"> }[], resolvedAt: number | null = null): TimelineIncident => ({
  id, kind: "incident", status: resolvedAt ? "resolved" : updates.at(-1)!.status, startedAt: updates[0]!.at, endsAt: null, resolvedAt, components: [],
  updates: [...updates.map(u => ({ postedAt: u.at, status: u.status, states: new Map(Object.entries(u.states)) })), ...(resolvedAt ? [{ postedAt: resolvedAt, status: "resolved", states: new Map() }] : [])],
});

test("an incident's picture holds until the next update, then the resolution", () => {
  const i = incident("1", [
    { at: now - 5 * H, status: "investigating", states: { a: "major", b: "degraded" } },
    { at: now - 4 * H, status: "monitoring", states: { a: "degraded" } },
  ], now - 3 * H);
  const s = spans([i], now);
  assert.deepEqual(s.map(x => [x.componentId, x.state, (x.to - x.from) / H]), [["a", "major", 1], ["b", "degraded", 1], ["a", "degraded", 1]]);
  assert.equal(currentStates([i], now).size, 0);
});

test("an open incident holds its latest picture now; the worst of two incidents wins", () => {
  const one = incident("1", [{ at: now - 2 * H, status: "investigating", states: { a: "degraded" } }]);
  const two = incident("2", [{ at: now - H, status: "identified", states: { a: "partial", c: "major" } }]);
  const states = currentStates([one, two], now);
  assert.equal(states.get("a"), "partial");
  assert.equal(states.get("c"), "major");
});

test("a maintenance holds its components during its window only, never once cancelled", () => {
  const m: TimelineIncident = { id: "9", kind: "maintenance", status: "scheduled", startedAt: now - H, endsAt: now + H, resolvedAt: null, components: ["a"], updates: [] };
  assert.equal(maintenancePhase(m, now), "in_progress");
  assert.equal(maintenancePhase(m, now - 2 * H), "scheduled");
  assert.equal(maintenancePhase(m, now + 2 * H), "completed");
  assert.equal(maintenancePhase({ ...m, status: "completed", resolvedAt: now - H / 2 }, now), "completed");
  assert.equal(maintenancePhase({ ...m, status: "cancelled" }, now), "cancelled");
  assert.equal(currentStates([m], now).get("a"), "maintenance");
  assert.equal(currentStates([{ ...m, status: "cancelled" }], now).size, 0);
  assert.deepEqual(spans([{ ...m, status: "cancelled" }], now), []);
});

test("90 days in the Chest's time zone, today last, across the change of hour", () => {
  const days = lastDays(now, zone, 90);
  assert.equal(days.length, 90);
  assert.equal(days.at(-1)!.date, "2026-09-30");
  assert.equal(days[0]!.date, "2026-07-03");
  const autumn = lastDays(Date.parse("2026-10-26T10:00:00Z"), zone, 2)[0]!;
  assert.equal(autumn.date, "2026-10-25");
  assert.equal((autumn.to - autumn.from) / H, 25);
});

test("each day shows its worst state and its incidents; before the component existed, no data", () => {
  const i = incident("7", [{ at: now - 26 * H, status: "investigating", states: { a: "partial" } }, { at: now - 25 * H, status: "monitoring", states: { a: "degraded" } }], now - 24 * H);
  const d = history("a", now - 10 * 86400000, spans([i], now), now, zone);
  assert.equal(d.at(-2)!.state, "partial");
  assert.deepEqual(d.at(-2)!.incidents, ["7"]);
  assert.equal(d.at(-1)!.state, "operational");
  assert.equal(d[0]!.state, "none");
  assert.equal(d.at(-12)!.state, "none");
  assert.equal(d.at(-11)!.state, "operational");
});

test("uptime, Statuspage's rule: a major outage counts fully, a partial one for 30 %, degraded and maintenance not at all", () => {
  const created = now - 200 * 86400000;
  const window = now - lastDays(now, zone, 90)[0]!.from;
  const major = incident("1", [{ at: now - 10 * H, status: "investigating", states: { a: "major" } }], now - 8 * H);
  assert.ok(Math.abs(uptime("a", created, spans([major], now), now, zone)! - (1 - 2 * H / window) * 100) < 1e-9);
  const partial = incident("2", [{ at: now - 10 * H, status: "investigating", states: { a: "partial" } }], now - 8 * H);
  assert.ok(Math.abs(uptime("a", created, spans([partial], now), now, zone)! - (1 - 0.3 * 2 * H / window) * 100) < 1e-9);
  const degraded = incident("3", [{ at: now - 10 * H, status: "investigating", states: { a: "degraded" } }], now - 8 * H);
  assert.equal(uptime("a", created, spans([degraded], now), now, zone), 100);
  // Two incidents at once never count twice.
  const both = uptime("a", created, spans([major, { ...major, id: "4" }], now), now, zone)!;
  assert.ok(Math.abs(both - (1 - 2 * H / window) * 100) < 1e-9);
  // A component created an hour ago, down half of it.
  const fresh = incident("5", [{ at: now - H / 2, status: "investigating", states: { b: "major" } }]);
  assert.ok(Math.abs(uptime("b", now - H, spans([fresh], now), now, zone)! - 50) < 1e-9);
  assert.equal(uptime("c", now + H, [], now, zone), null);
});
