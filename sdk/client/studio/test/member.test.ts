import assert from "node:assert/strict";
import { test } from "node:test";
import { localeOf, locales, member } from "../member.js";
import * as members from "../members.js";
import { fakeChest, withMember } from "../testing.js";

// The studio's member module (not in 0.4.1): the store's languages (locales,
// localeOf) that a tool narrows member.language to, and the fake's members
// without a language or a zone. mailPreference went to mail.preference
// (mail.test.ts).

const base = { firstName: "Léa", lastName: "Roy", name: "Léa Roy", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "America/Montreal" };

test("the studio's member module is 0.4.1's: the same values, and the assertion its claims only", async () => {
  const official = await import("../../src/member.js");
  const studio = await import("../member.js");
  for (const [name, value] of Object.entries(official)) assert.equal((studio as Record<string, unknown>)[name], value, name);
  const lea = { ...base, id: "mbr_" + "lea".padEnd(26, "a"), mailPreference: "digest" as const };
  const fake = await fakeChest({ members: [lea], capabilities: ["members"] });
  try {
    // A test's member may carry the studio's email preference (mail.preference);
    // the assertion carries 0.4.1's claims only.
    const signed = member(withMember(new Request("http://tool.test/chest"), lea));
    assert.ok(signed);
    assert.equal(Object.hasOwn(signed, "mailPreference"), false);
    assert.equal(Object.hasOwn((await members.get(lea.id))!, "mailPreference"), false, "nor the members API: mail.preference says it");
  } finally {
    await fake.close();
  }
});

test("localeOf narrows a member's language to the store's: English for one it does not speak yet", () => {
  assert.deepEqual([...locales], ["en", "fr"]);
  assert.deepEqual(["fr", "fr-CA", "FR", "de", "haw", "", 7, null].map(localeOf), ["fr", "fr", "fr", "en", "en", "en", "en", "en"]);
});

test("a test's member without a language or a zone is given the Chest's, as a real Chest does", async () => {
  const { language: _l, timeZone: _z, ...bare } = base;
  void _l; void _z;
  const nora = { ...bare, id: "mbr_" + "nora".padEnd(26, "a") };
  const fake = await fakeChest({ members: [nora], capabilities: ["members"], chest: { language: "fr", timeZone: "Europe/Paris" } });
  try {
    const who = member(withMember(new Request("http://tool.test/chest"), nora));
    assert.deepEqual([who?.language, who?.timeZone], ["fr", "Europe/Paris"]);
    assert.deepEqual([fake.members[0]?.language, fake.members[0]?.timeZone], ["fr", "Europe/Paris"]);
    const found = await members.get(nora.id);
    assert.deepEqual([found?.language, found?.timeZone], ["fr", "Europe/Paris"]);
    // One the Chest would never send is signed as given, and refused.
    assert.equal(member(withMember(new Request("http://tool.test/chest"), { ...nora, language: "French" })), null);
  } finally {
    await fake.close();
  }
});
