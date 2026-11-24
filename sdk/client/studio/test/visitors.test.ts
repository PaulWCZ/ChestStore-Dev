import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { fakeChest } from "../testing.js";
import * as visitors from "../visitors.js";

const from = (address: string, extra: Record<string, string> = {}) => new Headers({ "chest-visitor-address": address, ...extra });

test("a form's token: ours, not too fast, not too old", async () => {
  const fake = await fakeChest({});
  try {
    const now = Date.parse("2026-10-01T10:00:00Z");
    const token = visitors.formToken(now);
    assert.equal(visitors.checkForm(token, { now: now + 1000 }), "too_fast");
    assert.equal(visitors.checkForm(token, { now: now + 5000 }), "ok");
    assert.equal(visitors.checkForm(token, { now: now + 25 * 3600000 }), "invalid");
    assert.equal(visitors.checkForm(token.slice(0, -2) + "xx", { now: now + 5000 }), "invalid");
    assert.equal(visitors.checkForm(undefined), "invalid");
    assert.equal(visitors.checkForm(String(now + 5000) + ".abc"), "invalid");
  } finally {
    await fake.close();
  }
});

test("the visitor's address: the front's Chest-Visitor-Address only", () => {
  // X-Forwarded-For is the visitor's own words: never read.
  assert.equal(visitors.address(new Headers({ "x-forwarded-for": "203.0.113.9" })), null);
  assert.equal(visitors.visitor(new Headers({ "x-forwarded-for": "203.0.113.9" })), "unknown");
  assert.equal(visitors.address(from("203.0.113.9, 10.0.0.1")), null, "one address, as the front sets it");
  assert.equal(visitors.address(from("203.0.113.9")), "203.0.113.9");
  assert.equal(visitors.address(new Headers()), null);
  assert.equal(visitors.address(from("<script>")), null);
  // A Request, and a headers object that has a field named "headers" of its own (Next's headers()).
  assert.equal(visitors.address(new Request("http://tool.test/", { headers: from("203.0.113.9") })), "203.0.113.9");
  const nextLike = { headers: { "chest-visitor-address": "nope" }, get: (name: string) => from("203.0.113.9").get(name) };
  assert.equal(visitors.address(nextLike), "203.0.113.9");
});

test("the visitor's key is the Chest's (an HMAC under a key the tool never holds): stable within a run, not the hash of the address", async () => {
  // Without the front's key, nobody in particular — even with an address.
  assert.equal(visitors.visitor(new Headers()), "unknown");
  assert.equal(visitors.visitor(from("203.0.113.9")), "unknown", "the tool never computes a key from the address");
  assert.equal(visitors.visitor(new Headers({ "chest-visitor": "short" })), "unknown");
  assert.equal(visitors.visitor(new Headers({ "chest-visitor": "a".repeat(21) + "!" })), "unknown");
  const fake = await fakeChest({ tool: "quotes" });
  let first: string;
  try {
    const ip = "203.0.113.9";
    first = visitors.visitor(fake.visitorHeaders(ip));
    assert.match(first, visitors.visitorPattern);
    assert.equal(visitors.visitor(fake.visitorHeaders(ip)), first, "stable within a run");
    assert.equal(visitors.visitor(new Request("http://tool.test/", { headers: fake.visitorHeaders(ip) })), first);
    assert.notEqual(visitors.visitor(fake.visitorHeaders("198.51.100.4")), first);
    assert.equal(visitors.address(fake.visitorHeaders(ip)), ip, "the front still names the address for counting");
    // Not studio.1's unsalted hash: a tool that hashed every IPv4 would not find it.
    for (const tool of ["quotes", ""]) assert.notEqual(first, createHash("sha256").update(`${tool}|${ip}`).digest("base64url").slice(0, 22));
    // Brute force over addresses, as a tool could do it, finds nothing:
    // every candidate it can compute differs from the key.
    const candidates = new Set<string>();
    for (let a = 0; a < 256; a++) for (let b = 0; b < 32; b++) candidates.add(createHash("sha256").update(`quotes|203.0.${b + 100}.${a}`).digest("base64url").slice(0, 22));
    assert.equal(candidates.has(first), false);
  } finally {
    await fake.close();
  }
  // Another run (a new key): another value — the key is the Chest's alone.
  const again = await fakeChest({ tool: "quotes" });
  try {
    assert.notEqual(visitors.visitor(again.visitorHeaders("203.0.113.9")), first);
  } finally {
    await again.close();
  }
});

test("counting: per visitor, per hour for everyone, and the Chest's ceiling per address across names", async () => {
  const fake = await fakeChest({ visitors: { perAddressHour: 6 } });
  try {
    const a = from("203.0.113.9"), b = from("198.51.100.4");
    for (let i = 0; i < 3; i++) assert.equal((await visitors.count(a, "apply", { perVisitor: 3, perHour: 100 })).allowed, true);
    const refused = await visitors.count(a, "apply", { perVisitor: 3, perHour: 100 });
    assert.equal(refused.allowed, false);
    assert.ok(refused.retryAfter > 0);
    assert.equal((await visitors.count(b, "apply", { perVisitor: 3, perHour: 100 })).allowed, true);
    // Another form of the same visitor counts toward the Chest's ceiling.
    for (let i = 0; i < 3; i++) assert.equal((await visitors.count(a, "contact", { perVisitor: 10, perHour: 100 })).allowed, true);
    assert.equal((await visitors.count(a, "contact", { perVisitor: 10, perHour: 100 })).allowed, false);
    await assert.rejects(visitors.count(a, "Bad Name", { perVisitor: 1, perHour: 1 }));
    // Without the front's address (X-Forwarded-For is never read), a
    // visitor is nobody in particular: perVisitor does not apply — a few
    // requests must not close the form for everybody —, only perHour.
    for (let i = 0; i < 8; i++) assert.equal((await visitors.count(new Headers({ "x-forwarded-for": `192.0.2.${i}` }), "forged", { perVisitor: 2, perHour: 10 })).allowed, true);
    for (let i = 0; i < 2; i++) assert.equal((await visitors.count(new Headers(), "forged", { perVisitor: 2, perHour: 10 })).allowed, true);
    const ceiling = await visitors.count(new Headers(), "forged", { perVisitor: 2, perHour: 10 });
    assert.deepEqual([ceiling.allowed, ceiling.retryAfter > 0], [false, true], "the ceiling for everyone still holds");
    // An unknown visitor does not use up the Chest's ceiling per address
    // (6 an hour here) for the others either.
    assert.equal((await visitors.count(new Headers(), "other", { perVisitor: 1, perHour: 100 })).allowed, true);
  } finally {
    await fake.close();
  }
});

test("the visitor's language: the switch, the browser, then the Chest's", () => {
  const saved = process.env["CHEST_LANGUAGE"];
  try {
    process.env["CHEST_LANGUAGE"] = "fr";
    assert.equal(visitors.language(new Headers({ cookie: "a=1; lang=en" , "accept-language": "fr" })), "en");
    assert.equal(visitors.language(new Headers({ "accept-language": "de-DE, en;q=0.8, fr;q=0.9" })), "fr");
    assert.equal(visitors.language(new Headers({ "accept-language": "de" })), "fr");
    assert.equal(visitors.language(new Headers({ cookie: "lang=xx" })), "fr");
  } finally {
    if (saved === undefined) delete process.env["CHEST_LANGUAGE"];
    else process.env["CHEST_LANGUAGE"] = saved;
  }
});
