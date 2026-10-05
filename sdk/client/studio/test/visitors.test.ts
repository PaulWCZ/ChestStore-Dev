import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest } from "../testing.js";
import * as visitors from "../visitors.js";

const from = (address: string, extra: Record<string, string> = {}) => new Headers({ "x-forwarded-for": `${address}, 10.0.0.1`, ...extra });

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

test("the visitor's address and key: the first of X-Forwarded-For, hashed with the tool", () => {
  assert.equal(visitors.address(from("203.0.113.9")), "203.0.113.9");
  assert.equal(visitors.address(new Headers()), null);
  assert.equal(visitors.address(from("<script>")), null);
  assert.equal(visitors.visitor(new Headers()), "unknown");
  assert.equal(visitors.visitor(from("203.0.113.9")).length, 22);
  assert.notEqual(visitors.visitor(from("203.0.113.9")), visitors.visitor(from("198.51.100.4")));
  // A Request, and a headers object that has a field named "headers" of its own (Next's headers()).
  assert.equal(visitors.address(new Request("http://tool.test/", { headers: from("203.0.113.9") })), "203.0.113.9");
  const nextLike = { headers: { "x-forwarded-for": "nope" }, get: (name: string) => from("203.0.113.9").get(name) };
  assert.equal(visitors.address(nextLike), "203.0.113.9");
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
