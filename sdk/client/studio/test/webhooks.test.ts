import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import * as webhooks from "../webhooks.js";
import * as webhooksRules from "../webhooks-rules.js";
import { fakeChest } from "../testing.js";

// A made-up address in Slack's shape, built in parts so secret scanners do not take it for a real one.
const slack = ["https://hooks.slack.com/services", "T0" + "0000000", "B0" + "0000000", "x".repeat(24)].join("/");
// Built in parts, with placeholder values: never a provider's address in
// its real token shape (secret scanners rightly refuse those).
const teams = ["https://default" + "0".repeat(16) + ".0e.environment.api.powerplatform.com/powerautomate/automations/direct/workflows", "0".repeat(32), "triggers/manual/paths/invoke?api-version=1&sig=placeholder"].join("/");
const owner = "mbr_camilleaaaaaaaaaaaaaaaaaaa";
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;

test("an address is checked before anything is sent: https, no credentials, no private or local host, the right shape per kind", () => {
  assert.deepEqual(webhooks.checkUrl("https://hooks.zapier.com/hooks/catch/123/abc/", "generic"), []);
  assert.deepEqual(webhooks.checkUrl("https://receiver.example.com:8443/in?token=x", "generic"), []);
  assert.deepEqual(webhooks.checkUrl(slack, "slack"), []);
  assert.deepEqual(webhooks.checkUrl(teams, "teams"), []);
  for (const [url, kind] of [
    ["http://receiver.example.com/", "generic"],
    ["https://user:pass@receiver.example.com/", "generic"],
    ["https://127.0.0.1/", "generic"],
    ["https://2130706433/", "generic"], // 127.0.0.1 written as a number
    ["https://[::1]/", "generic"],
    ["https://[::ffff:10.0.0.1]/", "generic"],
    ["https://169.254.169.254/latest/meta-data/", "generic"],
    ["https://10.1.2.3/", "generic"],
    ["https://localhost/", "generic"],
    ["https://printer.local/", "generic"],
    ["https://db.internal/", "generic"],
    ["https://intranet/", "generic"],
    ["https://receiver.example.com:22/", "generic"],
    ["https://receiver.example.com/#x", "generic"],
    [slack, "generic"],
    ["https://hooks.slack.com/services/nope", "slack"],
    [slack.replace("hooks.slack.com", "evil.example.com"), "slack"],
    ["https://outlook.office.com/webhook/abc", "teams"],
  ] as const) assert.ok(webhooks.checkUrl(url, kind).length > 0, `${url} (${kind}) is refused`);
  assert.equal(webhooksRules.isPublicAddress("93.184.215.14"), true);
  assert.equal(webhooksRules.isPublicAddress("2606:2800:21f:cb07:6820:80da:af6b:8b2c"), true);
  for (const a of ["0.0.0.0", "100.64.1.1", "172.20.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "fd00::1", "fe80::1", "::ffff:7f00:1", "64:ff9b::a00:1", "not an address"]) assert.equal(webhooksRules.isPublicAddress(a), false, a);
  assert.equal(webhooksRules.shownUrl("https://a.example.com/in?token=secret", "generic"), "https://a.example.com/in?…");
  assert.equal(webhooksRules.shownUrl(slack, "slack"), "https://hooks.slack.com/…");
  assert.deepEqual(webhooksRules.checkManifest({ max: 200 }), []);
  assert.equal(webhooksRules.checkManifest({ max: 0 }).length, 1);
  assert.equal(webhooksRules.checkManifest({ max: 5, extra: 1 }).length, 1);
});

test("Slack and Teams get their own shapes; a generic receiver gets the event, signed", () => {
  const message = { id: "whd_aaaaaaaaaaaaaaaaaaaaaaaaaa", event: "incident.created", text: "Checkout <down> & slow", data: { incident: 7 }, key: "incident:7", tool: "status", createdAt: "2026-09-29T10:00:00.000Z" };
  assert.deepEqual(JSON.parse(webhooksRules.format("slack", message)), { text: "Checkout &lt;down&gt; &amp; slow" });
  const card = JSON.parse(webhooksRules.format("teams", message)) as { type: string; attachments: { contentType: string; contentUrl: null; content: { type: string; body: { text: string }[] } }[] };
  assert.equal(card.type, "message");
  assert.equal(card.attachments[0]!.contentType, "application/vnd.microsoft.card.adaptive");
  assert.equal(card.attachments[0]!.content.type, "AdaptiveCard");
  assert.equal(card.attachments[0]!.content.body[0]!.text, "Checkout <down> & slow");
  assert.deepEqual(JSON.parse(webhooksRules.format("generic", message)), { id: message.id, event: "incident.created", text: message.text, data: { incident: 7 }, key: "incident:7", tool: "status", created_at: message.createdAt });

  // The receiver's side, and the same check written by hand (the README's snippet).
  const secret = "whsec_" + "a".repeat(43);
  const body = webhooksRules.format("generic", message);
  const header = webhooksRules.sign(secret, body, 1_790_000_000);
  assert.match(header, /^t=1790000000,v1=[0-9a-f]{64}$/u);
  assert.equal(header.split("v1=")[1], createHmac("sha256", secret).update(`1790000000.${body}`).digest("hex"));
  assert.equal(webhooksRules.verifySignature({ secret, header, body, now: 1_790_000_100 }), true);
  assert.equal(webhooksRules.verifySignature({ secret, header, body: body + " ", now: 1_790_000_100 }), false);
  assert.equal(webhooksRules.verifySignature({ secret, header, body, now: 1_790_000_400 }), false, "older than five minutes");
  assert.equal(webhooksRules.verifySignature({ secret: secret.replace("a", "b"), header, body, now: 1_790_000_000 }), false);
  // During a rotation, either secret verifies.
  const both = webhooksRules.sign(["whsec_" + "n".repeat(43), secret], body, 1_790_000_000);
  assert.equal(webhooksRules.verifySignature({ secret, header: both, body, now: 1_790_000_000 }), true);
});

test("a generic target is pinged, then receives signed deliveries, once per key", async () => {
  const received: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fake = await fakeChest({ webhooks: { max: 3, deliver: async (url, init) => { received.push({ url, ...init }); return new Response(null, { status: 204 }); } } });
  try {
    const { id, secret, target } = await webhooks.add({ url: "https://hooks.zapier.com/hooks/catch/1/abc/?t=x", kind: "generic", label: " Zapier — answers ", owner });
    assert.match(id, webhooks.targetIdPattern);
    assert.match(secret!, webhooksRules.secretPattern);
    assert.deepEqual([target.label, target.owner, target.url, target.state, target.status], ["Zapier — answers", owner, "https://hooks.zapier.com/hooks/catch/1/abc/?…", "active", null]);
    // The ping: signed, event chest.ping, with a challenge.
    assert.equal(received.length, 1);
    const ping = JSON.parse(received[0]!.body) as { event: string; data: { challenge: string } };
    assert.equal(ping.event, "chest.ping");
    assert.ok(ping.data.challenge.length > 10);
    assert.ok(webhooksRules.verifySignature({ secret: secret!, header: received[0]!.headers["Chest-Webhook-Signature"], body: received[0]!.body }));

    const sent = await webhooks.send(id, { event: "form.answered", text: "New answer to Contact", data: { form: 12, answer: 981 }, key: "answer:981" });
    assert.equal(sent.deliveries.length, 1);
    assert.deepEqual(sent.skipped, []);
    const last = received.at(-1)!;
    assert.equal(last.headers["Chest-Webhook-Id"], sent.deliveries[0]!.id);
    assert.equal(last.headers["Chest-Webhook-Event"], "form.answered");
    assert.ok(webhooksRules.verifySignature({ secret: secret!, header: last.headers["Chest-Webhook-Signature"], body: last.body }));
    assert.deepEqual((JSON.parse(last.body) as { data: unknown }).data, { form: 12, answer: 981 });
    // The same key: the same delivery, nothing sent again.
    const again = await webhooks.send([id], { event: "form.answered", text: "New answer to Contact", data: { form: 12, answer: 981 }, key: "answer:981" });
    assert.deepEqual(again.deliveries, sent.deliveries);
    assert.equal(received.length, 2);
    const [t] = await webhooks.list();
    assert.deepEqual([t!.status, t!.lastError, t!.failures], ["delivered", null, 0]);
    const { deliveries } = await webhooks.journal({ target: id });
    assert.deepEqual(deliveries.map(d => [d.event, d.status, d.attempts, d.responseStatus]), [["form.answered", "delivered", 1, 204]]);
    assert.equal(Object.hasOwn(deliveries[0]!, "text"), false, "the journal never holds the text");

    // A rotated secret: both sign for a while.
    const fresh = await webhooks.rotateSecret(id);
    await webhooks.send(id, { event: "form.answered", text: "Another", key: "answer:982" });
    for (const s of [fresh, secret!]) assert.ok(webhooksRules.verifySignature({ secret: s, header: received.at(-1)!.headers["Chest-Webhook-Signature"], body: received.at(-1)!.body }));
    // Removed: skipped as unknown.
    assert.equal(await webhooks.remove(id), true);
    assert.equal(await webhooks.remove(id), false);
    assert.deepEqual((await webhooks.send(id, { event: "form.answered", text: "Gone", key: "answer:983" })).skipped, [{ target: id, reason: "not_found" }]);
  } finally {
    await fake.close();
  }
});

test("what the Chest refuses at add: a bad address, a private name, a receiver that does not answer, beyond max", async () => {
  const fake = await fakeChest({ webhooks: { max: 2, resolve: { "rebind.example.com": "10.0.0.7", "gone.example.com": "nxdomain" } } });
  try {
    await assert.rejects(webhooks.add({ url: "http://a.example.com/", kind: "generic", label: "A" }), code("invalid_target"));
    await assert.rejects(webhooks.add({ url: "https://a.example.com/", kind: "generic", label: "" }), code("invalid_target"));
    await assert.rejects(webhooks.add({ url: "https://a.example.com/", kind: "generic", label: "A", owner: "camille" }), code("invalid_target"));
    await assert.rejects(webhooks.add({ url: "https://rebind.example.com/in", kind: "generic", label: "A" }), code("address_refused"));
    await assert.rejects(webhooks.add({ url: "https://gone.example.com/in", kind: "generic", label: "A" }), code("address_refused"));
    fake.webhooks.respond("https://down.example.com/in", 404);
    await assert.rejects(webhooks.add({ url: "https://down.example.com/in", kind: "generic", label: "A" }), code("verification_failed"));
    // Slack and Teams: no ping, no secret.
    const s = await webhooks.add({ url: slack, kind: "slack", label: "#status" });
    assert.equal(s.secret, null);
    assert.equal(s.target.url, "https://hooks.slack.com/…");
    await webhooks.add({ url: teams, kind: "teams", label: "Ops channel" });
    await assert.rejects(webhooks.add({ url: "https://b.example.com/in", kind: "generic", label: "B" }), (e: unknown) => (e as { name?: string }).name === "QuotaExceeded");
    await assert.rejects(webhooks.send(s.id, { event: "Bad Event", text: "x", key: "k" }), code("invalid_message"));
    await assert.rejects(webhooks.send(s.id, { event: "e", text: "x".repeat(4001), key: "k" }), code("invalid_message"));
    await assert.rejects(webhooks.send([], { event: "e", text: "x", key: "k" }), code("invalid_message"));
    // Slack received its own shape.
    await webhooks.send(s.id, { event: "incident.created", text: "Checkout is down <@here>", key: "i:1" });
    assert.deepEqual(JSON.parse(fake.webhooks.deliveries.at(-1)!.request!.body), { text: "Checkout is down &lt;@here&gt;" });
    assert.equal(fake.webhooks.deliveries.at(-1)!.request!.headers["Chest-Webhook-Signature"], undefined);
  } finally {
    await fake.close();
  }
  const without = await fakeChest();
  try {
    await assert.rejects(webhooks.list(), (e: unknown) => (e as { name?: string }).name === "CapabilityNotGranted");
  } finally {
    await without.close();
  }
});

test("failures are retried with backoff, then the target is disabled and the tool told", async () => {
  const told: webhooks.WebhookEvent[] = [];
  const tool = (request: Request) => webhooks.handle(request, { disabled: e => { told.push(e); } }).then(status => new Response(null, { status }));
  const fake = await fakeChest({ webhooks: { max: 5, to: tool } });
  try {
    const { id } = await webhooks.add({ url: "https://receiver.example.com/in", kind: "generic", label: "Receiver" });
    fake.webhooks.respond(id, 503);
    const first = await webhooks.send(id, { event: "e", text: "one", key: "k1" });
    let [d] = (await webhooks.journal()).deliveries;
    assert.deepEqual([d!.id, d!.status, d!.attempts, d!.lastError], [first.deliveries[0]!.id, "retrying", 1, "http_503"]);
    assert.equal(Date.parse(d!.nextAttemptAt!) - Date.parse(d!.createdAt), 60_000, "the next attempt one minute after the send");
    // A 4xx the receiver means: failed at once, no retry.
    fake.webhooks.respond(id, 400);
    await webhooks.send(id, { event: "e", text: "two", key: "k2" });
    assert.equal((await webhooks.journal()).deliveries[0]!.status, "failed");
    // Back to 503: retries until 10 failures in a row disable it.
    fake.webhooks.respond(id, "timeout");
    await webhooks.send(id, { event: "e", text: "two again", key: "k2b" });
    while ((await webhooks.list())[0]!.state === "active") assert.ok((await fake.webhooks.retry()) > 0);
    const [t] = await webhooks.list();
    assert.deepEqual([t!.state, t!.status, t!.failures, t!.lastError], ["disabled", "disabled", 10, "timeout"]);
    assert.equal(told.length, 1);
    assert.deepEqual([told[0]!.type, told[0]!.target, told[0]!.reason, told[0]!.lastError], ["webhook.disabled", id, "failures", "timeout"]);
    assert.match(told[0]!.id, webhooks.eventIdPattern);
    assert.equal(fake.webhooks.events[0]!.status, 204);
    d = (await webhooks.journal({ target: id })).deliveries.at(-1);
    assert.equal(d!.status, "failed");
    // Skipped while disabled; enable() tries again (a ping first).
    assert.deepEqual((await webhooks.send(id, { event: "e", text: "three", key: "k3" })).skipped, [{ target: id, reason: "disabled" }]);
    await assert.rejects(webhooks.enable(id), code("verification_failed"));
    fake.webhooks.respond(id, 200);
    assert.equal((await webhooks.enable(id)).state, "active");
    assert.equal((await webhooks.send(id, { event: "e", text: "four", key: "k4" })).deliveries.length, 1);
    assert.equal((await webhooks.list())[0]!.status, "delivered");

    // 404 from Slack: the hook was deleted — disabled at once.
    const s = await webhooks.add({ url: slack, kind: "slack", label: "#status" });
    fake.webhooks.respond(s.id, 404);
    await webhooks.send(s.id, { event: "e", text: "x", key: "s1" });
    assert.equal((await webhooks.list()).find(x => x.id === s.id)!.state, "disabled");
    assert.equal(told.at(-1)!.reason, "gone");
    // A delivery the tool did not sign: 401.
    assert.equal(await webhooks.handle(new Request("http://tool.test/chest-webhooks", { method: "POST", body: "{}" }), {}), 401);
  } finally {
    await fake.close();
  }
});

test("a retry left without an answer ends failed after its eighth attempt, 24 hours after the send", async () => {
  const fake = await fakeChest({ webhooks: { max: 5 } });
  try {
    const a = await webhooks.add({ url: "https://a.example.com/in", kind: "generic", label: "A" });
    const b = await webhooks.add({ url: "https://b.example.com/in", kind: "generic", label: "B" });
    fake.webhooks.respond(a.id, 502);
    await webhooks.send([a.id, b.id], { event: "e", text: "x", key: "k" });
    // b succeeding does not reset a's count; a single delivery ends before
    // 10 failures: 8 attempts.
    for (let i = 0; i < 10; i++) await fake.webhooks.retry();
    const d = fake.webhooks.deliveries.find(x => x.target === a.id)!;
    assert.deepEqual([d.status, d.attempts], ["failed", 8]);
    assert.equal((await webhooks.list()).find(x => x.id === a.id)!.state, "active");
    const page = await webhooks.journal({ limit: 1 });
    assert.equal(page.deliveries.length, 1);
    assert.ok(page.next);
    assert.equal((await webhooks.journal({ after: page.next! })).deliveries.length, 1);
  } finally {
    await fake.close();
  }
});

// Proposal (0.3.0-studio.16): Support's Settings shows "Send new tickets to
// Slack" only when the Chest will deliver, before anyone pastes an address.
test("available (0.3.0-studio.16): whether the Chest would deliver notices, how many addresses the tool has and may have", async () => {
  const fake = await fakeChest({ webhooks: { max: 3 } });
  try {
    assert.deepEqual(await webhooks.available(), { ok: true, reason: null, targets: 0, max: 3 });
    await webhooks.add({ url: slack, kind: "slack", label: "Support channel" });
    assert.deepEqual(await webhooks.available(), { ok: true, reason: null, targets: 1, max: 3 });
    // Paused by the owner: said without sending, and nothing is added or sent.
    fake.delivery.webhooks = "suspended";
    assert.deepEqual(await webhooks.available(), { ok: false, reason: "suspended", targets: 1, max: 3 });
    await assert.rejects(webhooks.add({ url: teams, kind: "teams", label: "Teams" }), code("suspended"));
    assert.equal(fake.webhooks.deliveries.length, 0);
  } finally {
    await fake.close();
  }
  // Not declared (no webhooks option: 403), or outside a Chest.
  const bare = await fakeChest();
  try {
    assert.deepEqual(await webhooks.available(), { ok: false, reason: "not_granted", targets: null, max: null });
  } finally {
    await bare.close();
  }
  delete process.env["CHEST_API"];
  assert.deepEqual(await webhooks.available(), { ok: false, reason: "not_granted", targets: null, max: null });
});
