import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST as events } from "../app/chest-events/route.ts";
import { POST as hooks } from "../app/chest-webhooks/route.ts";
import { AppError } from "../lib/app-error.ts";
import * as notices from "../lib/notices.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, nora } from "./support/members.ts";

// Notices to Slack, Teams or another service (Proposal (studio): webhooks):
// an administrator adds a channel and chooses what it is told; the Chest
// checks and delivers. What leaves: the number, the subject, who asked and
// a link — never a message.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en" }, webhooks: { max: 10, to: hooks } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => chest.notifications.splice(0));

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const slack = "https://hooks.slack.com/services/T0001/B0001/abcdefghijklmnopqrstuvwx";
let n = 0;
const request = (subject: string, member: string | null = null) => ({
  v: 1, form: { id: "5", title: "Contact us" }, answer: { id: "ntc" + String(++n).padStart(8, "0"), at: "2026-09-29T10:00:00.000Z", language: "en", path: null },
  subject, details: "Six oak chairs, delivered in October. Call me on 06 12 34 56 78.",
  requester: member ? { name: null, email: null, member } : { name: "Nina Roux", email: "nina@example.com", member: null }, fields: [],
});
const lastNumber = async () => (await database.sql<{ number: number; id: string }[]>`select number, id from tickets order by id desc limit 1`)[0]!;
const deliveriesTo = (id: string) => chest.webhooks.deliveries.filter(d => d.target === id);

test("administrators only; the address is checked before the Chest is asked; a generic receiver's secret is said once", async () => {
  const { sql } = database;
  await assert.rejects(notices.addTarget(sql, asMember(hugo), { url: slack, kind: "slack", label: "Support", events: ["new"] }), refused("forbidden"));
  await assert.rejects(notices.targets(sql, asMember(nora)), refused("forbidden"));
  await assert.rejects(notices.addTarget(sql, asMember(camille), { url: "https://example.com/hook", kind: "slack", label: "Support", events: ["new"] }), refused("webhook_slack"));
  await assert.rejects(notices.addTarget(sql, asMember(camille), { url: slack, kind: "generic", label: "Support", events: ["new"] }), refused("webhook_address"));
  await assert.rejects(notices.addTarget(sql, asMember(camille), { url: "http://10.0.0.7/x", kind: "generic", label: "Inside", events: ["new"] }), refused("webhook_address"));
  await assert.rejects(notices.addTarget(sql, asMember(camille), { url: slack, kind: "slack", label: "Support", events: [] }), refused("notice_events"));
  await assert.rejects(notices.addTarget(sql, asMember(camille), { url: slack, kind: "slack", label: "Support", events: ["new", "everything"] }), refused("notice_events"));
  const added = await notices.addTarget(sql, asMember(camille), { url: slack, kind: "slack", label: "Support channel", events: ["new", "replied"] });
  assert.equal(added.secret, null, "Slack's address is its own secret");
  const [row] = await sql`select * from notice_targets where id = ${added.target.id}`;
  assert.ok(!JSON.stringify(row).includes("abcdefghijklmnopqrstuvwx"), "the tool never keeps the secret part of the address");
  const generic = await notices.addTarget(sql, asMember(camille), { url: "https://zapier.example.com/hooks/catch/1/abc", kind: "generic", label: "Zapier", events: ["late"] });
  assert.match(generic.secret!, /^whsec_/u);
  const listed = await notices.targets(sql, asMember(camille));
  assert.equal(listed.available, true);
  assert.deepEqual(listed.targets.map(x => [x.label, x.kind, x.events.join(",")]), [["Support channel", "slack", "new,replied"], ["Zapier", "generic", "late"]]);
  assert.ok(!listed.targets[0]!.shown.includes("abcdefghijklmnopqrstuvwx"));
});

test("a new request and a customer writing again reach the channels that asked; the message never leaves", async () => {
  const { sql } = database;
  const [target] = (await notices.targets(sql, asMember(camille))).targets.filter(x => x.label === "Support channel");
  const zapier = (await notices.targets(sql, asMember(camille))).targets.find(x => x.label === "Zapier")!;
  const before = deliveriesTo(target!.id).length;
  assert.equal(await chest.deliver({ type: "forms.request", data: request("A quote") }, events), 204);
  const t = await lastNumber();
  const sent = deliveriesTo(target!.id).slice(before);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.event, "ticket.new");
  assert.equal(sent[0]!.status, "delivered");
  assert.match(sent[0]!.text, new RegExp(`^New request ${t.number} from Nina Roux: A quote\\nhttps?://[^/]+/chest/tickets/${t.number}$`, "u"));
  const body = sent[0]!.request!.body;
  assert.ok(!body.includes("oak chairs") && !body.includes("06 12 34 56 78"), "no word of the message");
  assert.equal(deliveriesTo(zapier.id).filter(d => d.event === "ticket.new").length, 0, "Zapier asked for late requests only");
  // A colleague writes again from My requests.
  await chest.deliver({ type: "forms.request", data: request("Screen", nora.id) }, events);
  const mine = await lastNumber();
  await tickets.reply(sql, asMember(hugo), mine.number, "On it.");
  await tickets.writeMine(sql, asMember(nora), mine.number, "Still black.");
  await notices.about(sql, "replied", mine.id, await notices.lastMessageKey(sql, mine.id));
  const replied = deliveriesTo(target!.id).filter(d => d.event === "ticket.replied").at(-1)!;
  assert.equal(replied.text.split("\n")[0], `Nora Petit wrote again on request ${mine.number}: Screen`);
  // Told once per message, even when asked twice.
  await notices.about(sql, "replied", mine.id, await notices.lastMessageKey(sql, mine.id));
  assert.equal(deliveriesTo(target!.id).filter(d => d.event === "ticket.replied").length, 1);
});

test("a request waiting too long is told once per wait, in working hours", async () => {
  const { sql } = database;
  const zapier = (await notices.targets(sql, asMember(camille))).targets.find(x => x.label === "Zapier")!;
  await sql`insert into settings (key, value) values ('hours', ${sql.json({ on: false, days: [null, null, null, null, null, null, null], holidays: [] } as never)}) on conflict (key) do update set value = excluded.value`;
  await chest.deliver({ type: "forms.request", data: request("Late one") }, events);
  const t = await lastNumber();
  // Waiting 30 hours (the threshold is 24 by default; every hour counts here).
  await sql`update tickets set waiting_since = now() - interval '30 hours' where id = ${t.id}`;
  const before = deliveriesTo(zapier.id).length;
  assert.ok((await notices.late(sql)) >= 1);
  const late = deliveriesTo(zapier.id).slice(before).filter(d => d.event === "ticket.late");
  assert.equal(late.length, 1);
  assert.match(late[0]!.text, new RegExp(`^Request ${t.number} from Nina Roux has waited longer than 24 h: Late one`, "u"));
  assert.equal((late[0]!.data as { ticket: { number: number } }).ticket.number, t.number);
  assert.equal(await notices.late(sql), 0, "once per wait");
  // Answered, then the customer writes again and waits again: a new wait.
  await tickets.reply(sql, asMember(hugo), t.number, "Coming.");
  await sql`update tickets set status = 'open', waiting_since = now() - interval '26 hours' where id = ${t.id}`;
  assert.equal(await notices.late(sql), 1);
});

test("a channel that keeps failing is stopped by the Chest: Settings says so, the administrators are told, Try again", async () => {
  const { sql } = database;
  const target = (await notices.targets(sql, asMember(camille))).targets.find(x => x.label === "Support channel")!;
  chest.webhooks.respond(target.id, 404);
  await chest.deliver({ type: "forms.request", data: request("Gone channel") }, events);
  const listed = (await notices.targets(sql, asMember(camille))).targets.find(x => x.id === target.id)!;
  assert.equal(listed.disabled, true);
  const [row] = await sql<{ disabled_at: Date | null; last_error: string }[]>`select disabled_at, last_error from notice_targets where id = ${target.id}`;
  assert.ok(row!.disabled_at, "webhook.disabled marked it");
  assert.equal(row!.last_error, "http_404");
  assert.ok(chest.notifications.some(x => x.member === camille.id && /Support channel/u.test(x.title)), "the administrators hear of it");
  chest.webhooks.respond(target.id, 200);
  await notices.enableTarget(sql, asMember(camille), target.id);
  assert.equal((await notices.targets(sql, asMember(camille))).targets.find(x => x.id === target.id)!.disabled, false);
  // Removed for good: the Chest forgets it too.
  await notices.setEvents(sql, asMember(camille), target.id, ["late"]);
  await notices.removeTarget(sql, asMember(camille), target.id);
  assert.ok(!chest.webhooks.targets.some(x => x.id === target.id));
  assert.ok(!(await notices.targets(sql, asMember(camille))).targets.some(x => x.id === target.id));
  await assert.rejects(notices.removeTarget(sql, asMember(camille), target.id), refused("not_found"));
});

test("on a Chest without webhooks, Settings says so and adding is refused in words", async () => {
  const { sql } = database;
  const plain = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"] });
  try {
    assert.equal((await notices.targets(sql, asMember(camille))).available, false);
    assert.equal((await notices.targets(sql, asMember(camille))).delivery, "not_granted");
    await assert.rejects(notices.addTarget(sql, asMember(camille), { url: slack, kind: "slack", label: "Support", events: ["new"] }), refused("webhooks_unavailable"));
  } finally {
    await plain.close();
  }
});

// studio.16: Settings asks the Chest before offering the form
// (webhooks.available), rather than learning it from a failed call.
test("a Chest that paused the tool's notices: Settings says so, adding is refused in words, the channels are kept", async () => {
  const { sql } = database;
  const target = await notices.addTarget(sql, asMember(camille), { url: "https://hooks.slack.com/services/T0007/B0007/pausedpausedpausedpaused", kind: "slack", label: "Paused", events: ["new"] });
  assert.equal((await notices.targets(sql, asMember(camille))).delivery, "ready");
  chest.delivery.webhooks = "suspended";
  try {
    const listed = await notices.targets(sql, asMember(camille));
    assert.deepEqual({ available: listed.available, delivery: listed.delivery }, { available: false, delivery: "suspended" });
    assert.ok(listed.targets.some(x => x.id === target.target.id), "kept");
    await assert.rejects(notices.addTarget(sql, asMember(camille), { url: slack, kind: "slack", label: "Another", events: ["new"] }), refused("webhooks_suspended"));
  } finally {
    chest.delivery.webhooks = "ready";
  }
  await notices.removeTarget(sql, asMember(camille), target.target.id);
});

test("a long key goes whole (the SDK hashes it): two events sharing their first 64 characters are two notices, the same one twice is one", async () => {
  const { sql } = database;
  const target = await notices.addTarget(sql, asMember(camille), { url: "https://hooks.slack.com/services/T0009/B0009/zyxwvutsrqponmlkjihgfedc", kind: "slack", label: "Long keys", events: ["new"] });
  await chest.deliver({ type: "forms.request", data: request("Long keys") }, events);
  const t = await lastNumber();
  const ticket = { id: t.id, number: t.number, subject: "Long keys", customerName: "Nina Roux", customerEmail: "nina@example.com", requester: null, channel: "form" as const, priority: "normal" as const, status: "open" as const };
  const common = "new:" + "x".repeat(70);
  const before = deliveriesTo(target.target.id).length;
  assert.equal(await notices.notice(sql, "new", ticket, `${common}:a`), 1);
  assert.equal(await notices.notice(sql, "new", ticket, `${common}:b`), 1, "not the first one's answer");
  await notices.notice(sql, "new", ticket, `${common}:a`);
  assert.equal(deliveriesTo(target.target.id).length - before, 2);
});
