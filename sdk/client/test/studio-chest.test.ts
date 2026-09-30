import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { chest } from "../src/chest.js";
import { fakeChest } from "../src/testing.js";

// The studio's members of chest (not in 0.3.0): currency, teamUrl,
// publicUrl, todayIn (toolUrl, toolLink: tool-urls.test.ts; theme:
// theme.test.ts). Ported from 0.3.0-studio.16's chest.test.ts: company,
// timeZone, locale and today went, as 0.3.0's chest gives organization.name,
// timeZone, language and today().

const names = ["CHEST_ORGANIZATION", "CHEST_TIME_ZONE", "CHEST_LANGUAGE", "CHEST_CURRENCY", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL"];
afterEach(() => { for (const name of names) delete process.env[name]; });

test("the studio's settings come from the environment, with safe defaults: they never throw", () => {
  for (const name of names) delete process.env[name];
  assert.equal(chest.currency, "EUR");
  assert.equal(chest.teamUrl, null);
  assert.equal(chest.publicUrl, null);
  Object.assign(process.env, { CHEST_CURRENCY: "CAD", CHEST_TEAM_URL: "https://booking-chest.atelier.fr/", CHEST_PUBLIC_URL: "https://booking.atelier.fr" });
  assert.equal(chest.currency, "CAD");
  assert.equal(chest.teamUrl, "https://booking-chest.atelier.fr");
  assert.equal(chest.publicUrl, "https://booking.atelier.fr");
  Object.assign(process.env, { CHEST_CURRENCY: "euro", CHEST_PUBLIC_URL: "http://evil.example", CHEST_TEAM_URL: "http://localhost:4000" });
  assert.equal(chest.currency, "EUR");
  assert.equal(chest.publicUrl, null, "http only on this machine");
  assert.equal(chest.teamUrl, "http://localhost:4000");
});

test("todayIn is the date in another zone: a member's; one the runtime does not know reads as the Chest's", () => {
  process.env["CHEST_TIME_ZONE"] = "Europe/Paris";
  // 23:30 UTC on 31 December is already 1 January in Paris, still 31 in Montreal.
  const at = Date.parse("2026-12-31T23:30:00Z");
  assert.equal(chest.todayIn("America/Montreal", at), "2026-12-31");
  assert.equal(chest.todayIn("Europe/Paris", new Date(at)), "2027-01-01");
  assert.equal(chest.todayIn("Mars/Olympus", at), chest.today(at));
  assert.equal(chest.todayIn("../etc/localtime", at), "2027-01-01");
  assert.match(chest.todayIn("Asia/Tokyo"), /^\d{4}-\d{2}-\d{2}$/u);
  assert.throws(() => chest.todayIn("UTC", Number.NaN), RangeError);
  // Taken apart from the object, it still reads the Chest, as today() does.
  const { todayIn } = chest;
  assert.equal(todayIn("Nowhere/Land", at), "2027-01-01");
});

test("fakeChest sets what a test names — the official three and the studio's — and restores them", async () => {
  process.env["CHEST_CURRENCY"] = "JPY";
  const fake = await fakeChest({ chest: { organization: "Atelier Martin", timeZone: "Europe/Zurich", language: "fr", currency: "CHF", publicUrl: "https://booking.chest.test" } });
  try {
    assert.deepEqual([chest.organization.name, chest.timeZone, chest.language], ["Atelier Martin", "Europe/Zurich", "fr"]);
    assert.equal(chest.currency, "CHF");
    assert.equal(chest.publicUrl, "https://booking.chest.test");
    assert.equal(chest.teamUrl, "https://tool-chest.chest.test");
  } finally {
    await fake.close();
  }
  assert.equal(process.env["CHEST_CURRENCY"], "JPY");
  const plain = await fakeChest();
  try {
    assert.equal(chest.currency, "EUR", "unset unless named");
    assert.equal(chest.publicUrl, null);
  } finally {
    await plain.close();
  }
});
