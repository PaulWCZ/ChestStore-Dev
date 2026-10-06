import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import { addComponent, updateComponent } from "../src/lib/components.ts";
import * as incidents from "../src/lib/incidents.ts";
import { flush, updateEmail, welcome } from "../src/lib/mailer.ts";
import { mailDelivery, mailState, setMailState } from "../src/lib/settings.ts";
import * as subs from "../src/lib/subscribers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
const editor = asMember(camille);
let website = "", checkout = "", secret = "";

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier-martin.test", perDay: 6 }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", publicUrl: "https://status.atelier-martin.test" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, mail_queue, settings restart identity cascade`;
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

test("the form spends its budget only on a good request — \"new\" for an unknown address, \"again\" for a known one — and mails an address three times a day at most", async () => {
  const { sql } = database;
  const spent: string[] = [];
  const charge = async (kind: "new" | "again", _subject: string) => { spent.push(kind); };
  await refuses("invalid_email", () => subs.subscribe(sql, { email: "not an address", language: "en", components: "all" }, new Date(), charge));
  assert.deepEqual(spent, [], "a refused request costs nothing");
  const day = new Date("2026-10-06T08:00:00Z");
  const first = await subs.subscribe(sql, { email: "ana@example.com", language: "en", components: "all" }, day, charge);
  assert.equal(first.send, true);
  const sends: boolean[] = [first.send];
  for (let k = 1; k <= 6; k++) sends.push((await subs.subscribe(sql, { email: "Ana@Example.com", language: "en", components: "all" }, new Date(day.getTime() + k * 11 * 60000), charge)).send);
  assert.deepEqual(spent, ["new", "again", "again", "again", "again", "again", "again"]);
  assert.deepEqual(sends, [true, true, true, false, false, false, false], "three confirmation emails a day, whoever asks");
  assert.equal((await subs.subscribe(sql, { email: "ana@example.com", language: "en", components: "all" }, new Date(day.getTime() + 86400000), charge)).send, true, "the next day, one more");
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

test("subscribers' emails go to the address they gave, replies to the company's address; the mail says where replies go", async () => {
  const { sql } = database;
  const r = await subs.subscribe(sql, { email: "nora@atelier-martin.test", language: "fr", components: "all" });
  assert.equal(await welcome(sql, r.subscriber, r.state, "https://status.atelier-martin.test"), "sent");
  assert.deepEqual(chest.outbox.at(-1)!.to, ["nora@atelier-martin.test"]);
  assert.equal(chest.outbox.at(-1)!.replyTo, "contact@atelier-martin.test", "the connector's reply address: the company's inbox");
  await subs.confirm(sql, r.subscriber.token);
  await incidents.openIncident(sql, editor, { title: "Paiement en panne", status: "investigating", body: "Nous cherchons.", states: { [checkout]: "major" } });
  assert.deepEqual(await flush(sql), { sent: 1, stopped: null });
  const update = chest.outbox.at(-1)!;
  assert.equal(update.replyTo, "contact@atelier-martin.test");
  assert.match(update.text, /Une question\u202f\? Répondez à cet e-mail\u202f: il arrive chez Atelier Martin\./u);
  assert.deepEqual(await flush(sql), { sent: 0, stopped: null }, "never sent twice");
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
  const bare = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"] });
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
  const bare = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"] });
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
