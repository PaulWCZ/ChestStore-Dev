import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { addComponent, updateComponent } from "../lib/components.ts";
import { admit, checkForm, formToken } from "../lib/guard.ts";
import * as incidents from "../lib/incidents.ts";
import { flush, updateEmail, welcome } from "../lib/mailer.ts";
import { mailDelivery, mailState, setMailState } from "../lib/settings.ts";
import * as subs from "../lib/subscribers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
const editor = asMember(camille);
let website = "", checkout = "", secret = "";

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier-martin.test", perDay: 6 }, settings: { company: "Atelier Martin", publicUrl: "https://status.atelier-martin.test" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, mail_queue, form_counts, settings restart identity cascade`;
  chest.outbox.length = 0;
  website = (await addComponent(sql, editor, { name: "Website" })).id;
  checkout = (await addComponent(sql, editor, { name: "Checkout" })).id;
  secret = (await addComponent(sql, editor, { name: "Back office" })).id;
  await updateComponent(sql, editor, secret, { hidden: true });
});

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};

test("double opt-in: an address is pending until its link confirms it; the same answer whoever subscribes again", async () => {
  const { sql } = database;
  const now = new Date();
  const first = await subs.subscribe(sql, { email: " Lucie@Example.com ", language: "fr", components: [checkout] }, now);
  assert.equal(first.state, "new");
  assert.equal(first.send, true);
  assert.equal(first.subscriber.email, "Lucie@Example.com");
  assert.equal(first.subscriber.token.length, 32);
  assert.deepEqual(first.subscriber.components, [checkout]);
  // Again within minutes: no second email; later: one more.
  const again = await subs.subscribe(sql, { email: "lucie@example.com", language: "en", components: "all" }, new Date(now.getTime() + 60000));
  assert.deepEqual([again.state, again.send, again.subscriber.id, again.subscriber.components], ["pending", false, first.subscriber.id, null]);
  assert.equal((await subs.subscribe(sql, { email: "lucie@example.com", language: "en", components: "all" }, new Date(now.getTime() + 11 * 60000))).send, true);
  // Nothing goes to a pending address.
  await incidents.openIncident(sql, editor, { title: "x", status: "investigating", body: "x", states: { [checkout]: "major" } });
  const [{ count }] = (await sql`select count(*)::int as count from mail_queue`) as unknown as [{ count: number }];
  assert.equal(count, 0);
  const confirmed = await subs.confirm(sql, first.subscriber.token);
  assert.ok(confirmed.confirmedAt);
  const known = await subs.subscribe(sql, { email: "LUCIE@example.com", language: "en", components: "all" }, new Date(now.getTime() + 30 * 60000));
  assert.deepEqual([known.state, known.send], ["confirmed", true]);
  assert.equal((await subs.byToken(sql, first.subscriber.token))!.components, null, "a stranger cannot change a confirmed subscription");
});

test("a subscriber chooses what to follow among what is shown, and unsubscribing forgets the address", async () => {
  const { sql } = database;
  const s = (await subs.subscribe(sql, { email: "a@example.com", language: "en", components: "all" })).subscriber;
  await subs.confirm(sql, s.token);
  assert.deepEqual((await subs.choose(sql, s.token, [website, checkout])).components, [website, checkout]);
  await refuses("invalid", () => subs.choose(sql, s.token, [secret]));
  await refuses("invalid", () => subs.choose(sql, s.token, ["12345"]));
  await refuses("no_components", () => subs.choose(sql, s.token, []));
  assert.equal((await subs.choose(sql, s.token, "all")).components, null);
  await subs.unsubscribe(sql, s.token);
  assert.equal(await subs.byToken(sql, s.token), null);
  const [{ count }] = (await sql`select count(*)::int as count from subscribers`) as unknown as [{ count: number }];
  assert.equal(count, 0);
  await refuses("not_found", () => subs.unsubscribe(sql, s.token));
  await refuses("not_found", () => subs.confirm(sql, "short"));
  assert.equal(await subs.byToken(sql, "../../etc/passwd"), null);
});

test("the form refuses bad addresses; unconfirmed addresses are forgotten after 7 days", async () => {
  const { sql } = database;
  for (const bad of ["", "nobody", "a@b", "a b@example.com", "<a@example.com>", "a@example.com\nBcc: x@y.z", "x".repeat(250) + "@example.com", 42]) {
    await refuses("invalid_email", () => subs.subscribe(sql, { email: bad, language: "en", components: "all" }));
  }
  const old = new Date(Date.now() - 8 * 86400000);
  await subs.subscribe(sql, { email: "old@example.com", language: "en", components: "all" }, old);
  await subs.subscribe(sql, { email: "new@example.com", language: "en", components: "all" });
  const rows = await sql<{ email: string }[]>`select email from subscribers order by email`;
  assert.deepEqual(rows.map(r => r.email), ["new@example.com"]);
});

test("the form's guard: a signed time, then counts — the Chest's, else the tool's own", async () => {
  const { sql } = database;
  const token = formToken();
  assert.throws(() => checkForm(token), (e: unknown) => e instanceof AppError && e.code === "too_fast");
  assert.throws(() => checkForm("forged.value"), (e: unknown) => e instanceof AppError && e.code === "invalid");
  assert.throws(() => checkForm(undefined), (e: unknown) => e instanceof AppError && e.code === "invalid");
  const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
  for (let i = 0; i < subs.formLimits.perVisitorHour; i++) await admit(sql, headers);
  await refuses("too_many", () => admit(sql, headers));
  await admit(sql, new Headers({ "x-forwarded-for": "203.0.113.10" }));
  // The tool's own counters (a Chest that does not count visitors).
  for (let i = 0; i < subs.formLimits.perVisitorHour; i++) await subs.guard(sql, "198.51.100.1");
  await refuses("too_many", () => subs.guard(sql, "198.51.100.1"));
});

test("editors see and remove subscribers; nobody else", async () => {
  const { sql } = database;
  const s = (await subs.subscribe(sql, { email: "a@example.com", language: "en", components: "all" })).subscriber;
  assert.deepEqual((await subs.listSubscribers(sql, editor)).map(x => x.email), ["a@example.com"]);
  await refuses("forbidden", () => subs.listSubscribers(sql, asMember(nora)));
  await refuses("forbidden", () => subs.removeSubscriber(sql, asMember(nora), s.id));
  await subs.removeSubscriber(sql, editor, s.id);
  await refuses("not_found", () => subs.removeSubscriber(sql, editor, s.id));
});

test("emails: a confirmation in the visitor's language, then each update with its link and an unsubscribe link", async () => {
  const { sql } = database;
  const r = await subs.subscribe(sql, { email: "lucie@example.com", language: "fr", components: [checkout] });
  assert.equal(await welcome(sql, r.subscriber, r.state, "https://status.atelier-martin.test"), "sent");
  const confirmMail = chest.outbox.at(-1)!;
  assert.deepEqual(confirmMail.to, ["lucie@example.com"]);
  assert.equal(confirmMail.subject, "Confirmez votre abonnement aux alertes de Atelier Martin");
  assert.ok(confirmMail.text.includes(`https://status.atelier-martin.test/s/${r.subscriber.token}`));
  assert.equal(await mailState(sql), "ok");
  await subs.confirm(sql, r.subscriber.token);
  const { incidentId } = await incidents.openIncident(sql, editor, { title: "Paiement en panne", status: "investigating", body: "Nous cherchons.", states: { [checkout]: "major" } });
  assert.deepEqual(await flush(sql), { sent: 1, stopped: null });
  const mail = chest.outbox.at(-1)!;
  assert.equal(mail.subject, "[Atelier Martin] Analyse en cours : Paiement en panne");
  assert.ok(mail.text.includes("Nous cherchons."));
  assert.ok(mail.text.includes("Concerne : Checkout"));
  assert.ok(mail.text.includes(`https://status.atelier-martin.test/incidents/${incidentId}`));
  assert.ok(mail.text.includes(`https://status.atelier-martin.test/s/${r.subscriber.token}`));
  assert.deepEqual(await flush(sql), { sent: 0, stopped: null }, "sent once");
});

test("a member's email preference (studio.15): the confirmation link is transactional, update emails honour it", async () => {
  const { sql } = database;
  // Nora subscribes with her own address; in her Chest she chose "none".
  const quiet = { ...nora, email: "nora@atelier-martin.test", mailPreference: "none" as const };
  chest.members.push(quiet);
  chest.clearCaches();
  try {
    const r = await subs.subscribe(sql, { email: "nora@atelier-martin.test", language: "fr", components: "all" });
    assert.equal(await welcome(sql, r.subscriber, r.state, "https://status.atelier-martin.test"), "sent");
    assert.deepEqual(chest.outbox.at(-1)!.to, ["nora@atelier-martin.test"], "the answer to her own request goes whatever she chose");
    assert.equal(chest.held.length, 0);
    await subs.confirm(sql, r.subscriber.token);
    const sent = chest.outbox.length;
    await incidents.openIncident(sql, editor, { title: "Paiement en panne", status: "investigating", body: "Nous cherchons.", states: { [checkout]: "major" } });
    assert.deepEqual(await flush(sql), { sent: 1, stopped: null }, "handed to the Chest, which holds it");
    assert.equal(chest.outbox.length, sent, "an update is not sent to someone who chose no email");
    assert.deepEqual(chest.held.map(h => [h.member, h.reason]), [[nora.id, "none"]]);
    assert.deepEqual(await flush(sql), { sent: 0, stopped: null }, "and never retried");
  } finally {
    chest.members.splice(chest.members.indexOf(quiet), 1);
    chest.held.length = 0;
    chest.clearCaches();
  }
});

test("the Chest's daily quota stops the queue, which goes on later; a Chest without mail hides the form", async () => {
  const { sql } = database;
  for (let i = 0; i < 8; i++) await sql`insert into subscribers (email, token, confirmed_at) values (${`p${i}@example.com`}, ${String(i).repeat(32)}, now())`;
  chest.outbox.length = 0;
  await incidents.openIncident(sql, editor, { title: "Down", status: "investigating", body: "x", states: { [website]: "major" } });
  const first = await flush(sql);
  assert.equal(first.stopped, "quota");
  assert.ok(first.sent <= 6);
  const [{ count }] = (await sql`select count(*)::int as count from mail_queue`) as unknown as [{ count: number }];
  assert.equal(count, 8 - first.sent);
  // Without mail on the Chest.
  const bare = await fakeChest({ members: everyone, capabilities: ["members", "notifications"] });
  try {
    const r = await subs.subscribe(sql, { email: "z@example.com", language: "en", components: "all" });
    assert.equal(await welcome(sql, r.subscriber, r.state, "https://x.test"), "none");
    assert.equal(await mailState(sql), "none");
    assert.equal(await mailState(sql, new Date(Date.now() + 2 * 86400000)), "unknown", "tried again after a day");
    await setMailState(sql, "ok");
  } finally {
    await bare.close();
  }
});

test("studio.16: whether the Chest sends email is asked of it (mail.available) — spent for today, not connected, paused, or none at all", async () => {
  const { sql } = database;
  // The previous test used the day's six messages.
  assert.deepEqual(await mailDelivery(sql), { state: "paused", reason: "quota" });
  chest.delivery.mail = "not_connected";
  try {
    assert.deepEqual(await mailDelivery(sql), { state: "none", reason: "not_connected" });
    chest.delivery.mail = "suspended";
    assert.deepEqual(await mailDelivery(sql), { state: "paused", reason: "suspended" });
  } finally {
    chest.delivery.mail = "ready";
  }
  const bare = await fakeChest({ members: everyone, capabilities: ["members", "notifications"] });
  try {
    assert.deepEqual(await mailDelivery(sql), { state: "none", reason: "not_granted" });
  } finally {
    await bare.close();
  }
});

test("an update's email text: the maintenance window, no affected line when nothing is named", () => {
  const q = { language: "en", token: "t".repeat(32), update_id: "3", status: "scheduled" as const, body: "Upgrade.", posted_at: new Date("2026-10-01T08:00:00Z"), incident_id: "9", kind: "maintenance" as const, title: "Database", started_at: new Date("2026-10-02T20:00:00Z"), ends_at: new Date("2026-10-02T21:00:00Z") };
  const { subject, text } = updateEmail(q, [], "https://s.test", "Europe/Paris");
  assert.equal(subject, "[Atelier Martin] Planned: Database");
  assert.ok(text.includes("Planned for 2 Oct, 22:00"));
  assert.ok(!text.includes("Affects"));
});
