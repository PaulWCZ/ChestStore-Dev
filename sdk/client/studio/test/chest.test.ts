import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { chest as official } from "../../src/chest.js";
import { ChestError } from "../../src/errors.js";
import { chest } from "../chest.js";
import { fakeChest } from "../testing.js";

// The studio's chest is 0.4.1's, member for member, with the studio's
// members added (tools: tool-urls.test.ts; theme: theme.test.ts; todayIn
// here). Its currency, teamUrl and publicUrl went: 0.4.1's chest.currency,
// chest.tool.teamUrl and chest.tool.publicUrl replace them.

const names = ["CHEST_ORGANIZATION", "CHEST_TIME_ZONE", "CHEST_LANGUAGE", "CHEST_CURRENCY", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL"];
afterEach(() => { for (const name of names) delete process.env[name]; });

test("0.4.1's members read as 0.4.1 reads them: the same values, the same refusals outside a Chest", () => {
  for (const name of names) delete process.env[name];
  for (const read of [() => chest.currency, () => chest.tool, () => chest.organization, () => chest.timeZone, () => chest.language, () => chest.today()]) {
    assert.throws(read, (error: unknown) => error instanceof ChestError && error.code === "not_in_chest");
  }
  Object.assign(process.env, { CHEST_ORGANIZATION: "Atelier Martin", CHEST_TIME_ZONE: "Europe/Paris", CHEST_LANGUAGE: "fr", CHEST_CURRENCY: "CAD", CHEST_TEAM_URL: "https://booking-chest.atelier.fr", CHEST_PUBLIC_URL: "https://booking.atelier.fr" });
  assert.deepEqual([chest.organization, chest.timeZone, chest.language, chest.currency, chest.tool], [official.organization, official.timeZone, official.language, official.currency, official.tool]);
  assert.deepEqual(chest.tool, { teamUrl: "https://booking-chest.atelier.fr", publicUrl: "https://booking.atelier.fr" });
  const at = Date.parse("2026-12-31T23:30:00Z");
  assert.equal(chest.today(at), official.today(at));
  assert.equal(chest.today(), official.today());
  assert.throws(() => chest.today(Number.NaN), RangeError);
  for (const name of ["teamUrl", "publicUrl", "toolUrl", "toolLink"]) assert.equal(name in chest, false, `the studio's ${name} went`);
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

test("the studio's fakeChest sets 0.4.1's chest options, and restores them", async () => {
  process.env["CHEST_CURRENCY"] = "JPY";
  const fake = await fakeChest({ chest: { organization: "Atelier Martin", timeZone: "Europe/Zurich", language: "fr", currency: "CHF", publicUrl: "https://booking.chest.test" } });
  try {
    assert.deepEqual([chest.organization.name, chest.timeZone, chest.language, chest.currency], ["Atelier Martin", "Europe/Zurich", "fr", "CHF"]);
    assert.deepEqual(chest.tool, { teamUrl: "https://tool-chest.chest.test", publicUrl: "https://booking.chest.test" });
  } finally {
    await fake.close();
  }
  assert.equal(process.env["CHEST_CURRENCY"], "JPY");
  const plain = await fakeChest({ chest: { publicUrl: null } });
  try {
    assert.equal(chest.currency, "EUR", "0.4.1's default");
    assert.equal(chest.tool.publicUrl, null);
  } finally {
    await plain.close();
  }
});
