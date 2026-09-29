import assert from "node:assert/strict";
import { test } from "node:test";
import { idempotencyKey } from "../src/api.js";
import * as calendar from "../src/calendar.js";
import { ChestError } from "../src/errors.js";
import * as events from "../src/events.js";
import type { Member } from "../src/member.js";
import * as notifications from "../src/notifications.js";
import { fakeChest } from "../src/testing.js";
import * as webhooks from "../src/webhooks.js";

// studio.15: every key a tool gives the Chest, reviewed after the mail bug
// (a key cut to 64 characters lost its recipient). Keys that make a retry
// harmless (mail, events.publish, webhooks.send) take any length and are
// sent whole or as their digest, never cut; keys that name a thing for as
// long as it lives (calendar, notifications) are refused beyond 64, never
// cut — and the Chest refuses a retry key reused for something else.

const person = (key: string): Member => ({ id: "mbr_" + key + "a".repeat(26 - key.length), firstName: key, lastName: "X", name: key + " X", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], locale: "en" });
const camille = person("camille"), hugo = person("hugo");
const code = (c: string) => (e: unknown) => e instanceof ChestError && e.code === c;
// A key of 70 characters whose last part tells two things apart.
const long = (tail: string) => "reminder:2026-09-29:project:atelier-martin-renovation-phase-two:" + tail;

test("idempotencyKey: a key that fits goes as is; any other, whole, as its SHA-256; never cut", () => {
  assert.equal(idempotencyKey("reply:981"), "reply:981");
  assert.equal(idempotencyKey("a".repeat(64)), "a".repeat(64));
  const a = idempotencyKey(long(camille.id)), b = idempotencyKey(long(hugo.id));
  assert.match(a ?? "", /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(a, b, "two keys that differ past 64 characters stay two keys");
  assert.equal(idempotencyKey(long(camille.id)), a, "the same key, the same digest: a retry is recognised");
  // Characters the Chest does not keep (an address, a space, accents) are hashed, not refused.
  assert.match(idempotencyKey("room:1:guest@example.com") ?? "", /^sha256:/u);
  assert.match(idempotencyKey("réunion d'équipe") ?? "", /^sha256:/u);
  // Nothing a tool writes can pose as the digest of another key.
  const digest = idempotencyKey(long("x"))!;
  assert.notEqual(idempotencyKey(digest), digest);
  // Not keys.
  for (const bad of ["", "a".repeat(513), "a\nb", "tab\there", 42, null]) assert.equal(idempotencyKey(bad), null, `${JSON.stringify(bad)} is not a key`);
  assert.notEqual(idempotencyKey("a".repeat(512)), null);
});

test("events.publish: a long key is kept whole (hashed); the same key for another event is refused", async () => {
  const chest = await fakeChest({ tool: "leave", emits: ["leave.approved"] });
  try {
    const first = await events.publish("leave.approved", { request: 1 }, { key: long("1") });
    const second = await events.publish("leave.approved", { request: 2 }, { key: long("2") });
    assert.notEqual(first.id, second.id);
    assert.equal(chest.published.length, 2);
    assert.equal(chest.published[0]?.key, idempotencyKey(long("1")));
    // A retry of the same event under the same key is the same event.
    assert.equal((await events.publish("leave.approved", { request: 1 }, { key: long("1") })).id, first.id);
    // What a cut key did: another event under the first one's key.
    const cut = (tail: string) => long(tail).slice(0, 64);
    await events.publish("leave.approved", { request: 3 }, { key: cut("3") });
    await assert.rejects(events.publish("leave.approved", { request: 4 }, { key: cut("4") }), code("key_conflict"));
    assert.equal(chest.published.length, 3);
    await assert.rejects(events.publish("leave.approved", {}, { key: "a\u0000b" }), code("invalid_event"));
  } finally {
    await chest.close();
  }
});

test("webhooks.send: a long key is kept whole (hashed); the same key for another event is refused, nothing sent", async () => {
  const chest = await fakeChest({ capabilities: [], webhooks: { max: 5 } });
  try {
    const target = await webhooks.add({ url: "https://receiver.example.com/in", kind: "generic", label: "Receiver" });
    const a = await webhooks.send(target.id, { event: "ticket.new", text: "New ticket #1", key: long("1") });
    const b = await webhooks.send(target.id, { event: "ticket.new", text: "New ticket #2", key: long("2") });
    assert.notEqual(a.deliveries[0]?.id, b.deliveries[0]?.id);
    assert.equal((await webhooks.send(target.id, { event: "ticket.new", text: "New ticket #1", key: long("1") })).deliveries[0]?.id, a.deliveries[0]?.id);
    assert.deepEqual(webhooks.checkMessage({ event: "ticket.new", text: "x", key: long("3") }), []);
    await assert.rejects(webhooks.send(target.id, { event: "ticket.replied", text: "Reply", key: long("1") }), code("key_conflict"));
    assert.equal(chest.webhooks.deliveries.length, 2);
    assert.equal(chest.webhooks.deliveries[0]?.key, idempotencyKey(long("1")));
  } finally {
    await chest.close();
  }
});

test("calendar and notifications keys name a thing: beyond 64 they are refused, never cut", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["calendar", "notifications"] });
  try {
    const event = { members: [camille.id], title: "Due", days: { first: "2026-10-12", last: "2026-10-12" } };
    await assert.rejects(calendar.put({ ...event, key: long("1") }), code("invalid_key"));
    await assert.rejects(calendar.putMany([{ ...event, key: long("1") }]), code("invalid_key"));
    await assert.rejects(calendar.remove(long("1")), code("invalid_key"));
    assert.equal(chest.calendar.size, 0, "nothing was put under a cut key");
    await assert.rejects(notifications.notify([camille.id], { title: "Due", key: long("1") }), code("invalid_key"));
    await assert.rejects(notifications.withdraw(long("1")), code("invalid_key"));
    assert.equal(chest.notifications.length, 0);
    // 64 exactly is a key.
    await calendar.put({ ...event, key: "k".repeat(64) });
    assert.ok(chest.calendar.has("k".repeat(64)));
  } finally {
    await chest.close();
  }
});
