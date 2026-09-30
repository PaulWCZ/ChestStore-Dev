import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { mailState, stateOf } from "../lib/mail-state.ts";
import { everyone } from "./support/members.ts";

// Whether a page may promise an email to a candidate (mail.available(),
// SDK studio.16): the reject, write, interview and cancel forms, and the
// candidate's page once they chose a time.
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "mail"], mail: { domain: "atelier.test", mailboxes: ["jobs"] } });
});
after(async () => {
  await chest.close();
});

test("mail state: ready, not connected, suspended, as the Chest says", async () => {
  chest.delivery.mail = "ready";
  assert.equal(await mailState(), "ready");
  // The owner has not connected the company's mail: nothing would leave,
  // so no form offers an email.
  chest.delivery.mail = "not_connected";
  assert.equal(await mailState(), "off");
  // The Chest stopped sending for now: the outbox keeps it.
  chest.delivery.mail = "suspended";
  assert.equal(await mailState(), "later");
  chest.delivery.mail = "ready";
});

test("mail state: each reason read, a used day's quota is later", () => {
  assert.equal(stateOf({ ok: true, reason: null, remainingToday: 12 }), "ready");
  assert.equal(stateOf({ ok: false, reason: "quota", remainingToday: 0 }), "later");
  assert.equal(stateOf({ ok: false, reason: "suspended", remainingToday: null }), "later");
  assert.equal(stateOf({ ok: false, reason: "not_connected", remainingToday: null }), "off");
  assert.equal(stateOf({ ok: false, reason: "not_granted", remainingToday: null }), "off");
});

test("mail state: a Chest without mail is off, never an error", async () => {
  const bare = await fakeChest({ members: everyone, capabilities: ["members"] });
  try {
    assert.equal(await mailState(), "off");
  } finally {
    await bare.close();
  }
});
