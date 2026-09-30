import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { email, mailNow } from "../lib/mail.ts";
import { camille, hugo, lea, tom } from "./support/members.ts";

// SDK studio.15: the wiki's letters honour each person's Chest email
// choice (mail.send applies it; the wiki keeps no switch of its own), and
// a key is passed whole — the SDK hashes a long one — so two people whose
// keys start alike never share one.

let chest: FakeChest;
before(async () => {
  chest = await fakeChest({
    tool: "wiki",
    members: [
      { ...tom, email: "tom@lumen.test" },
      { ...camille, email: "camille@lumen.test" },
      { ...hugo, email: "hugo@lumen.test", mailPreference: "none" },
      { ...lea, email: "lea@lumen.test", mailPreference: "digest" },
    ],
    capabilities: ["members", "notifications", "mail"],
    mail: { domain: "lumen.test" },
  });
});
after(() => chest.close());
beforeEach(() => {
  chest.outbox.length = 0;
  chest.held.length = 0;
});

const as = (...people: typeof tom[]) => people.map(p => ({ id: p.id, locale: p.locale ?? "en" }));
const letter = () => ({ letter: { subject: "Please read: Fire drill", lines: ["Fire drill"] }, path: "/chest/pages/8", why: "why" });

test("a person who turned Chest email off is not emailed; one on a daily digest waits for it", async () => {
  const done = await email(as(tom, hugo, lea), letter, p => `read:8:1:1790000000:${p.id}`);
  assert.equal(done.stop, null);
  assert.deepEqual(chest.outbox.map(m => m.to[0]), ["tom@lumen.test"]);
  assert.deepEqual(chest.held.map(h => [h.member, h.reason]).sort(), [[hugo.id, "none"], [lea.id, "digest"]].sort());
  // Hugo chose no email: the wiki does not count him as emailed; Léa gets it in her digest.
  assert.deepEqual(done.sent.sort(), [tom.id, lea.id].sort());
});

test("a key longer than the Chest keeps is sent whole: each person still gets their letter", async () => {
  const long = "read:" + "p".repeat(60) + ":1:1790000000:";
  // Cut at 64 as before studio.15, both keys were the same text: the
  // second person's letter was answered with the first one's, or now
  // refused as a key conflict.
  assert.equal((long + tom.id).slice(0, 64), (long + camille.id).slice(0, 64));
  const done = await email(as(tom, camille), letter, p => long + p.id);
  assert.equal(done.stop, null);
  assert.deepEqual(done.sent, [tom.id, camille.id]);
  assert.deepEqual(chest.outbox.map(m => m.to[0]), ["tom@lumen.test", "camille@lumen.test"]);
  // The same keys again: a retry sends nothing twice.
  await email(as(tom, camille), letter, p => long + p.id);
  assert.equal(chest.outbox.length, 2);
});

test("studio.16: the dialogs ask the Chest whether email would go now (mail.available)", async () => {
  assert.equal(await mailNow(), true);
  try {
    chest.delivery.mail = "not_connected";
    assert.equal(await mailNow(), false, "its owner has not connected it: the bell only");
    chest.delivery.mail = "suspended";
    assert.equal(await mailNow(), false, "paused: the bell only");
  } finally {
    chest.delivery.mail = "ready";
  }
  const bare = await fakeChest({ tool: "wiki", members: [tom], capabilities: ["members", "notifications"] });
  try {
    assert.equal(await mailNow(), false, "a Chest without email");
  } finally {
    await bare.close();
  }
});
