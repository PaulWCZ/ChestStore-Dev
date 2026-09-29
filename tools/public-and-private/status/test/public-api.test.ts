import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { api, apiHeaders, indicatorOf } from "../lib/api.ts";
import { badge } from "../lib/badge.ts";
import { addComponent, updateComponent } from "../lib/components.ts";
import * as incidents from "../lib/incidents.ts";
import { embedSite, pageSettings, savePageSettings, supportAddress, webAddress } from "../lib/page-settings.ts";
import { AppError } from "../lib/app-error.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, nora } from "./support/members.ts";

let database: TestDatabase;
const editor = asMember(camille);
const origin = "https://status.atelier-martin.fr";
let website = "", checkout = "", payments = "", shop = "";

before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, mail_queue, update_log, settings, templates restart identity cascade`;
});

async function shopPage() {
  const { sql } = database;
  website = (await addComponent(sql, editor, { name: "Website" })).id;
  shop = (await addComponent(sql, editor, { name: "Online shop", kind: "group" })).id;
  checkout = (await addComponent(sql, editor, { name: "Checkout", parentId: shop, description: "Paying" })).id;
  payments = (await addComponent(sql, editor, { name: "Payments", parentId: shop })).id;
}

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};

test("the top-level indicator follows Statuspage's documented rule, in its order", () => {
  assert.equal(indicatorOf([]), "none");
  assert.equal(indicatorOf(["operational", "operational"]), "none");
  assert.equal(indicatorOf(["major"]), "critical");
  assert.equal(indicatorOf(["major", "major"]), "critical");
  assert.equal(indicatorOf(["partial", "partial"]), "major");
  assert.equal(indicatorOf(["major", "operational"]), "major");
  assert.equal(indicatorOf(["partial", "operational"]), "minor");
  assert.equal(indicatorOf(["degraded", "operational"]), "minor");
  assert.equal(indicatorOf(["maintenance", "operational"]), "maintenance");
  // Maintenance only when nothing else is wrong.
  assert.equal(indicatorOf(["maintenance", "degraded"]), "minor");
});

test("an empty page says it is being set up, never 'operational'", async () => {
  const body = await api("status", { origin }) as { page: { url: string; id: string }; status: { indicator: string; description: string } };
  assert.equal(body.status.indicator, "none");
  assert.equal(body.status.description, "This status page is being set up");
  assert.equal(body.page.url, origin);
  assert.match(body.page.id, /^[0-9a-f]{12}$/u);
});

test("summary.json: page, components (groups list their services), open incidents, maintenance ahead, status — in Statuspage's shape", async () => {
  const { sql } = database;
  await shopPage();
  const now = new Date();
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Payments fail", status: "investigating", body: "Looking.", states: { [payments]: "major", [checkout]: "degraded" } }, new Date(now.getTime() - 3600000));
  await incidents.addUpdate(sql, editor, incidentId, { status: "identified", body: "Found.", states: { [payments]: "partial", [checkout]: "degraded" } }, new Date(now.getTime() - 1800000));
  const start = new Date(now.getTime() + 86400000);
  await incidents.planMaintenance(sql, editor, { title: "Upgrade", body: "Planned.", start, end: new Date(start.getTime() + 3600000), components: [website], autoPosts: false }, now);
  const body = await api("summary", { origin, now }) as Record<string, any>;
  assert.deepEqual(Object.keys(body).sort(), ["components", "incidents", "page", "scheduled_maintenances", "status"]);
  assert.deepEqual(body.status, { indicator: "minor", description: "Partial outage" });
  const group = body.components.find((c: any) => c.group);
  assert.equal(group.name, "Online shop");
  assert.deepEqual(group.components, [checkout, payments]);
  const pay = body.components.find((c: any) => c.id === payments);
  assert.equal(pay.status, "partial_outage");
  assert.equal(pay.group_id, shop);
  assert.equal(body.components.find((c: any) => c.id === checkout).status, "degraded_performance");
  assert.equal(body.components.find((c: any) => c.id === checkout).description, "Paying");
  assert.equal(body.components.find((c: any) => c.id === website).status, "operational");
  const [open] = body.incidents;
  assert.equal(open.name, "Payments fail");
  assert.equal(open.status, "identified");
  // Worst state reached: payments major → impact major (any major).
  assert.equal(open.impact, "major");
  assert.equal(open.shortlink, `${origin}/incidents/${incidentId}`);
  assert.equal(open.incident_updates.length, 2);
  assert.equal(open.incident_updates[0].status, "identified");
  assert.deepEqual(open.incident_updates[0].affected_components, [{ code: payments, name: "Payments", old_status: "major_outage", new_status: "partial_outage" }]);
  assert.deepEqual(open.incident_updates[1].affected_components.map((a: any) => [a.name, a.old_status, a.new_status]).sort(), [["Checkout", "operational", "degraded_performance"], ["Payments", "operational", "major_outage"]]);
  assert.deepEqual(open.components.map((c: any) => c.name).sort(), ["Checkout", "Payments"]);
  const [m] = body.scheduled_maintenances;
  assert.equal(m.name, "Upgrade");
  assert.equal(m.status, "scheduled");
  assert.equal(m.impact, "maintenance");
  assert.equal(m.scheduled_for, start.toISOString());
  // Nothing about who posted.
  assert.ok(!JSON.stringify(body).includes("mbr_"));
});

test("the lists: incidents, unresolved, maintenance upcoming and active; hidden and team-only services never appear", async () => {
  const { sql } = database;
  await shopPage();
  const secret = (await addComponent(sql, editor, { name: "Office Wi-Fi", teamOnly: true })).id;
  await updateComponent(sql, editor, website, { hidden: true });
  const now = new Date();
  const past = new Date(now.getTime() - 5 * 86400000);
  await incidents.backfill(sql, editor, { title: "Old one", body: "x", resolution: "Done.", states: { [checkout]: "partial" }, startedAt: past, resolvedAt: new Date(past.getTime() + 3600000) }, now);
  await incidents.openIncident(sql, editor, { title: "Wi-Fi down", status: "investigating", body: "x", states: { [secret]: "major" } }, now);
  const w0 = new Date(now.getTime() - 600000);
  await incidents.planMaintenance(sql, editor, { title: "Now", body: "x", start: new Date(now.getTime() + 1000), end: new Date(now.getTime() + 3600000), components: [payments], autoPosts: false }, w0);
  const later = new Date(now.getTime() + 60000);
  const incidentsBody = await api("incidents", { origin, now: later }) as any;
  assert.deepEqual(incidentsBody.incidents.map((i: any) => i.name), ["Old one"]);
  assert.equal(incidentsBody.incidents[0].status, "resolved");
  assert.equal(incidentsBody.incidents[0].deliver_notifications !== undefined, false);
  assert.equal(incidentsBody.incidents[0].incident_updates[0].deliver_notifications, false);
  assert.deepEqual((await api("unresolved", { origin, now: later }) as any).incidents, []);
  assert.equal((await api("active", { origin, now: later }) as any).scheduled_maintenances[0].status, "in_progress");
  assert.deepEqual((await api("upcoming", { origin, now: later }) as any).scheduled_maintenances, []);
  assert.equal((await api("maintenances", { origin, now: later }) as any).scheduled_maintenances.length, 1);
  const components = (await api("components", { origin, now: later }) as any).components.map((c: any) => c.name);
  assert.ok(!components.includes("Website") && !components.includes("Office Wi-Fi"), "hidden and team-only left out");
  const all = JSON.stringify(await api("summary", { origin, now: later }));
  assert.ok(!all.includes("Wi-Fi"), "a team-only incident never reaches the API");
});

test("the API is readable from any site, cached briefly", () => {
  assert.equal(apiHeaders["Access-Control-Allow-Origin"], "*");
  assert.match(apiHeaders["Cache-Control"], /public, max-age=30/u);
  assert.match(apiHeaders["Access-Control-Allow-Methods"], /GET/u);
});

test("the badge is a plain picture: no script, no link, words escaped", () => {
  const svg = badge("status", "All <systems> & \"more\"", "operational", "status: x");
  assert.ok(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\""));
  assert.ok(!/<script|href=|on[a-z]+=|<style|url\(/iu.test(svg));
  assert.ok(svg.includes("All &lt;systems&gt; &amp; &quot;more&quot;"));
  assert.ok(svg.includes("role=\"img\"") && svg.includes("<title>status: x</title>"));
  assert.ok(badge("état", "Panne majeure", "major", "t").includes("#a8260f"));
});

test("page settings: https addresses only, support as an address or an email, embedding sites as CSP sources", async () => {
  const { sql } = database;
  assert.equal(webAddress("https://atelier-martin.fr"), "https://atelier-martin.fr/");
  assert.equal(webAddress(""), null);
  for (const bad of ["http://atelier-martin.fr", "javascript:alert(1)", "https://user:pw@x.fr", "ftp://x.fr", "https://intranet", "x".repeat(400)]) assert.throws(() => webAddress(bad), AppError, bad);
  assert.equal(supportAddress("support@atelier-martin.fr"), "mailto:support@atelier-martin.fr");
  assert.equal(supportAddress("mailto:help@atelier-martin.fr"), "mailto:help@atelier-martin.fr");
  assert.throws(() => supportAddress("mailto:a@b.fr?bcc=x@y.fr"), AppError);
  assert.equal(embedSite("www.atelier-martin.fr"), "https://www.atelier-martin.fr");
  assert.equal(embedSite("https://*.atelier-martin.fr/"), "https://*.atelier-martin.fr");
  assert.equal(embedSite("http://localhost:4000"), "http://localhost:4000");
  for (const bad of ["'self'", "*", "https://*", "https://a.fr/path", "http://a.fr", "https://a.fr; script-src *", "https://a.*.fr", "data:"]) assert.throws(() => embedSite(bad), AppError, bad);
  await savePageSettings(sql, editor, { website: "https://www.atelier-martin.fr", support: "support@atelier-martin.fr", embedSites: "https://www.atelier-martin.fr\nshop.atelier-martin.fr" });
  assert.deepEqual(await pageSettings(sql), { website: "https://www.atelier-martin.fr/", support: "mailto:support@atelier-martin.fr", embedSites: ["https://www.atelier-martin.fr", "https://shop.atelier-martin.fr"] });
  await refuses("forbidden", () => savePageSettings(sql, asMember(nora), { website: "https://x.fr" }));
  await refuses("too_many", () => savePageSettings(sql, editor, { embedSites: Array.from({ length: 11 }, (_, i) => `https://s${i}.fr`).join("\n") }));
  // A value stored by hand that no longer passes is dropped when read.
  await sql`update settings set value = ${sql.json({ website: "javascript:alert(1)", support: null, embedSites: ["'unsafe-inline'", "https://ok.fr"] } as never)} where key = 'page'`;
  assert.deepEqual(await pageSettings(sql), { website: null, support: null, embedSites: ["https://ok.fr"] });
});
