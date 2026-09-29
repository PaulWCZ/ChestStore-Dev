import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { addComponent } from "../lib/components.ts";
import * as incidents from "../lib/incidents.ts";
import { statusView } from "../lib/status-view.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, nora, tom } from "./support/members.ts";

let database: TestDatabase;
const editor = asMember(camille);
const zone = "Europe/Paris";
let checkout = "", payments = "", website = "";

before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, mail_queue, update_log restart identity cascade`;
  website = (await addComponent(sql, editor, { name: "Website" })).id;
  const shop = (await addComponent(sql, editor, { name: "Online shop", kind: "group" })).id;
  checkout = (await addComponent(sql, editor, { name: "Checkout", parentId: shop })).id;
  payments = (await addComponent(sql, editor, { name: "Payments", parentId: shop })).id;
});

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};

test("posting an incident: one screen gives the incident and its first update, the page shows it at once", async () => {
  const { sql } = database;
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "  Payments fail  ", status: "investigating", body: "We are looking into it.\n\nOrders are safe.", states: { [payments]: "major", [checkout]: "degraded" } });
  const i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.title, "Payments fail");
  assert.equal(i.status, "investigating");
  assert.equal(i.createdBy, camille.id);
  assert.deepEqual(i.updates[0]!.states, { [payments]: "major", [checkout]: "degraded" });
  assert.equal(i.updates[0]!.body, "We are looking into it.\n\nOrders are safe.");
  const view = await statusView(sql, zone);
  assert.equal(view.overall, "major");
  assert.equal(view.open.length, 1);
  const shop = view.entries.find(e => e.kind === "group")!;
  assert.equal(shop.state, "major");
  assert.equal(shop.children.find(c => c.id === checkout)!.state, "degraded");
  assert.equal(view.entries.find(e => e.id === website)!.state, "operational");
});

test("an incident is refused without an editor, a title, a component, a known component or a real step", async () => {
  const { sql } = database;
  const good = { title: "Down", status: "investigating", body: "Looking.", states: { [website]: "major" } };
  await refuses("forbidden", () => incidents.openIncident(sql, asMember(nora), good));
  await refuses("forbidden", () => incidents.openIncident(sql, null, good));
  await refuses("empty", () => incidents.openIncident(sql, editor, { ...good, title: "   " }));
  await refuses("too_long", () => incidents.openIncident(sql, editor, { ...good, title: "x".repeat(161) }));
  await refuses("too_long", () => incidents.openIncident(sql, editor, { ...good, body: "x".repeat(5001) }));
  await refuses("no_components", () => incidents.openIncident(sql, editor, { ...good, states: {} }));
  await refuses("invalid", () => incidents.openIncident(sql, editor, { ...good, states: { "999": "major" } }));
  await refuses("invalid", () => incidents.openIncident(sql, editor, { ...good, states: { [website]: "broken" } }));
  await refuses("invalid", () => incidents.openIncident(sql, editor, { ...good, status: "resolved" }));
  const [{ count }] = (await sql`select count(*)::int as count from incidents`) as unknown as [{ count: number }];
  assert.equal(count, 0);
  // A group is not a component one can report on.
  const [group] = await sql`select id from components where kind = 'group'`;
  await refuses("invalid", () => incidents.openIncident(sql, editor, { ...good, states: { [String(group!.id)]: "major" } }));
});

test("updates keep the components as they were unless told; resolving sets everything back; reopening takes an explicit reopen", async () => {
  const { sql } = database;
  const t0 = new Date(Date.now() - 3 * 3600000);
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Slow checkout", status: "investigating", body: "Slow.", states: { [checkout]: "partial" } }, t0);
  await incidents.addUpdate(sql, asMember(tom), incidentId, { status: "identified", body: "Found it." }, new Date(t0.getTime() + 3600000));
  let i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "identified");
  assert.deepEqual(i.updates[0]!.states, { [checkout]: "partial" });
  assert.equal(i.updates[0]!.author, tom.id);
  await incidents.addUpdate(sql, editor, incidentId, { status: "monitoring", body: "Fixed, watching.", states: { [checkout]: "degraded" } }, new Date(t0.getTime() + 7200000));
  assert.equal((await statusView(sql, zone)).entries[1]!.children[0]!.state, "degraded");
  const done = await incidents.addUpdate(sql, editor, incidentId, { status: "resolved", body: "All good." });
  assert.equal(done.resolved, true);
  i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "resolved");
  assert.ok(i.resolvedAt);
  assert.deepEqual(i.updates[0]!.states, {});
  const view = await statusView(sql, zone);
  assert.equal(view.overall, "operational");
  assert.equal(view.recent.length, 1);
  // A step posted to a resolved incident is refused: a slip must not reopen
  // it and email every subscriber. Resolving it again is refused too.
  await refuses("already_resolved", () => incidents.addUpdate(sql, editor, incidentId, { status: "investigating", body: "It is back." }));
  await refuses("already_resolved", () => incidents.addUpdate(sql, editor, incidentId, { status: "resolved", body: "Again.", reopen: true }));
  const again = await incidents.addUpdate(sql, editor, incidentId, { status: "investigating", body: "It is back.", reopen: true });
  assert.equal(again.reopened, true);
  i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "investigating");
  assert.equal(i.resolvedAt, null);
  assert.deepEqual(i.updates[0]!.states, { [checkout]: "degraded" });
  await refuses("forbidden", () => incidents.addUpdate(sql, asMember(nora), incidentId, { status: "resolved", body: "x" }));
  await refuses("not_found", () => incidents.addUpdate(sql, editor, "424242", { status: "resolved", body: "x" }));
  await refuses("invalid", () => incidents.addUpdate(sql, editor, incidentId, { status: "fixed", body: "x" }));
});

test("a backfilled incident joins the history and the uptime, within bounds, and tells nobody", async () => {
  const { sql } = database;
  await sql`insert into subscribers (email, language, token, confirmed_at) values ('ana@example.com', 'en', ${"t".repeat(32)}, now())`;
  const now = new Date();
  const startedAt = new Date(now.getTime() - 3 * 86400000), resolvedAt = new Date(startedAt.getTime() + 2 * 3600000);
  const { incidentId } = await incidents.backfill(sql, editor, { title: "Site down", body: "The site was down.", resolution: "Back up.", states: { [website]: "major" }, startedAt, resolvedAt }, now);
  const i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "resolved");
  assert.equal(i.backfilled, true);
  assert.equal(i.startedAt.getTime(), startedAt.getTime());
  assert.equal(i.updates.length, 2);
  const [{ count }] = (await sql`select count(*)::int as count from mail_queue`) as unknown as [{ count: number }];
  assert.equal(count, 0);
  const web = (await statusView(sql, zone, now)).entries.find(e => e.id === website)!.self!;
  // Counted from the first incident entered (3 days ago), not from the
  // component's creation today: 2 hours down in 3 days.
  assert.ok(Math.abs(web.uptime! - (1 - 2 / 72) * 100) < 0.01);
  assert.equal(web.days.at(-4)!.state, "major");
  const base = { title: "x", body: "x", resolution: "x", states: { [website]: "major" } };
  await refuses("invalid_time", () => incidents.backfill(sql, editor, { ...base, startedAt: resolvedAt, resolvedAt: startedAt }, now));
  await refuses("invalid_time", () => incidents.backfill(sql, editor, { ...base, startedAt: new Date(now.getTime() + 3600000), resolvedAt: new Date(now.getTime() + 7200000) }, now));
  await refuses("invalid_time", () => incidents.backfill(sql, editor, { ...base, startedAt: new Date(now.getTime() - 400 * 86400000), resolvedAt: new Date(now.getTime() - 399 * 86400000) }, now));
  await refuses("forbidden", () => incidents.backfill(sql, asMember(nora), { ...base, startedAt, resolvedAt }, now));
});

test("correcting and removing updates is logged; the only update cannot go; an incident removed leaves the page and comes back", async () => {
  const { sql } = database;
  const t0 = new Date(Date.now() - 3600000);
  const { incidentId, updateId: first } = await incidents.openIncident(sql, editor, { title: "Down", status: "investigating", body: "Typo hre.", states: { [website]: "major" } }, t0);
  await incidents.editUpdate(sql, asMember(tom), first, "Typo here.");
  await refuses("last_update", () => incidents.removeUpdate(sql, editor, first));
  const { updateId: second } = await incidents.addUpdate(sql, editor, incidentId, { status: "resolved", body: "Fixed." });
  await incidents.removeUpdate(sql, editor, second);
  let i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "investigating", "removing the resolution reopens it");
  assert.equal(i.updates.find(u => u.id === first)!.body, "Typo here.");
  assert.deepEqual(i.updates.find(u => u.id === first)!.log.map(l => [l.action, l.previousBody, l.actor]), [["edited", "Typo hre.", tom.id]]);
  assert.equal(i.updates.find(u => u.id === second)!.removedBy, camille.id);
  assert.equal((await incidents.publicIncident(sql, incidentId))!.updates.length, 1, "the public never sees a removed update");
  await incidents.restoreUpdate(sql, editor, second);
  i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "resolved");
  assert.deepEqual(i.updates.find(u => u.id === second)!.log.map(l => l.action), ["removed", "restored"]);
  await incidents.removeIncident(sql, editor, incidentId);
  assert.equal(await incidents.publicIncident(sql, incidentId), null);
  assert.equal((await statusView(sql, zone)).recent.length, 0);
  assert.ok((await incidents.incidentFor(sql, editor, incidentId)).removedAt, "editors still see it");
  await refuses("not_found", () => incidents.editUpdate(sql, editor, first, "Changed after removal"));
  await incidents.restoreIncident(sql, editor, incidentId);
  assert.ok(await incidents.publicIncident(sql, incidentId));
  await refuses("forbidden", () => incidents.removeIncident(sql, asMember(nora), incidentId));
  await refuses("forbidden", () => incidents.editUpdate(sql, asMember(nora), first, "x"));
  await refuses("forbidden", () => incidents.incidentFor(sql, asMember(nora), incidentId));
  assert.equal(await incidents.publicIncident(sql, "nonsense"), null);
});

test("maintenance: planned, in progress and completed by the clock; finished early, cancelled, changed, bounded", async () => {
  const { sql } = database;
  const now = new Date();
  const start = new Date(now.getTime() + 86400000), end = new Date(start.getTime() + 3600000);
  const { incidentId } = await incidents.planMaintenance(sql, editor, { title: "Database upgrade", body: "30 minutes.", start, end, components: [checkout, payments], autoPosts: true }, now);
  let view = await statusView(sql, zone, now);
  assert.equal(view.maintenanceAhead.length, 1);
  assert.equal(view.overall, "operational");
  view = await statusView(sql, zone, new Date(start.getTime() + 60000));
  assert.equal(view.maintenanceNow.length, 1);
  assert.equal(view.overall, "maintenance");
  assert.equal(view.entries.find(e => e.kind === "group")!.children[0]!.state, "maintenance");
  view = await statusView(sql, zone, new Date(end.getTime() + 60000));
  assert.equal(view.maintenanceNow.length + view.maintenanceAhead.length, 0);
  // Completing is for a maintenance under way; changing moves it.
  await refuses("invalid", () => incidents.maintenanceUpdate(sql, editor, incidentId, { status: "completed", body: "Done." }, now));
  await incidents.editMaintenance(sql, editor, incidentId, { title: "Database upgrade", start: new Date(now.getTime() - 60000), end, components: [checkout], autoPosts: false }, now);
  let m = await incidents.incidentFor(sql, editor, incidentId);
  assert.deepEqual(m.components, [checkout]);
  await incidents.maintenanceUpdate(sql, editor, incidentId, { status: "update", body: "Halfway." }, now);
  await incidents.maintenanceUpdate(sql, editor, incidentId, { status: "completed", body: "Done early." }, new Date(now.getTime() + 60000));
  m = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(m.status, "completed");
  assert.equal((await statusView(sql, zone, new Date(now.getTime() + 120000))).maintenanceNow.length, 0);
  await refuses("ended", () => incidents.maintenanceUpdate(sql, editor, incidentId, { status: "update", body: "More." }, new Date(now.getTime() + 180000)));
  await refuses("ended", () => incidents.editMaintenance(sql, editor, incidentId, { title: "x", start, end, components: [checkout], autoPosts: false }, new Date(now.getTime() + 180000)));
  // Cancelled: never shown as maintenance.
  const other = await incidents.planMaintenance(sql, editor, { title: "Other", body: "x", start, end, components: [website], autoPosts: false }, now);
  await incidents.maintenanceUpdate(sql, editor, other.incidentId, { status: "cancelled", body: "Not needed." }, now);
  assert.equal((await statusView(sql, zone, new Date(start.getTime() + 60000))).maintenanceNow.length, 0);
  // Bounds.
  const base = { title: "x", body: "x", components: [website], autoPosts: false };
  await refuses("invalid_time", () => incidents.planMaintenance(sql, editor, { ...base, start: end, end: start }, now));
  await refuses("not_future", () => incidents.planMaintenance(sql, editor, { ...base, start: new Date(now.getTime() - 7200000), end: new Date(now.getTime() - 3600000) }, now));
  await refuses("invalid_time", () => incidents.planMaintenance(sql, editor, { ...base, start, end: new Date(start.getTime() + 8 * 86400000) }, now));
  await refuses("no_components", () => incidents.planMaintenance(sql, editor, { ...base, components: [], start, end }, now));
  await refuses("forbidden", () => incidents.planMaintenance(sql, asMember(nora), { ...base, start, end }, now));
});

test("automatic posts: 'in progress' and 'completed' dated at the window's edges, once, whenever the pass runs", async () => {
  const { sql } = database;
  const now = new Date();
  const start = new Date(now.getTime() + 3600000), end = new Date(start.getTime() + 3600000);
  const { incidentId } = await incidents.planMaintenance(sql, editor, { title: "Upgrade", body: "Planned.", start, end, components: [website], autoPosts: true }, now);
  const words = () => ({ started: "Started.", completed: "Completed." });
  assert.deepEqual(await incidents.autoPost(sql, words, now), []);
  assert.equal((await incidents.autoPost(sql, words, new Date(start.getTime() + 14 * 60000))).length, 1);
  assert.equal((await incidents.autoPost(sql, words, new Date(start.getTime() + 20 * 60000))).length, 0);
  assert.equal((await incidents.autoPost(sql, words, new Date(end.getTime() + 5 * 60000))).length, 1);
  assert.equal((await incidents.autoPost(sql, words, new Date(end.getTime() + 30 * 60000))).length, 0);
  const m = await incidents.incidentFor(sql, editor, incidentId);
  assert.deepEqual(m.updates.map(u => [u.status, u.author, u.postedAt.getTime()]), [["completed", "auto", end.getTime()], ["in_progress", "auto", start.getTime()], ["scheduled", camille.id, now.getTime()]]);
  // A pass that comes late posts both, still dated at the edges.
  const late = await incidents.planMaintenance(sql, editor, { title: "Late", body: "x", start, end, components: [website], autoPosts: true }, now);
  assert.equal((await incidents.autoPost(sql, words, new Date(end.getTime() + 3600000))).length, 2);
  assert.equal((await incidents.incidentFor(sql, editor, late.incidentId)).updates[0]!.postedAt.getTime(), end.getTime());
  // Without automatic posts, nothing is written; the page still reads the clock.
  const quiet = await incidents.planMaintenance(sql, editor, { title: "Quiet", body: "x", start, end, components: [website], autoPosts: false }, now);
  await incidents.autoPost(sql, words, new Date(end.getTime() + 3600000));
  assert.equal((await incidents.incidentFor(sql, editor, quiet.incidentId)).updates.length, 1);
});

test("emails wait for the subscribers who follow what an update touches; the history reads by month", async () => {
  const { sql } = database;
  await sql`insert into subscribers (email, language, components, token, confirmed_at) values
    ('all@example.com', 'en', null, ${"a".repeat(32)}, now()),
    ('shop@example.com', 'fr', ${[checkout]}::bigint[], ${"b".repeat(32)}, now()),
    ('web@example.com', 'en', ${[website]}::bigint[], ${"c".repeat(32)}, now()),
    ('pending@example.com', 'en', null, ${"d".repeat(32)}, null)`;
  const { incidentId, updateId } = await incidents.openIncident(sql, editor, { title: "Checkout down", status: "investigating", body: "x", states: { [checkout]: "major" } });
  const queued = async (u: string) => (await sql<{ email: string }[]>`select s.email from mail_queue q join subscribers s on s.id = q.subscriber_id where q.update_id = ${u} order by s.email`).map(r => r.email);
  assert.deepEqual(await queued(updateId), ["all@example.com", "shop@example.com"]);
  const { updateId: second } = await incidents.addUpdate(sql, editor, incidentId, { status: "identified", body: "y", states: { [website]: "partial" } });
  assert.deepEqual(await queued(second), ["all@example.com", "shop@example.com", "web@example.com"], "anyone following something the incident touched");
  const page = await incidents.historyPage(sql, 0, zone);
  assert.equal(page.months.length, 3);
  assert.equal(page.months[0]!.incidents.length, 1);
  assert.equal(page.older, false);
  assert.equal((await incidents.historyPage(sql, 1, zone)).months[0]!.incidents.length, 0);
});
