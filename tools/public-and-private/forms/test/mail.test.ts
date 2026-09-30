import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { sendCopy } from "../lib/mailer.ts";
import { form, q } from "./support/fixtures.ts";
import { everyone, hugo } from "./support/members.ts";

// A copy of one's own answer is transactional (Proposal (studio.15)): it
// goes even to a member who chose no email from tools in their Chest.
test("the copy of an answer reaches a member who chose no email: it is their own answer", async () => {
  const chest = await fakeChest({ members: everyone.map(m => (m.id === hugo.id ? { ...m, mailPreference: "none" as const } : m)), capabilities: ["members", "mail"], mail: { domain: "example.test" } });
  try {
    const def = form([q("short", "Your name")], "Contact");
    const answers = { [def.pages[0]!.questions[0]!.id]: "Hugo" };
    assert.equal(await sendCopy({ member: hugo.id }, def, answers, "en", "Atelier", "a1"), "email");
    assert.equal(chest.outbox.length, 1);
    assert.deepEqual(chest.held, []);
  } finally {
    await chest.close();
  }
});
