import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { addComponent, allComponents, updateComponent } from "../lib/components.ts";
import { exportAll, subscribersCsv } from "../lib/export.ts";
import { importStatuspage, readExport } from "../lib/importer.ts";
import * as incidents from "../lib/incidents.ts";
import { flush } from "../lib/mailer.ts";
import { followOptions } from "../lib/options.ts";
import { statusView } from "../lib/status-view.ts";
import * as subs from "../lib/subscribers.ts";
import { listTemplates, removeTemplate, saveTemplate } from "../lib/templates.ts";
import { pick } from "../lib/texts.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
const editor = asMember(camille);
const zone = "Europe/Paris";
let website = "", checkout = "";
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier-martin.test", perDay: 50 }, settings: { company: "Atelier Martin", locale: "en", publicUrl: "https://status.atelier-martin.test" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, mail_queue, update_log, settings, templates restart identity cascade`;
  chest.outbox.length = 0;
  website = (await addComponent(sql, editor, { name: "Website" })).id;
  checkout = (await addComponent(sql, editor, { name: "Checkout" })).id;
});

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};

async function subscriber(email: string, language: string, components: string[] | null = null) {
  const { sql } = database;
  const { subscriber: s } = await subs.subscribe(sql, { email, language, components });
  await subs.confirm(sql, s.token);
  return s;
}

test("texts in two languages: each visitor and subscriber reads theirs; the first is marked with its language otherwise", async () => {
  const { sql } = database;
  await subscriber("anne@example.fr", "fr");
  await subscriber("bob@example.com", "en");
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Checkout errors", status: "investigating", body: "Some orders fail.", states: { [checkout]: "major" }, second: { title: "Erreurs au paiement", body: "Certaines commandes échouent." } });
  const i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.language, "en");
  assert.equal(i.secondLanguage, "fr");
  assert.deepEqual(pick(i.title, i.titleSecond, i, "fr"), { text: "Erreurs au paiement", lang: "fr" });
  assert.deepEqual(pick(i.title, i.titleSecond, i, "en"), { text: "Checkout errors", lang: "en" });
  // An update without a French text: a French visitor reads the English one, marked English.
  await incidents.addUpdate(sql, editor, incidentId, { status: "identified", body: "Found it." });
  const j = await incidents.incidentFor(sql, editor, incidentId);
  assert.deepEqual(pick(j.updates[0]!.body, j.updates[0]!.bodySecond, j, "fr"), { text: "Found it.", lang: "en" });
  await flush(sql, { limit: 50 });
  const anne = chest.outbox.filter(m => JSON.stringify(m).includes("anne@example.fr"));
  assert.ok(anne.some(m => m.subject.includes("Erreurs au paiement") && m.text.includes("Certaines commandes échouent.")), "French subscriber reads French");
  const bob = chest.outbox.filter(m => JSON.stringify(m).includes("bob@example.com"));
  assert.ok(bob.some(m => m.subject.includes("Checkout errors") && m.text.includes("Some orders fail.")), "English subscriber reads English");
  // Correcting the second text is logged apart; emptying it removes it.
  const first = j.updates.at(-1)!;
  await incidents.editUpdate(sql, editor, first.id, "Des commandes échouent.", new Date(), { second: true });
  await incidents.editUpdate(sql, editor, first.id, "", new Date(), { second: true });
  const k = await incidents.incidentFor(sql, editor, incidentId);
  const edited = k.updates.find(u => u.id === first.id)!;
  assert.equal(edited.bodySecond, null);
  assert.equal(edited.body, "Some orders fail.");
  assert.deepEqual(edited.log.map(l => [l.second, l.previousBody]), [[true, "Certaines commandes échouent."], [true, "Des commandes échouent."]]);
  // A title in the second language may be added later.
  await incidents.renameIncident(sql, editor, incidentId, "Checkout errors", "Erreurs de paiement");
  assert.equal((await incidents.incidentFor(sql, editor, incidentId)).titleSecond, "Erreurs de paiement");
  await refuses("too_long", () => incidents.openIncident(sql, editor, { title: "x", status: "investigating", body: "x", states: { [website]: "major" }, second: { body: "é".repeat(5001) } }));
});

test("a maintenance's automatic posts are written in both its languages", async () => {
  const { sql } = database;
  const now = new Date();
  const start = new Date(now.getTime() + 3600000), end = new Date(start.getTime() + 3600000);
  const { incidentId } = await incidents.planMaintenance(sql, editor, { title: "Upgrade", body: "Planned.", start, end, components: [website], autoPosts: true, second: { title: "Mise à jour", body: "Prévue." } }, now);
  const words = (language: string) => (language === "fr" ? { started: "Commencée.", completed: "Terminée." } : { started: "Started.", completed: "Completed." });
  await incidents.autoPost(sql, words, new Date(end.getTime() + 60000));
  const m = await incidents.incidentFor(sql, editor, incidentId);
  assert.deepEqual(m.updates.slice(0, 2).map(u => [u.body, u.bodySecond]), [["Completed.", "Terminée."], ["Started.", "Commencée."]]);
});

test("a post-mortem: only after 'Resolved', one per incident, corrected with a log, never changing states or status, never emailed", async () => {
  const { sql } = database;
  await subscriber("anne@example.fr", "fr");
  const t0 = new Date(Date.now() - 4 * 3600000);
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Down", status: "investigating", body: "Down.", states: { [website]: "major" } }, t0);
  await refuses("not_resolved", () => incidents.writePostmortem(sql, editor, incidentId, { body: "Too early." }));
  await incidents.addUpdate(sql, editor, incidentId, { status: "resolved", body: "Back." }, new Date(t0.getTime() + 3600000));
  await flush(sql, { limit: 50 });
  const sent = chest.outbox.length;
  await incidents.writePostmortem(sql, editor, incidentId, { body: "A certificate expired. We renew it automatically now.", bodySecond: "Un certificat avait expiré." });
  await incidents.writePostmortem(sql, editor, incidentId, { body: "A certificate expired. It is now renewed automatically." });
  const i = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(i.status, "resolved");
  const pm = incidents.postmortemOf(i)!;
  assert.equal(pm.body, "A certificate expired. It is now renewed automatically.");
  assert.equal(pm.bodySecond, "Un certificat avait expiré.");
  assert.equal(pm.log.length, 1);
  assert.equal(i.updates.filter(u => u.status === "postmortem").length, 1);
  await flush(sql, { limit: 50 });
  assert.equal(chest.outbox.length, sent, "nobody is emailed");
  const view = await statusView(sql, zone);
  assert.equal(view.overall, "operational");
  // The post-mortem can go (and come back, logged); it never counts as the
  // incident's last update.
  await incidents.removeUpdate(sql, editor, pm.id);
  await incidents.restoreUpdate(sql, editor, pm.id);
  assert.equal((await incidents.incidentFor(sql, editor, incidentId)).status, "resolved");
  // Reopened after its post-mortem: the steps continue, the post-mortem stays.
  await incidents.addUpdate(sql, editor, incidentId, { status: "investigating", body: "Again.", reopen: true });
  const k = await incidents.incidentFor(sql, editor, incidentId);
  assert.equal(k.status, "investigating");
  assert.deepEqual(k.updates[0]!.states, { [website]: "major" });
  await refuses("forbidden", () => incidents.writePostmortem(sql, asMember(nora), incidentId, { body: "x" }));
});

test("templates: saved from what was typed, named after the title, replaced by name, services that no longer exist dropped", async () => {
  const { sql } = database;
  const gone = (await addComponent(sql, editor, { name: "Old" })).id;
  const a = await saveTemplate(sql, editor, { title: "Payments are slow", body: "Paying takes longer than usual.", states: { [checkout]: "degraded", [gone]: "partial" }, titleSecond: "Paiements lents" });
  assert.equal(a.name, "Payments are slow");
  await saveTemplate(sql, editor, { name: "payments are slow", title: "Payments are slow", body: "Newer wording.", states: {} });
  await sql`delete from components where id = ${gone}`;
  const list = await listTemplates(sql, editor);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.body, "Newer wording.");
  const b = await saveTemplate(sql, editor, { title: "Site down", body: "The site does not answer.", states: { [website]: "major", [gone]: "major" } });
  assert.deepEqual((await listTemplates(sql, editor)).find(x => x.id === b.id)!.states, { [website]: "major" });
  await refuses("forbidden", () => saveTemplate(sql, asMember(nora), { title: "x", body: "y" }));
  await refuses("forbidden", () => listTemplates(sql, asMember(nora)));
  await refuses("empty", () => saveTemplate(sql, editor, { title: " ", body: "y" }));
  await refuses("invalid", () => saveTemplate(sql, editor, { title: "x", body: "y", states: { [website]: "broken" } }));
  const deleted = await removeTemplate(sql, editor, b.id);
  await refuses("not_found", () => removeTemplate(sql, editor, b.id));
  // The editor's Undo saves it again, as it was.
  await saveTemplate(sql, editor, deleted);
  const again = (await listTemplates(sql, editor)).find(x => x.name === "Site down")!;
  assert.deepEqual([again.title, again.body, again.states], ["Site down", "The site does not answer.", { [website]: "major" }]);
});

test("a service for the team only: on the team's page, never on the public page, its feeds, its history or its subscribers' mail", async () => {
  const { sql } = database;
  const wifi = (await addComponent(sql, editor, { name: "Office Wi-Fi", teamOnly: true })).id;
  // A group cannot be for the team only: its services decide.
  const group = await addComponent(sql, editor, { name: "Internal", kind: "group", teamOnly: true });
  assert.equal(group.teamOnly, false);
  await subscriber("anne@example.fr", "fr");
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Wi-Fi down", status: "investigating", body: "x", states: { [wifi]: "major" } });
  const both = await incidents.openIncident(sql, editor, { title: "Everything down", status: "investigating", body: "x", states: { [wifi]: "major", [website]: "major" } });
  const pub = await statusView(sql, zone);
  assert.deepEqual(pub.open.map(i => i.title), ["Everything down"]);
  assert.ok(!pub.entries.some(e => e.name === "Office Wi-Fi"));
  const team = await statusView(sql, zone, new Date(), { team: true });
  assert.deepEqual(team.open.map(i => i.title).sort(), ["Everything down", "Wi-Fi down"]);
  assert.ok(team.entries.some(e => e.name === "Office Wi-Fi" && e.self?.teamOnly));
  assert.equal(await incidents.publicIncident(sql, incidentId), null);
  assert.ok(await incidents.publicIncident(sql, both.incidentId));
  assert.deepEqual((await incidents.recentActivity(sql)).map(i => i.title), ["Everything down"]);
  assert.ok(!(await followOptions(sql)).some(o => o.label === "Office Wi-Fi"));
  const { rows } = { rows: await sql<{ update_id: string }[]>`select update_id from mail_queue` };
  const first = (await incidents.incidentFor(sql, editor, incidentId)).updates[0]!.id;
  assert.ok(!rows.some(r => String(r.update_id) === first), "no mail about a team-only incident");
  // Made public again, its incidents are public again.
  await updateComponent(sql, editor, wifi, { teamOnly: false });
  assert.ok(await incidents.publicIncident(sql, incidentId));
});

test("import from Statuspage: components with their groups, resolved incidents with every update and the post-mortem, completed maintenance — once", async () => {
  const { sql } = database;
  const files = `[${fixture("statuspage-components.json")},${fixture("statuspage-incidents.json")},${fixture("statuspage-maintenances.json")}]`;
  const result = await importStatuspage(sql, editor, files);
  // Website and Checkout exist here already: matched by name, left where
  // the team put them; the group and Card payments are created.
  assert.deepEqual(result, { incidents: 2, maintenances: 1, components: 2, already: 0, open: 2, skipped: 0 });
  const components = await allComponents(sql);
  const byName = (n: string) => components.find(c => c.name === n)!;
  assert.equal(byName("Online shop").kind, "group");
  assert.equal(byName("Checkout").parentId, null);
  assert.equal(byName("Card payments").parentId, byName("Online shop").id);
  assert.equal(byName("Website").id, website, "matched by name, not created twice");
  assert.equal(byName("Checkout").id, checkout);
  const all = await incidents.allFor(sql, editor);
  const payments = all.find(i => i.title === "Card payments failing")!;
  assert.equal(payments.status, "resolved");
  assert.equal(payments.backfilled, true);
  assert.equal(payments.sourceId, "statuspage:yq8hg1dmw0v3");
  assert.equal(payments.startedAt.toISOString(), "2026-08-14T14:32:17.897Z");
  assert.equal(payments.resolvedAt!.toISOString(), "2026-08-14T16:40:01.998Z");
  assert.deepEqual(payments.updates.map(u => u.status), ["postmortem", "resolved", "monitoring", "identified", "investigating"]);
  const card = byName("Card payments").id;
  assert.deepEqual(payments.updates.find(u => u.status === "investigating")!.states, { [card]: "major", [checkout]: "degraded" });
  assert.deepEqual(payments.updates.find(u => u.status === "identified")!.states, { [card]: "major", [checkout]: "degraded" });
  assert.deepEqual(payments.updates.find(u => u.status === "monitoring")!.states, { [card]: "partial", [checkout]: "degraded" });
  assert.match(incidents.postmortemOf(payments)!.body, /certificate/u);
  const site = all.find(i => i.title === "Website unreachable for some visitors")!;
  // No affected_components: the incident's impact ("major") says a partial outage.
  assert.deepEqual(site.updates.at(-1)!.states, { [website]: "partial" });
  const maintenance = all.find(i => i.kind === "maintenance")!;
  assert.equal(maintenance.title, "Database upgrade");
  assert.equal(maintenance.status, "completed");
  assert.deepEqual(maintenance.components.sort(), [checkout, card].sort());
  assert.deepEqual(maintenance.updates.map(u => u.status), ["completed", "in_progress", "scheduled"]);
  // Nobody is told; the history and the uptime count them.
  assert.equal((await sql`select count(*)::int as n from mail_queue`)[0]!.n, 0);
  // The same files again add nothing.
  assert.deepEqual(await importStatuspage(sql, editor, files), { incidents: 0, maintenances: 0, components: 0, already: 3, open: 2, skipped: 0 });
  // Just the incidents file: components are created without their group.
  await sql`truncate incidents, components restart identity cascade`;
  const alone = await importStatuspage(sql, editor, fixture("statuspage-incidents.json"));
  assert.equal(alone.incidents, 2);
  assert.ok((await allComponents(sql)).every(c => c.kind === "component" && c.parentId === null));
});

test("import refuses what is not Statuspage's JSON, and anyone but an editor", async () => {
  const { sql } = database;
  await refuses("invalid_file", () => importStatuspage(sql, editor, "not json"));
  await refuses("invalid_file", () => importStatuspage(sql, editor, "{\"hello\": 1}"));
  await refuses("empty", () => importStatuspage(sql, editor, ""));
  await refuses("forbidden", () => importStatuspage(sql, asMember(nora), fixture("statuspage-incidents.json")));
  assert.equal(readExport(fixture("statuspage-incidents.json")).incidents.length, 3);
  // Broken entries are skipped, not fatal.
  const odd = JSON.stringify({ incidents: [{ id: "a", status: "resolved", name: "No times" }, { status: "resolved" }, 42] });
  assert.deepEqual(await importStatuspage(sql, editor, odd), { incidents: 0, maintenances: 0, components: 0, already: 0, open: 0, skipped: 2 });
});

test("download everything: services, incidents with removed updates and the log, templates, settings; subscribers as a safe CSV", async () => {
  const { sql } = database;
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Down", status: "investigating", body: "Down.", states: { [website]: "major" } });
  const { updateId } = await incidents.addUpdate(sql, editor, incidentId, { status: "identified", body: "Found." });
  await incidents.removeUpdate(sql, editor, updateId);
  await saveTemplate(sql, editor, { title: "Site down", body: "x" });
  const data = await exportAll(sql, editor) as { components: unknown[]; incidents: incidents.Incident[]; templates: unknown[]; format: string };
  assert.equal(data.format, "chest-status-export");
  assert.equal(data.components.length, 2);
  assert.equal(data.templates.length, 1);
  assert.equal(data.incidents[0]!.updates.length, 2);
  assert.ok(data.incidents[0]!.updates.some(u => u.removedAt !== null));
  assert.ok(!JSON.stringify(data).includes("Camille"), "members appear as ids only");
  await subscriber("=1+2@evil.fr", "en");
  await subscriber("anne@example.fr", "fr", [website]);
  const csv = await subscribersCsv(sql, editor);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "email,language,follows,subscribed_at,confirmed_at");
  assert.ok(lines.some(l => l.startsWith("anne@example.fr,fr,Website,")));
  assert.ok(!lines.some(l => l.startsWith("=")), "no formula");
  await refuses("forbidden", () => exportAll(sql, asMember(nora)));
  await refuses("forbidden", () => subscribersCsv(sql, asMember(nora)));
});

test("heartbeats: a secret address a job calls; silence past its deadline is told once, a call brings it back", async () => {
  const { sql } = database;
  const { createHeartbeat, removeHeartbeat, listHeartbeats, beat, silent } = await import("../lib/heartbeats.ts");
  const { token } = await createHeartbeat(sql, editor, website, 60);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  const [stored] = await sql<{ token_hash: string }[]>`select token_hash from heartbeats`;
  assert.notEqual(stored!.token_hash, token, "only its hash is kept");
  const t0 = new Date();
  assert.deepEqual(await beat(sql, token, t0), { componentId: website, back: false });
  assert.equal(await beat(sql, "x".repeat(43), t0), null);
  assert.equal(await beat(sql, "../etc", t0), null);
  // Within the hour and its 5-minute grace: nothing.
  assert.deepEqual(await silent(sql, new Date(t0.getTime() + 64 * 60000)), []);
  const late = await silent(sql, new Date(t0.getTime() + 66 * 60000));
  assert.deepEqual(late.map(l => [l.componentId, l.since.getTime()]), [[website, t0.getTime() + 3600000]]);
  assert.deepEqual(await silent(sql, new Date(t0.getTime() + 120 * 60000)), [], "told once");
  assert.ok((await listHeartbeats(sql))[0]!.downSince);
  assert.deepEqual(await beat(sql, token, new Date(t0.getTime() + 130 * 60000)), { componentId: website, back: true });
  assert.equal((await listHeartbeats(sql))[0]!.downSince, null);
  // A new address replaces the old one.
  const renewed = await createHeartbeat(sql, editor, website, 1440);
  assert.equal(await beat(sql, token), null);
  assert.ok(await beat(sql, renewed.token));
  await refuses("invalid", () => createHeartbeat(sql, editor, website, 7));
  await refuses("forbidden", () => createHeartbeat(sql, asMember(nora), website, 60));
  await refuses("not_found", () => createHeartbeat(sql, editor, "999", 60));
  await removeHeartbeat(sql, editor, website);
  assert.equal(await beat(sql, renewed.token), null);
});
