import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { addClient, getClient } from "../lib/clients.ts";
import { crmKey, readWon } from "../lib/crm.ts";
import { getDocument, saveDraft, sendQuote } from "../lib/documents.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { company, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea } from "./support/members.ts";

// Clients (the CRM) → Quotes: a deal won becomes a draft quote, once; a
// deal reopened takes back an untouched draft.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, chest: { organization: "Atelier Martin", currency: "EUR", language: "fr" } });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const told = (type: "crm.deal.won" | "crm.deal.reopened", data: Record<string, unknown>) => chest.deliver({ type, source: "crm", data }, POST);
const won = (deal: string, extra: Record<string, unknown> = {}) => ({
  deal, title: "Refonte du site", amount: 480000, currency: "EUR", owner: hugo.id,
  company: { ref: "co-1", name: "Menuiserie Blanc SARL", address: "4 rue du Bois", postcode: "69005", city: "Lyon", country: "FR", siren: "790451215", vat: "FR89790451215", email: "contact@blanc.test" },
  contact: { name: "Julie Blanc", email: "julie@blanc.test" },
  ...extra,
});
const quoteOf = async (deal: string) => (await database.sql<{ id: number }[]>`select id from documents where crm_deal = ${deal}`)[0]?.id;

test("a deal won: a new client from the company, a draft quote of the amount, the owner told — once", async () => {
  const { sql } = database;
  assert.equal(await told("crm.deal.won", won("D1")), 204);
  const id = await quoteOf("D1");
  assert.ok(id);
  const q = await getDocument(sql, asMember(lea), String(id), today);
  assert.equal(q.status, "draft");
  assert.equal(q.title, "Refonte du site");
  assert.equal(q.crmTitle, "Refonte du site");
  assert.equal(q.createdBy, hugo.id);
  assert.deepEqual(q.lines.map(l => [l.description, l.quantity, l.unitPrice, l.vatRate]), [["Refonte du site", 1000, 480000, 2000]]);
  assert.equal(q.gross, 576000);
  assert.equal(q.client?.name, "Menuiserie Blanc SARL");
  assert.equal(q.client?.externalRef, "crm:co-1");
  assert.equal(q.client?.contact, "Julie Blanc");
  assert.equal(q.client?.siren, "790451215");
  const bell = chest.notifications.filter(n => n.key === crmKey("D1"));
  assert.deepEqual(bell.map(n => n.member), [hugo.id]);
  assert.equal(bell[0]?.title, "Deal won in Clients: Refonte du site");
  // Delivered again (another event id): no second quote.
  assert.equal(await told("crm.deal.won", won("D1")), 204);
  const [n] = await sql<{ n: number }[]>`select count(*)::int as n from documents where crm_deal = 'D1'`;
  assert.equal(n?.n, 1);
  // A second deal of the same company finds the same client.
  await told("crm.deal.won", won("D2", { title: "Maintenance", amount: 90000 }));
  const q2 = await getDocument(sql, asMember(lea), String(await quoteOf("D2")), today);
  assert.equal(q2.clientId, q.clientId);
});

test("an existing client is linked by SIREN and only completed: what a person wrote is never overwritten", async () => {
  const { sql } = database;
  const mine = await addClient(sql, asMember(ines), { name: "Garage Rossi (atelier)", siren: "412873564", contact: "Luca", address: "45 av. Jean Jaurès", city: "Lyon", email: "" });
  await told("crm.deal.won", won("D3", { company: { ref: "co-9", name: "GARAGE ROSSI SARL", address: "1 autre rue", postcode: "69007", city: "Villeurbanne", country: "FR", siren: "412873564", vat: "FR59412873564", email: "compta@rossi.test" }, contact: null }));
  const c = await getClient(sql, asMember(lea), mine.id);
  assert.equal(c.name, "Garage Rossi (atelier)");
  assert.equal(c.contact, "Luca");
  assert.equal(c.address, "45 av. Jean Jaurès");
  assert.equal(c.city, "Lyon");
  assert.equal(c.email, "compta@rossi.test", "an empty field filled");
  assert.equal(c.postcode, "69007");
  assert.equal(c.vatNumber, "FR59412873564");
  assert.equal(c.externalRef, "crm:co-9");
});

test("an owner without a Quotes role: the draft is the tool's, and the sales people are told", async () => {
  await told("crm.deal.won", won("D4", { owner: lea.id }));
  const q = await getDocument(database.sql, asMember(lea), String(await quoteOf("D4")), today);
  assert.equal(q.createdBy, "tool:crm");
  assert.deepEqual(chest.notifications.filter(n => n.key === crmKey("D4")).map(n => n.member).sort(), [hugo.id, ines.id].sort());
});

test("no amount, another currency, no company: an empty line, a person as client", async () => {
  await told("crm.deal.won", won("D5", { amount: null, company: null, contact: { name: "Jeanne Roux", email: "jeanne@example.test" } }));
  const q = await getDocument(database.sql, asMember(lea), String(await quoteOf("D5")), today);
  assert.equal(q.lines[0]?.unitPrice, 0);
  assert.equal(q.client?.kind, "person");
  assert.equal(q.client?.name, "Jeanne Roux");
  await told("crm.deal.won", won("D6", { currency: "USD" }));
  assert.equal((await getDocument(database.sql, asMember(lea), String(await quoteOf("D6")), today)).lines[0]?.unitPrice, 0);
});

test("a deal reopened: an untouched draft goes (and can come back); a changed or sent one stays, and says so", async () => {
  const { sql } = database;
  await told("crm.deal.won", won("D7"));
  assert.ok(await quoteOf("D7"));
  assert.equal(await told("crm.deal.reopened", { deal: "D7" }), 204);
  assert.equal(await quoteOf("D7"), undefined);
  assert.equal(chest.notifications.filter(n => n.key === crmKey("D7")).length, 0, "bell item withdrawn");
  await told("crm.deal.won", won("D7"));
  assert.ok(await quoteOf("D7"), "won again, a new draft");
  // Changed by a person: kept.
  await told("crm.deal.won", won("D8"));
  const changed = String(await quoteOf("D8"));
  await saveDraft(sql, asMember(hugo), changed, { title: "Refonte du site — v2" });
  await told("crm.deal.reopened", { deal: "D8" });
  const kept = await getDocument(sql, asMember(lea), changed, today);
  assert.ok(kept.crmReopenedAt);
  // Sent: kept too.
  await told("crm.deal.won", won("D9"));
  const sent = String(await quoteOf("D9"));
  await sendQuote(sql, asMember(hugo), sent, null, today);
  await told("crm.deal.reopened", { deal: "D9" });
  assert.equal((await getDocument(sql, asMember(lea), sent, today)).status, "sent");
});

test("as Clients sends it: the address as free text, the rest null — nothing invented", async () => {
  await told("crm.deal.won", { deal: "D12", title: "Site vitrine", amount: 120000, currency: "EUR", owner: hugo.id,
    company: { ref: "co-12", name: "Atelier Céramique Noé", address: "14 montée de la Grande-Côte\n69001 Lyon", postcode: null, city: null, country: null, siren: null, vat: null, email: null },
    contact: { name: "Noé Garnier", email: null } });
  const q = await getDocument(database.sql, asMember(lea), String(await quoteOf("D12")), today);
  assert.equal(q.client?.name, "Atelier Céramique Noé");
  assert.equal(q.client?.address, "14 montée de la Grande-Côte\n69001 Lyon");
  assert.deepEqual([q.client?.postcode, q.client?.city, q.client?.siren, q.client?.vatNumber, q.client?.email], ["", "", "", "", ""]);
  assert.equal(q.client?.contact, "Noé Garnier");
});

test("events of another shape are accepted and change nothing", async () => {
  const { sql } = database;
  const [before] = await sql<{ n: number }[]>`select count(*)::int as n from documents`;
  for (const data of [
    {}, { deal: "x y", title: "t", amount: 1, currency: "EUR" }, { deal: "D10", title: "", amount: 1, currency: "EUR" }, { deal: "D10", title: "t", amount: 1.5, currency: "EUR" },
    { deal: "D10", title: "t", amount: -1, currency: "EUR" }, { deal: "D10", title: "t", amount: 1, currency: "euro" }, { deal: "D10", title: "t", amount: 1, currency: "EUR", owner: "bob" },
    { deal: "D10", title: "t", amount: 1, currency: "EUR", company: "Blanc" }, { deal: "D10", title: "t", amount: 1, currency: "EUR", company: { ref: "a b", name: "x" } },
  ]) assert.equal(await told("crm.deal.won", data), 204);
  assert.equal(await told("crm.deal.reopened", { deal: 42 }), 204);
  assert.equal(await told("crm.deal.reopened", { deal: "nobody" }), 204);
  const [after] = await sql<{ n: number }[]>`select count(*)::int as n from documents`;
  assert.equal(after?.n, before?.n);
  // Invalid fields of a valid company are dropped, not trusted.
  const read = readWon({ deal: "D11", title: "  Site\n ", amount: 1, currency: "EUR", company: { ref: "c", name: "X", siren: "123", vat: "1", email: "no", country: "France" } });
  assert.deepEqual(read?.company && { siren: read.company.siren, vat: read.company.vat, email: read.company.email, country: read.company.country }, { siren: "", vat: "", email: "", country: "FR" });
  assert.equal(read?.title, "Site");
});
