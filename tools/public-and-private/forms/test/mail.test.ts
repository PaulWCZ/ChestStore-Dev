import assert from "node:assert/strict";
import { test } from "node:test";
import * as mail from "@argentic/chest-sdk/mail";
import { fakeChest, shownTo } from "@argentic/chest-sdk/testing";
import { copyNotice, sendCopy } from "../src/lib/mailer.ts";
import { form, q } from "./support/fixtures.ts";
import { everyone, hugo } from "./support/members.ts";

// A visitor's copy goes by email (an address: someone outside), Reply-To
// the company's address; a member's copy is a notification, never a mail.
test("a visitor's copy: to their address, replies to the company's address, the reply line in the email", async () => {
  const chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "mail"], mail: { domain: "example.test", replyTo: "hello@atelier.test" } });
  try {
    const def = form([q("short", "Your name")], "Contact");
    const answers = { [def.pages[0]!.questions[0]!.id]: "Nina" };
    assert.equal(await sendCopy("nina@example.com", def, answers, "en", "Atelier", "a1", { ownWordsOnly: true }), "email");
    assert.equal(chest.outbox.length, 1);
    assert.deepEqual(chest.outbox[0]!.to, ["nina@example.com"]);
    assert.equal(chest.outbox[0]!.replyTo, "hello@atelier.test");
    assert.match(chest.outbox[0]!.text, /To write to Atelier, reply to this email\./u);
    // The connector not connected: nothing goes, and the tool says no copy.
    chest.delivery.mail = "not_connected";
    assert.equal(await sendCopy("lea@example.com", def, answers, "en", "Atelier", "a2", { ownWordsOnly: true }), "none");
    assert.equal(chest.outbox.length, 1);
    // A member is never a mail recipient.
    chest.delivery.mail = "ready";
    await assert.rejects(mail.send({ to: hugo.id, subject: "x", text: "x" }), (e: Error & { code?: string }) => e.code === "invalid_recipient");
  } finally {
    await chest.close();
  }
});

test("a member's copy of a team form: one notification opening what they sent, in English and French", async () => {
  const chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "mail"] });
  try {
    assert.equal(await copyNotice(hugo.id, l => (l === "fr" ? "Retour de la semaine" : "Weekly feedback"), "00000000000000a1"), true);
    assert.equal(chest.outbox.length, 0, "no mail to a member");
    const n = chest.notifications.at(-1)!;
    assert.equal(n.member, hugo.id);
    assert.equal(n.path, "/chest/sent/00000000000000a1");
    assert.equal(n.key, "copy:00000000000000a1");
    assert.equal(shownTo(n, "en").title, "Your answers to Weekly feedback were sent");
    assert.equal(shownTo(n, "fr").title, "Vos réponses à Retour de la semaine sont envoyées");
  } finally {
    await chest.close();
  }
});
