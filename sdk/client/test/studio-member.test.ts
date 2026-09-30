import assert from "node:assert/strict";
import { test } from "node:test";
import { localeOf, locales, mailPreferenceOf, member, type Member } from "../src/member.js";
import * as members from "../src/members.js";
import { fakeChest, withMember } from "../src/testing.js";

// The studio's additions to member (not in 0.3.0): mailPreference (the
// claim mail_pref), and the store's languages (locales, localeOf) that a tool
// narrows member.language to. Ported from 0.3.0-studio.16's member.test.ts:
// its "locale" and "zoneinfo" tests went, as 0.3.0 gives member.language and
// member.timeZone.

const base = { firstName: "Léa", lastName: "Roy", name: "Léa Roy", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "America/Montreal" };

test("mailPreference (Proposal (studio.15)): one of all, digest, none; anything else is not said, and never refuses the member", () => {
  assert.deepEqual(["all", "digest", "none", "weekly", "", 1, undefined].map(mailPreferenceOf), ["all", "digest", "none", undefined, undefined, undefined, undefined]);
});

test("mailPreference is read from the assertion and the members API when the Chest says it, absent otherwise", async () => {
  const lea: Member = { ...base, id: "mbr_" + "lea".padEnd(26, "a"), mailPreference: "digest" };
  const hugo: Member = { ...base, id: "mbr_" + "hugo".padEnd(26, "a"), name: "Hugo" };
  const fake = await fakeChest({ members: [lea, hugo], capabilities: ["members"] });
  try {
    assert.equal(member(withMember(new Request("http://tool.test/chest"), lea))?.mailPreference, "digest");
    const plain = member(withMember(new Request("http://tool.test/chest"), hugo));
    assert.ok(plain);
    assert.equal(Object.hasOwn(plain, "mailPreference"), false, "not said: read it as all");
    assert.deepEqual((await members.lookup([lea.id, hugo.id])).members.map(m => m.mailPreference), ["digest", undefined]);
    // A value of a later Chest is left out, never a reason to refuse.
    const later = member(withMember(new Request("http://tool.test/chest"), { ...lea, mailPreference: "weekly" as never }));
    assert.equal(later?.id, lea.id);
    assert.equal(later?.mailPreference, undefined);
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
