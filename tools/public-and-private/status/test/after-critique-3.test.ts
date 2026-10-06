import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { toApp as hooksRoute } from "./support/app.ts";
import { AppError } from "../src/lib/app-error.ts";
import { addComponent, allComponents, inLocale, updateComponent } from "../src/lib/components.ts";
import * as hooks from "../src/lib/hooks.ts";
import * as incidents from "../src/lib/incidents.ts";
import { statusView } from "../src/lib/status-view.ts";
import { tellTools } from "../src/lib/tell-tools.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, nora, tom } from "./support/members.ts";

// Round 3 of the critique: services in two languages; no history before a
// service existed; updates delivered to Slack, Teams or a web address
// (Proposal (studio): webhooks); incidents told to the other tools
// (Proposal (studio): events between tools, "status.incident").
let database: TestDatabase;
let chest: FakeChest;
const editor = asMember(camille);
const zone = "Europe/Paris";
const slack = "https://hooks.slack.com/services/T0001/B0001/abcdefghijklmnopqrstuvwx";
let payments = "", website = "", office = "";

before(async () => {
  // Events are named after the tool that publishes them.
  process.env["CHEST_TOOL"] = "status";
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "notifications"], chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en", publicUrl: "https://status.atelier-martin.test" }, webhooks: { max: 200, to: hooksRoute }, emits: ["status.incident"], receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, mail_queue, hook_subscribers, hook_queue, form_counts, settings restart identity cascade`;
  chest.published.length = 0;
  // Camille writes French; Tom English.
  payments = (await addComponent(sql, editor, { name: "Paiement", description: "Carte et PayPal", second: { name: "Payments", description: "Card and PayPal" } })).id;
  website = (await addComponent(sql, asMember(tom), { name: "Website" })).id;
  office = (await addComponent(sql, editor, { name: "Réseau du bureau", teamOnly: true })).id;
});

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};
const open = (states: Record<string, string>, title = "Paiements en échec") => incidents.openIncident(database.sql, editor, { title, status: "investigating", body: "Nous regardons.", states, second: { title: "Payments failing", body: "We are looking into it." } });

test("a service has a name and a description in two languages: each reader gets theirs, the writer's otherwise", async () => {
  const { sql } = database;
  const [p] = (await allComponents(sql)).filter(c => c.id === payments);
  assert.deepEqual([p!.language, p!.name, p!.nameSecond, p!.descriptionSecond], ["fr", "Paiement", "Payments", "Card and PayPal"]);
  assert.deepEqual([inLocale(p!, "en").name, inLocale(p!, "en").description, inLocale(p!, "en").lang], ["Payments", "Card and PayPal", "en"]);
  assert.deepEqual([inLocale(p!, "fr").name, inLocale(p!, "fr").lang], ["Paiement", "fr"]);
  // Tom's English service has no French: a French reader gets it marked English.
  const w = (await allComponents(sql, { locale: "fr" })).find(c => c.id === website)!;
  assert.deepEqual([w.name, w.lang], ["Website", "en"]);
  // The public page and the team's view name them in the reader's language.
  const en = await statusView(sql, zone, new Date(), { locale: "en" });
  const fr = await statusView(sql, zone, new Date(), { locale: "fr" });
  assert.deepEqual(en.entries.map(e => e.name), ["Payments", "Website"]);
  assert.deepEqual(fr.entries.map(e => e.name), ["Paiement", "Website"]);
  // An empty second version removes it; left out, it stays.
  await updateComponent(sql, editor, payments, { description: "Carte bancaire" });
  assert.equal((await allComponents(sql)).find(c => c.id === payments)!.nameSecond, "Payments");
  await updateComponent(sql, editor, payments, { second: { name: "", description: "" } });
  assert.equal(inLocale((await allComponents(sql)).find(c => c.id === payments)!, "en").name, "Paiement");
  await refuses("too_long", () => updateComponent(sql, editor, payments, { second: { name: "x".repeat(81) } }));
  // A row made before (no language) is in the Chest's language.
  await sql`update components set language = null where id = ${website}`;
  assert.equal((await allComponents(sql)).find(c => c.id === website)!.language, "en");
});

test("a service added today shows no history before it existed: empty days, uptime “since” today", async () => {
  const { sql } = database;
  const view = await statusView(sql, zone, new Date(), { locale: "en" });
  const self = view.entries.find(e => e.id === website)!.self!;
  assert.equal(self.days.filter(d => d.state !== "none").length, 1, "only today has data");
  assert.equal(self.since, self.days.at(-1)!.date);
  assert.equal(self.uptime, 100);
  // A service that existed for the whole bar says nothing of "since".
  await sql`update components set created_at = now() - interval '120 days' where id = ${website}`;
  const old = (await statusView(sql, zone, new Date())).entries.find(e => e.id === website)!.self!;
  assert.equal(old.since, null);
  assert.equal(old.days.filter(d => d.state === "none").length, 0);
});

test("updates in Slack, Teams or at a web address: checked by the Chest, in the subscriber's language, never about the team's services", async () => {
  const { sql } = database;
  await refuses("hook_slack", () => hooks.subscribeHook(sql, { kind: "slack", url: "https://example.com/x", language: "en", components: "all" }));
  await refuses("hook_address", () => hooks.subscribeHook(sql, { kind: "generic", url: "http://10.0.0.1/x", language: "en", components: "all" }));
  await refuses("hook_teams", () => hooks.subscribeHook(sql, { kind: "teams", url: slack, language: "en", components: "all" }));
  await refuses("invalid", () => hooks.subscribeHook(sql, { kind: "irc", url: slack, language: "en", components: "all" }));
  const inSlack = await hooks.subscribeHook(sql, { kind: "slack", url: slack, language: "en", components: [payments] });
  assert.equal(inSlack.token.length, 32);
  assert.ok(!JSON.stringify(await sql`select * from hook_subscribers`).includes("abcdefghijklmnopqrstuvwx"), "the tool never keeps the secret part");
  assert.equal(await hooks.takeSecret(sql, inSlack.token), null, "Slack has no secret key");
  const own = await hooks.subscribeHook(sql, { kind: "generic", url: "https://ops.client-shop.com/status-hook", language: "fr", components: "all" });
  const secret = await hooks.takeSecret(sql, own.token);
  assert.match(secret!, /^whsec_/u);
  assert.equal(await hooks.takeSecret(sql, own.token), null, "shown once");
  // An incident on Payments: both are told; Slack in English, the web address in French with JSON.
  await open({ [payments]: "major" });
  assert.equal((await hooks.flushHooks(sql)).sent, 2);
  const toSlack = chest.webhooks.deliveries.find(d => d.target === inSlack.target)!;
  assert.equal(toSlack.event, "incident.update");
  assert.match(toSlack.text, /^Atelier Martin — Investigating: Payments failing\nWe are looking into it\.\nAffects: Payments\n/u);
  assert.match(toSlack.text, /https:\/\/status\.atelier-martin\.test\/incidents\/\d+$/u);
  const toOwn = chest.webhooks.deliveries.find(d => d.target === own.target)!;
  const data = toOwn.data as { incident: { title: string; status: string; url: string }; components: { name: string; state: string }[]; update: { body: string } };
  assert.deepEqual([data.incident.title, data.update.body, data.components[0]!.name, data.components[0]!.state], ["Paiements en échec", "Nous regardons.", "Paiement", "major"]);
  assert.match(toOwn.request!.headers["Chest-Webhook-Signature"]!, /^t=\d+,v1=[0-9a-f]{64}$/u);
  // An incident only about the office network, and a backfilled one, reach nobody.
  await open({ [office]: "major" }, "Wifi en panne");
  await incidents.backfill(sql, editor, { title: "Hier", body: "Panne.", resolution: "Réparé.", states: { [payments]: "major" }, startedAt: new Date(Date.now() - 86400000), resolvedAt: new Date(Date.now() - 80000000) });
  assert.equal((await hooks.flushHooks(sql)).sent, 0);
  // Slack follows Payments only: an incident on the website is not posted there.
  await open({ [website]: "degraded" }, "Site lent");
  await hooks.flushHooks(sql);
  assert.equal(chest.webhooks.deliveries.filter(d => d.target === inSlack.target).length, 1);
});

test("a channel the Chest stops is marked on its page; Try again; stop forgets it; editors see and remove them", async () => {
  const { sql } = database;
  const h = await hooks.subscribeHook(sql, { kind: "slack", url: slack, language: "en", components: "all" });
  chest.webhooks.respond(h.target, 410);
  await open({ [payments]: "partial" });
  await hooks.flushHooks(sql);
  const stopped = (await hooks.hookByToken(sql, h.token))!;
  assert.ok(stopped.disabledAt, "webhook.disabled marked it");
  assert.equal(stopped.lastError, "http_410");
  // Stopped: later updates are not queued for it.
  await open({ [payments]: "major" }, "Encore");
  assert.equal(await hooks.hooksQueued(sql), 0);
  chest.webhooks.respond(h.target, 200);
  await hooks.retryHook(sql, h.token);
  assert.equal((await hooks.hookByToken(sql, h.token))!.disabledAt, null);
  await hooks.chooseHook(sql, h.token, [payments]);
  assert.deepEqual((await hooks.hookByToken(sql, h.token))!.components, [payments]);
  await refuses("forbidden", () => hooks.listHooks(sql, asMember(nora)));
  assert.equal((await hooks.listHooks(sql, editor)).length, 1);
  await hooks.unsubscribeHook(sql, h.token);
  assert.ok(!chest.webhooks.targets.some(x => x.id === h.target), "the Chest forgets the address");
  assert.equal(await hooks.hookByToken(sql, h.token), null);
  const other = await hooks.subscribeHook(sql, { kind: "slack", url: slack.replace("B0001", "B0002"), language: "en", components: "all" });
  await hooks.removeHook(sql, editor, other.id);
  assert.equal((await hooks.listHooks(sql, editor)).length, 0);
});

test("studio.16: whether the Chest delivers is asked of it — paused by its owner, nothing is added or lost; ready again, it says how many", async () => {
  const { sql } = database;
  const h = await hooks.subscribeHook(sql, { kind: "slack", url: slack, language: "en", components: "all" });
  assert.deepEqual(await hooks.hooksDelivery(sql), { state: "ok", targets: chest.webhooks.targets.length, max: 200 });
  chest.delivery.webhooks = "suspended";
  try {
    assert.deepEqual(await hooks.hooksDelivery(sql), { state: "paused", targets: null, max: null });
    await refuses("hooks_paused", () => hooks.subscribeHook(sql, { kind: "slack", url: slack.replace("B0001", "B0003"), language: "en", components: "all" }));
    await open({ [payments]: "major" });
    const before = chest.webhooks.deliveries.length;
    assert.deepEqual(await hooks.flushHooks(sql), { sent: 0, stopped: "later" });
    assert.equal(await hooks.hooksQueued(sql), 1, "kept for when the Chest delivers again");
    assert.equal(chest.webhooks.deliveries.length, before);
  } finally {
    chest.delivery.webhooks = "ready";
  }
  assert.equal((await hooks.flushHooks(sql)).sent, 1);
  assert.ok(chest.webhooks.deliveries.some(d => d.target === h.target));
});

test("keys survive a restore: an update id given again to another update still reaches the channel", async () => {
  const { sql } = database;
  const h = await hooks.subscribeHook(sql, { kind: "slack", url: slack, language: "en", components: "all" });
  await open({ [payments]: "major" }, "Première panne");
  assert.equal((await hooks.flushHooks(sql)).sent, 1);
  // A restore from a backup taken before that incident: its ids are given again, to another one.
  await sql`truncate incidents restart identity cascade`;
  await open({ [payments]: "major" }, "Deuxième panne");
  assert.equal((await hooks.flushHooks(sql)).sent, 1);
  const told = chest.webhooks.deliveries.filter(d => d.target === h.target);
  assert.equal(told.length, 2, "delivered, not taken for the first update");
  assert.match(told[1]!.text, /Deuxième panne|Payments failing/u);
});

test("a Chest without webhooks: refused in words, and the page stops offering it", async () => {
  const { sql } = database;
  const plain = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members"] });
  try {
    await refuses("no_hooks", () => hooks.subscribeHook(sql, { kind: "slack", url: slack, language: "en", components: "all" }));
    assert.equal(await hooks.hooksState(sql), "none");
  } finally {
    await plain.close();
  }
});

test("status.incident tells the other tools: opened, updated, resolved, removed — public incidents only, in both languages", async () => {
  const { sql } = database;
  const { incidentId } = await open({ [payments]: "major" });
  await tellTools(sql, incidentId, "opened");
  const opened = chest.published.at(-1)!;
  assert.equal(opened.type, "status.incident");
  const d = opened.data as { v: number; action: string; incident: { id: string; title: string; language: string; titles: Record<string, string>; status: string; impact: string; url: string; services: { names: Record<string, string>; state: string }[] }; update: { at: string } };
  assert.deepEqual([d.v, d.action, d.incident.id, d.incident.title, d.incident.language, d.incident.status, d.incident.impact], [1, "opened", incidentId, "Paiements en échec", "fr", "investigating", "major"]);
  assert.deepEqual(d.incident.titles, { fr: "Paiements en échec", en: "Payments failing" });
  assert.equal(d.incident.url, `https://status.atelier-martin.test/incidents/${incidentId}`);
  assert.deepEqual(d.incident.services, [{ id: payments, names: { fr: "Paiement", en: "Payments" }, state: "major" }]);
  assert.ok(!JSON.stringify(d).includes("mbr_"), "no member");
  assert.ok(!JSON.stringify(d).includes("Nous regardons"), "no update text");
  // The same news again is one event.
  await tellTools(sql, incidentId, "opened");
  assert.equal(chest.published.filter(p => p.type === "status.incident").length, 1);
  await incidents.addUpdate(sql, editor, incidentId, { status: "identified", body: "Trouvé." });
  await tellTools(sql, incidentId);
  assert.equal((chest.published.at(-1)!.data as { action: string }).action, "updated");
  await incidents.addUpdate(sql, editor, incidentId, { status: "resolved", body: "Réglé." });
  await tellTools(sql, incidentId);
  const resolved = chest.published.at(-1)!.data as { action: string; incident: { impact: string; resolved_at: string | null } };
  assert.equal(resolved.action, "resolved");
  assert.equal(resolved.incident.impact, "operational");
  assert.ok(resolved.incident.resolved_at);
  await incidents.removeIncident(sql, editor, incidentId);
  await tellTools(sql, incidentId);
  assert.equal((chest.published.at(-1)!.data as { action: string }).action, "removed");
  // Never about the team's own services, never a backfill.
  const before = chest.published.length;
  const inside = await open({ [office]: "major" }, "Wifi");
  await tellTools(sql, inside.incidentId, "opened");
  const past = await incidents.backfill(sql, editor, { title: "Hier", body: "Panne.", resolution: "Réparé.", states: { [payments]: "major" }, startedAt: new Date(Date.now() - 86400000), resolvedAt: new Date(Date.now() - 80000000) });
  await tellTools(sql, past.incidentId);
  assert.equal(chest.published.length, before);
});
