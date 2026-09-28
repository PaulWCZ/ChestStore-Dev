import assert from "node:assert/strict";
import { test } from "node:test";
import * as chest from "../src/chest.js";
import { fakeChest } from "../src/testing.js";

test("the Chest's settings come from the environment, with safe defaults", () => {
  const saved = { ...process.env };
  try {
    for (const name of ["CHEST_COMPANY", "CHEST_TIMEZONE", "CHEST_CURRENCY", "CHEST_LOCALE", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL"]) delete process.env[name];
    assert.equal(chest.company(), "");
    assert.equal(chest.timeZone(), "Europe/Paris");
    assert.equal(chest.currency(), "EUR");
    assert.equal(chest.locale(), "en");
    assert.equal(chest.teamUrl(), null);
    assert.equal(chest.publicUrl(), null);
    Object.assign(process.env, { CHEST_COMPANY: "Atelier Martin", CHEST_TIMEZONE: "America/Montreal", CHEST_CURRENCY: "CAD", CHEST_LOCALE: "fr", CHEST_TEAM_URL: "https://booking-chest.atelier.fr/", CHEST_PUBLIC_URL: "https://booking.atelier.fr" });
    assert.equal(chest.company(), "Atelier Martin");
    assert.equal(chest.timeZone(), "America/Montreal");
    assert.equal(chest.currency(), "CAD");
    assert.equal(chest.locale(), "fr");
    assert.equal(chest.teamUrl(), "https://booking-chest.atelier.fr");
    assert.equal(chest.publicUrl(), "https://booking.atelier.fr");
    Object.assign(process.env, { CHEST_TIMEZONE: "Mars/Olympus", CHEST_CURRENCY: "euro", CHEST_PUBLIC_URL: "http://evil.example", CHEST_LOCALE: "xx" });
    assert.equal(chest.timeZone(), "Europe/Paris");
    assert.equal(chest.currency(), "EUR");
    assert.equal(chest.publicUrl(), null);
    assert.equal(chest.locale(), "en");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("today is the date in the Chest's zone", () => {
  // 23:30 UTC on 31 December is already 1 January in Paris, still 31 in Montreal.
  const at = Date.parse("2026-12-31T23:30:00Z");
  assert.equal(chest.today(at, "Europe/Paris"), "2027-01-01");
  assert.equal(chest.today(at, "America/Montreal"), "2026-12-31");
});

test("fakeChest sets the Chest's settings a test names, and restores them", async () => {
  const before = process.env["CHEST_COMPANY"];
  const fake = await fakeChest({ settings: { company: "Atelier Martin", currency: "CHF", locale: "fr", publicUrl: "https://booking.chest.test" }, timeZone: "Europe/Zurich" });
  try {
    assert.equal(chest.company(), "Atelier Martin");
    assert.equal(chest.currency(), "CHF");
    assert.equal(chest.locale(), "fr");
    assert.equal(chest.timeZone(), "Europe/Zurich");
    assert.equal(chest.publicUrl(), "https://booking.chest.test");
    assert.equal(chest.teamUrl(), "https://tool-chest.chest.test");
  } finally {
    await fake.close();
  }
  assert.equal(process.env["CHEST_COMPANY"], before);
});
