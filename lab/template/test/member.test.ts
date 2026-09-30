import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { localeOf, member } from "@argentic/chest-sdk/member";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { camille, everyone, hugo } from "./support/members.ts";

let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, chest: { organization: "Atelier Martin", timeZone: "Europe/Paris", language: "en" } });
});
after(async () => {
  await chest.close();
});

test("the Chest's assertion gives the member's language and zone; the tool speaks it or English", () => {
  const who = member(withMember(new Request("http://tool.test/chest"), camille));
  assert.equal(who?.id, camille.id);
  assert.equal(who?.language, "fr");
  assert.equal(who?.timeZone, "Europe/Paris");
  assert.equal(localeOf(who?.language), "fr");
  assert.equal(localeOf("de"), "en");
  const other = member(withMember(new Request("http://tool.test/chest"), { ...hugo, timeZone: "America/Montreal" }));
  assert.equal(other?.timeZone, "America/Montreal");
  assert.equal(member(new Request("http://tool.test/chest")), null);
});
