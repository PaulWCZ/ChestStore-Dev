import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { idempotencyKey } from "@argentic/chest-sdk/mail";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as arrivals from "../lib/arrivals.ts";
import * as j from "../lib/journeys.ts";
import { addDays } from "../lib/model.ts";
import { mailState, stateOf } from "../lib/mailing.ts";
import { welcome, welcomeLetter } from "../lib/welcome.ts";
import { today } from "../lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, nora, tom } from "./support/members.ts";

// The welcome email (Proposal (studio) "mail"): a welcome checklist
// started for a member, or for an arrival with a work address, sends the
// newcomer a short email in their language, signed by HR, who is the
// reply address; once per checklist; the person's own email choice
// followed; nothing for a leaving checklist, a first day long past, an
// arrival without a work address, or a Chest without mail.

let database: TestDatabase;
let chest: FakeChest;
const address = (key: string) => `${key}@atelier.test`;
const withAddresses = everyone.map(p => ({ ...p, email: address(p.firstName.toLowerCase()), ...(p.id === tom.id ? { mailPreference: "none" as const } : {}) }));
const chestWith = (mail: boolean) => fakeChest({
  tool: "people", members: withAddresses, capabilities: ["members", "members.email", "notifications", ...(mail ? ["mail" as const] : [])],
  ...(mail ? { mail: { domain: "atelier.test" } } : {}), settings: { company: "Atelier Martin", locale: "en" },
});
before(async () => {
  database = await testDatabase();
  chest = await chestWith(true);
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from journeys`;
  await database.sql`delete from arrivals`;
  await database.sql`delete from templates`;
  chest.outbox.length = 0;
  chest.held.length = 0;
});

const hr = asMember({ ...camille, email: address("camille") });
async function templates() {
  const welcomeList = await j.createTemplate(database.sql, hr, { kind: "onboarding", name: "Newcomer" });
  await j.addTemplateItem(database.sql, hr, welcomeList.id, { text: "Fill in your profile", role: "person", offset: 1 });
  await j.addTemplateItem(database.sql, hr, welcomeList.id, { text: "Order the laptop", role: "hr", offset: -3 });
  const leaving = await j.createTemplate(database.sql, hr, { kind: "offboarding", name: "Leaving" });
  await j.addTemplateItem(database.sql, hr, leaving.id, { text: "Return the laptop", role: "person", offset: 0 });
  return { welcomeList, leaving };
}

test("a member's welcome checklist: a short email in their language, signed by HR, who is the reply address; once", async () => {
  const { sql } = database;
  const { welcomeList } = await templates();
  const first = addDays(today(), 5);
  const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: welcomeList.id, anchor: first });
  assert.equal(await welcome(sql, hr, started.id), true);
  assert.equal(chest.outbox.length, 1);
  const letter = chest.outbox[0]!;
  assert.deepEqual(letter.to, [address("nora")]);
  assert.equal(letter.subject, "Bienvenue chez Atelier Martin, Nora");
  assert.match(letter.text, /^Bonjour Nora,\n\nBienvenue chez Atelier Martin ! Votre premier jour est le /u);
  assert.match(letter.text, /\nÀ très bientôt,\nCamille Martin$/u);
  assert.equal(letter.replyTo, address("camille"));
  assert.equal(letter.fromName, "Camille Martin");
  // Sent again (a retry): the key names the checklist, nothing twice.
  assert.equal(await welcome(sql, hr, started.id), true);
  assert.equal(chest.outbox.length, 1);
  // The key carries the recipient (SDK studio.16): after a restore, the
  // same checklist id for someone else is another key.
  assert.equal(letter.key, idempotencyKey(`people:welcome:${started.id}:${nora.id}`));
});

test("an arrival with a work address: in the Chest's language, with their manager; without one (Hiring's), nothing", async () => {
  const { sql } = database;
  const { welcomeList } = await templates();
  const coming = await arrivals.addArrival(sql, hr, { name: "Lucie Garnier", job: "Sales associate", startDate: addDays(today(), 10), managerId: hugo.id, workEmail: "lucie.garnier@atelier.test" });
  const started = await j.startJourney(sql, hr, { arrivalId: coming.id, templateId: welcomeList.id, anchor: addDays(today(), 10) });
  assert.equal(await welcome(sql, hr, started.id), true);
  const letter = chest.outbox.at(-1)!;
  assert.deepEqual(letter.to, ["lucie.garnier@atelier.test"]);
  assert.equal(letter.subject, "Welcome to Atelier Martin, Lucie");
  assert.match(letter.text, /Hugo Bernard will be your manager\./u);
  assert.match(letter.text, /You will get access to the company’s Chest/u);
  assert.equal(letter.key, idempotencyKey(`people:welcome:${started.id}:lucie.garnier@atelier.test`));

  const noAddress = await arrivals.addArrival(sql, hr, { name: "Marc Roux", startDate: addDays(today(), 3) });
  const other = await j.startJourney(sql, hr, { arrivalId: noAddress.id, templateId: welcomeList.id, anchor: addDays(today(), 3) });
  assert.equal(await welcome(sql, hr, other.id), false);
  assert.equal(chest.outbox.length, 1);
});

test("not for a leaving checklist, nor a first day more than two weeks past; the person's own choice is followed", async () => {
  const { sql } = database;
  const { welcomeList, leaving } = await templates();
  const bye = await j.startJourney(sql, hr, { personId: hugo.id, templateId: leaving.id, anchor: addDays(today(), 20) });
  assert.equal(await welcome(sql, hr, bye.id), false);
  const late = await j.startJourney(sql, hr, { personId: hugo.id, templateId: welcomeList.id, anchor: addDays(today(), -15) });
  assert.equal(await welcome(sql, hr, late.id), false);
  const recent = await j.startJourney(sql, hr, { personId: hugo.id, templateId: welcomeList.id, anchor: addDays(today(), -3) });
  assert.equal(await welcome(sql, hr, recent.id), true);
  assert.equal(chest.outbox.length, 1);
  // Tom chose no email from the Chest: held, and the page does not say "sent".
  const none = await j.startJourney(sql, hr, { personId: tom.id, templateId: welcomeList.id, anchor: addDays(today(), 2) });
  assert.equal(await welcome(sql, hr, none.id), false);
  assert.deepEqual(chest.held.map(h => [h.member, h.reason]), [[tom.id, "none"]]);
  assert.equal(chest.outbox.length, 1);
});

test("a Chest without mail: nothing fails, nothing is said to be sent", async () => {
  const { sql } = database;
  const { welcomeList } = await templates();
  await chest.close();
  chest = await chestWith(false);
  try {
    const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: welcomeList.id, anchor: addDays(today(), 5) });
    assert.equal(await welcome(sql, hr, started.id), false);
  } finally {
    await chest.close();
    chest = await chestWith(true);
  }
});

test("the letter: English, with the link to the first steps once the newcomer has the Chest", () => {
  const letter = welcomeLetter({ locale: "en", name: "Nora", company: "", anchor: "2026-10-05", manager: null, sender: "Camille Martin", link: "https://team.atelier.test/chest/todo", linked: true });
  assert.equal(letter.subject, "Welcome, Nora");
  // ICU writes "Monday 5 October" or "Monday, 5 October" by version.
  assert.equal(letter.text.replace("Monday, ", "Monday "), [
    "Hello Nora,", "", "Welcome to the team! Your first day is Monday 5 October 2026.", "",
    "Your first steps are ready in People, in the company’s Chest:", "https://team.atelier.test/chest/todo", "", "See you soon,", "Camille Martin",
  ].join("\n"));
});

test("the start form's promise: mail ready, not connected, suspended (mail.available(), studio.16)", async () => {
  chest.delivery.mail = "ready";
  assert.equal(await mailState(), "ready");
  chest.delivery.mail = "not_connected";
  assert.equal(await mailState(), "off");
  chest.delivery.mail = "suspended";
  assert.equal(await mailState(), "later");
  chest.delivery.mail = "ready";
  assert.equal(stateOf({ ok: false, reason: "quota", remainingToday: 0 }), "later");
  assert.equal(stateOf({ ok: false, reason: "not_granted", remainingToday: null }), "off");
});

test("a Chest without mail: the form says no welcome email will leave", async () => {
  await chest.close();
  chest = await chestWith(false);
  try {
    assert.equal(await mailState(), "off");
  } finally {
    await chest.close();
    chest = await chestWith(true);
  }
});
