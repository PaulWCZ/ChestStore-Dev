import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { idempotencyKey } from "@argentic/chest-sdk/mail";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import * as arrivals from "../src/lib/arrivals.ts";
import * as j from "../src/lib/journeys.ts";
import { addDays } from "../src/shared/model.ts";
import { mailState, stateOf } from "../src/lib/mailing.ts";
import { welcome, welcomeLetter, welcomeNotice } from "../src/lib/welcome.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, nora, tom } from "./support/members.ts";

// The welcome: a welcome checklist started for a member tells them in a
// notification (English with its French; the Chest mails it by their
// choice); for an arrival not in the Chest yet, with a work address, a
// short email through the Chest's mail connector (Proposal (studio)
// "mail"), signed by HR, who is the reply address; once per checklist;
// nothing for a leaving checklist, a first day long past, an arrival
// without a work address, or a Chest without the connector.

let database: TestDatabase;
let chest: FakeChest;
const address = (key: string) => `${key}@atelier.test`;
const withAddresses = everyone.map(p => ({ ...p, email: address(p.firstName.toLowerCase()) }));
// connected: the owner connected the company's mail provider to the Chest.
const chestWith = (connected: boolean) => fakeChest({ network: {},
  tool: "people", members: withAddresses, capabilities: ["members", "members.email", "notifications", "mail"],
  mail: { domain: "atelier.test", connected }, chest: { organization: "Atelier Martin", language: "en" },
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
  chest.notifications.length = 0;
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

test("a member's welcome checklist: a notification, never an email — English with its French, signed by HR, opening their first steps; once", async () => {
  const { sql } = database;
  const { welcomeList } = await templates();
  const first = addDays(today(), 5);
  const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: welcomeList.id, anchor: first });
  assert.equal(await welcome(sql, hr, started.id), "notice");
  assert.equal(chest.outbox.length, 0, "no email to a member");
  const told = chest.notifications.filter(n => n.key === `welcome:${started.id}`);
  assert.deepEqual(told.map(n => n.member), [nora.id]);
  assert.equal(told[0]!.title, "Welcome to Atelier Martin, Nora");
  assert.equal(told[0]!.path, "/chest/todo");
  assert.match(told[0]!.body ?? "", /Your first steps are ready in People\. — Camille Martin$/u);
  const fr = shownTo(told[0]!, "fr");
  assert.equal(fr.title, "Bienvenue chez Atelier Martin, Nora");
  assert.match(fr.body ?? "", /^Bienvenue chez Atelier Martin.*Votre premier jour est le .*— Camille Martin$/u);
  // Sent again (a retry): the same key, one item.
  assert.equal(await welcome(sql, hr, started.id), "notice");
  assert.equal(chest.notifications.filter(n => n.key === `welcome:${started.id}` && n.member === nora.id).length, 1);
});

test("an arrival with a work address: in the Chest's language, with their manager; without one (Hiring's), nothing", async () => {
  const { sql } = database;
  const { welcomeList } = await templates();
  const coming = await arrivals.addArrival(sql, hr, { name: "Lucie Garnier", job: "Sales associate", startDate: addDays(today(), 10), managerId: hugo.id, workEmail: "lucie.garnier@atelier.test" });
  const started = await j.startJourney(sql, hr, { arrivalId: coming.id, templateId: welcomeList.id, anchor: addDays(today(), 10) });
  assert.equal(await welcome(sql, hr, started.id), "email");
  const letter = chest.outbox.at(-1)!;
  assert.deepEqual(letter.to, ["lucie.garnier@atelier.test"]);
  assert.equal(letter.subject, "Welcome to Atelier Martin, Lucie");
  assert.match(letter.text, /Hugo Bernard will be your manager\./u);
  assert.match(letter.text, /You will get access to the company’s Chest/u);
  assert.equal(letter.key, idempotencyKey(`people:welcome:${started.id}:lucie.garnier@atelier.test`));
  // Signed by HR, who is the reply address (else the company's).
  assert.equal(letter.replyTo, address("camille"));
  assert.equal(letter.fromName, "Camille Martin");
  assert.match(letter.text, /\nSee you soon,\nCamille Martin$/u);
  // Sent again (a retry): the key names the checklist, nothing twice.
  assert.equal(await welcome(sql, hr, started.id), "email");
  assert.equal(chest.outbox.length, 1);

  const noAddress = await arrivals.addArrival(sql, hr, { name: "Marc Roux", startDate: addDays(today(), 3) });
  const other = await j.startJourney(sql, hr, { arrivalId: noAddress.id, templateId: welcomeList.id, anchor: addDays(today(), 3) });
  assert.equal(await welcome(sql, hr, other.id), null);
  assert.equal(chest.outbox.length, 1);
});

test("not for a leaving checklist, nor a first day more than two weeks past", async () => {
  const { sql } = database;
  const { welcomeList, leaving } = await templates();
  const bye = await j.startJourney(sql, hr, { personId: hugo.id, templateId: leaving.id, anchor: addDays(today(), 20) });
  assert.equal(await welcome(sql, hr, bye.id), null);
  const late = await j.startJourney(sql, hr, { personId: hugo.id, templateId: welcomeList.id, anchor: addDays(today(), -15) });
  assert.equal(await welcome(sql, hr, late.id), null);
  const recent = await j.startJourney(sql, hr, { personId: tom.id, templateId: welcomeList.id, anchor: addDays(today(), -3) });
  assert.equal(await welcome(sql, hr, recent.id), "notice");
  assert.deepEqual(chest.notifications.filter(n => n.key?.startsWith("welcome:")).map(n => n.member), [tom.id]);
  assert.equal(chest.outbox.length, 0);
});

test("a Chest without the mail connector: a member is still welcomed; an arrival is not, and nothing fails", async () => {
  const { sql } = database;
  const { welcomeList } = await templates();
  await chest.close();
  chest = await chestWith(false);
  try {
    const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: welcomeList.id, anchor: addDays(today(), 5) });
    assert.equal(await welcome(sql, hr, started.id), "notice");
    const coming = await arrivals.addArrival(sql, hr, { name: "Lucie Garnier", startDate: addDays(today(), 10), workEmail: "lucie.garnier@atelier.test" });
    const arrival = await j.startJourney(sql, hr, { arrivalId: coming.id, templateId: welcomeList.id, anchor: addDays(today(), 10) });
    assert.equal(await welcome(sql, hr, arrival.id), null);
  } finally {
    await chest.close();
    chest = await chestWith(true);
  }
});

test("the letter to an arrival and the notice to a member, word for word", () => {
  const input = { locale: "en" as const, name: "Nora", company: "", anchor: "2026-10-05", manager: null, sender: "Camille Martin" };
  const letter = welcomeLetter(input);
  assert.equal(letter.subject, "Welcome, Nora");
  // ICU writes "Monday 5 October" or "Monday, 5 October" by version.
  assert.equal(letter.text.replace("Monday, ", "Monday "), [
    "Hello Nora,", "", "Welcome to the team! Your first day is Monday 5 October 2026.", "",
    "You will get access to the company’s Chest; your first steps will be waiting for you in People.", "", "See you soon,", "Camille Martin",
  ].join("\n"));
  const notice = welcomeNotice({ ...input, manager: "Hugo Bernard" });
  assert.equal(notice.title, "Welcome, Nora");
  assert.equal(notice.body.replace("Monday, ", "Monday "), "Welcome to the team! Your first day is Monday 5 October 2026. Hugo Bernard will be your manager. Your first steps are ready in People. — Camille Martin");
});

test("the start form's promise: mail ready, not connected, suspended (mail.available(), studio.16)", async () => {
  chest.delivery.mail = "ready";
  assert.equal(await mailState(), "ready");
  chest.delivery.mail = "not_connected";
  assert.equal(await mailState(), "off");
  chest.delivery.mail = "suspended";
  assert.equal(await mailState(), "later");
  chest.delivery.mail = "ready";
  assert.equal(stateOf({ ok: false, reason: "quota", remainingToday: 0, replyTo: null }), "later");
  assert.equal(stateOf({ ok: false, reason: "not_granted", remainingToday: null, replyTo: null }), "off");
});

test("a Chest without the mail connector: the form says no welcome email will leave", async () => {
  await chest.close();
  chest = await chestWith(false);
  try {
    assert.equal(await mailState(), "off");
  } finally {
    await chest.close();
    chest = await chestWith(true);
  }
});
