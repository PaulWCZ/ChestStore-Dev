import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { chest as official } from "../../src/chest.js";
import { ChestError } from "../../src/errors.js";
import { chest } from "../chest.js";
import { fakeChest } from "../testing.js";

// The studio's chest is 0.7.0's, member for member, with the studio's
// members added (tools: tool-urls.test.ts; theme: theme.test.ts; todayIn
// here). 0.7.0 has no Chest currency: neither has the studio's chest.

const names = ["CHEST_ORGANIZATION", "CHEST_TIME_ZONE", "CHEST_LANGUAGE", "CHEST_CURRENCY", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL"];
afterEach(() => { for (const name of names) delete process.env[name]; });

test("0.7.0's members read as 0.7.0 reads them: the same values, the same refusals outside a Chest", () => {
  for (const name of names) delete process.env[name];
  for (const read of [() => chest.tool, () => chest.organization, () => chest.timeZone, () => chest.language, () => chest.today()]) {
    assert.throws(read, (error: unknown) => error instanceof ChestError && error.code === "not_in_chest");
  }
  Object.assign(process.env, { CHEST_ORGANIZATION: "Atelier Martin", CHEST_TIME_ZONE: "Europe/Paris", CHEST_LANGUAGE: "fr", CHEST_CURRENCY: "CAD", CHEST_TEAM_URL: "https://booking-chest.atelier.fr", CHEST_PUBLIC_URL: "https://booking.atelier.fr" });
  assert.deepEqual([chest.organization, chest.timeZone, chest.language, chest.tool], [official.organization, official.timeZone, official.language, official.tool]);
  assert.deepEqual(chest.tool, { teamUrl: "https://booking-chest.atelier.fr", publicUrl: "https://booking.atelier.fr" });
  const at = Date.parse("2026-12-31T23:30:00Z");
  assert.equal(chest.today(at), official.today(at));
  assert.equal(chest.today(), official.today());
  assert.throws(() => chest.today(Number.NaN), RangeError);
  for (const name of ["teamUrl", "publicUrl", "toolUrl", "toolLink", "currency"]) assert.equal(name in chest, false, `the studio's ${name} went`);
  assert.equal("currency" in official, false, "0.7.0 has no Chest currency");
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
  // Outside a Chest a known zone still answers; an unknown one is refused
  // as 0.7.0 refuses chest.today() there — never read silently as UTC.
  delete process.env["CHEST_TIME_ZONE"];
  assert.equal(chest.todayIn("Europe/Paris", at), "2027-01-01");
  assert.throws(() => chest.todayIn("Mars/Olympus", at), (error: unknown) => error instanceof ChestError && error.code === "not_in_chest");
  process.env["CHEST_TIME_ZONE"] = "Europe/Paris";
  // Taken apart from the object, it still reads the Chest, as today() does.
  const { todayIn } = chest;
  assert.equal(todayIn("Nowhere/Land", at), "2027-01-01");
});

test("the studio's fakeChest sets 0.7.0's chest options, and restores them; a currency is refused", async () => {
  process.env["CHEST_TIME_ZONE"] = "Asia/Tokyo";
  const fake = await fakeChest({ chest: { organization: "Atelier Martin", timeZone: "Europe/Zurich", language: "fr", publicUrl: "https://booking.chest.test" } });
  try {
    assert.deepEqual([chest.organization.name, chest.timeZone, chest.language], ["Atelier Martin", "Europe/Zurich", "fr"]);
    assert.deepEqual(chest.tool, { teamUrl: "https://tool-chest.chest.test", publicUrl: "https://booking.chest.test" });
  } finally {
    await fake.close();
  }
  assert.equal(process.env["CHEST_TIME_ZONE"], "Asia/Tokyo");
  const plain = await fakeChest({ chest: { publicUrl: null } });
  try {
    assert.equal(chest.tool.publicUrl, null);
  } finally {
    await plain.close();
  }
  await assert.rejects(fakeChest({ chest: { currency: "CHF" } as never }), /no currency/u);
});
