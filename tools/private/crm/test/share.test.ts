import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as companies from "../src/lib/companies.ts";
import * as contacts from "../src/lib/contacts.ts";
import * as deals from "../src/lib/deals.ts";
import * as share from "../src/lib/share.ts";
import { listStages } from "../src/lib/stages.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo } from "./support/members.ts";

// What Clients tells the other tools (Proposal (studio): events between
// tools) — Quotes starts a quote from a won deal.
const manifest = JSON.parse(readFileSync(new URL("../chest.json", import.meta.url), "utf8")) as { emits: Record<string, { description: string; data: Record<string, string> }> };
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  process.env["CHEST_TOOL"] = "crm";
  chest = await fakeChest({ network: {}, members: everyone, emits: manifest.emits });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

async function move(dealId: string, stageId: string, reason?: string) {
  const done = await deals.moveDeal(database.sql, asMember(hugo), dealId, stageId, null, null, reason);
  await share.moved(database.sql, done.deal, done.from, done.to);
  return done;
}

test("a deal moved to Won is told flat with its amount, company (address, SIREN, VAT) and contact — what is blank is left out", async () => {
  const { sql } = database;
  const stages = await listStages(sql);
  const [lead, qualified] = stages;
  const won = stages.find(s => s.kind === "won")!;
  const lost = stages.find(s => s.kind === "lost")!;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Garage Petit", address: "7 route de Vannes", postcode: "44100", city: "Nantes", country: "France", siren: "732 829 320 00074", vat: "FR 12 732829320" });
  const p = await contacts.addContact(sql, asMember(hugo), { name: "Pierre Petit", email: "pierre@garage-petit.fr", company: co.id });
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Workshop lockers", contact: p.id, value: 640050 });
  await move(d.id, qualified!.id);
  assert.equal(chest.emitted.length, 0, "an open move tells nothing");
  await move(d.id, won.id, "Best price");
  assert.equal(chest.emitted.length, 1);
  const [e] = chest.emitted;
  assert.equal(e!.type, "crm.deal.won");
  assert.deepEqual(e!.data, {
    deal: d.id,
    title: "Workshop lockers",
    amount: 640050,
    currency: "EUR",
    companyRef: co.id, companyName: "Garage Petit", companyAddress: "7 route de Vannes", companyPostcode: "44100", companyCity: "Nantes", companyCountry: "FR", companySiren: "732829320", companyVat: "FR12732829320",
    contactName: "Pierre Petit", contactEmail: "pierre@garage-petit.fr",
    owner: hugo.id,
  });
  assert.equal(e!.subject, `deal:${d.id}`);
  assert.match(e!.key ?? "", new RegExp(`^crm:${d.id}:won:\\d+$`, "u"));
  // Leaving Won — reopened, or even to Lost — tells "reopened"; won again is a new event.
  await move(d.id, lead!.id);
  assert.deepEqual([chest.emitted.at(-1)!.type, chest.emitted.at(-1)!.data], ["crm.deal.reopened", { deal: d.id }]);
  await move(d.id, won.id);
  await move(d.id, lost.id);
  assert.deepEqual(chest.emitted.map(x => x.type), ["crm.deal.won", "crm.deal.reopened", "crm.deal.won", "crm.deal.reopened"]);
});

test("a deal without company nor contact sends neither; without events between tools, the move still stands", async () => {
  const { sql } = database;
  const won = (await listStages(sql)).find(s => s.kind === "won")!;
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Bare deal" });
  await move(d.id, won.id);
  const e = chest.emitted.at(-1)!;
  assert.equal(e.type, "crm.deal.won");
  assert.ok(!("companyRef" in e.data) && !("contactName" in e.data), JSON.stringify(e.data));
  const bare = await fakeChest({ network: {}, members: everyone });
  try {
    const other = await deals.addDeal(sql, asMember(hugo), { title: "Unlinked" });
    const done = await move(other.id, won.id);
    assert.ok(done.deal.closedAt, "won anyway");
  } finally {
    await bare.close();
  }
});

test("an emitted text carries no format character (the Chest refuses them); the deal keeps its title as typed", async () => {
  const { sql } = database;
  const won = (await listStages(sql)).find(s => s.kind === "won")!;
  const title = "Family 👨‍👩‍👧 lockers​﻿";
  const d = await deals.addDeal(sql, asMember(hugo), { title });
  await move(d.id, won.id);
  const e = chest.emitted.at(-1)!;
  assert.equal(e.data["title"], "Family 👨👩👧 lockers");
  assert.ok((await deals.deal(sql, asMember(hugo), d.id)).title.includes("\u200d"), "stored as typed");
});
