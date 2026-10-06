import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { addClient, archiveClient, getClient, listClients, updateClient } from "../src/lib/clients.ts";
import { company, missing, updateCompany } from "../src/lib/company.ts";
import { AppError } from "../src/shared/app-error.ts";
import { addItem, archiveItem, listItems, updateItem } from "../src/lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("the company's legal details: the admin's, checked, and what is missing to invoice", async () => {
  const { sql } = database;
  assert.deepEqual(missing(await company(sql)), ["legalName", "legalForm", "address", "postcode", "city", "siren", "vatNumber"]);
  await assert.rejects(updateCompany(sql, asMember(sofia), { legalName: "x" }), refused("forbidden"));
  await assert.rejects(updateCompany(sql, asMember(camille), { siren: "123456789" }), refused("siren_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { siren: "853128940", siret: "81234567600017" }), refused("siret_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { vatNumber: "FR00853128940" }), refused("vat_number_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { iban: "FR7630006000011234567890188" }), refused("iban_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { paymentDays: 121 }), refused("terms_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { invoicePrefix: "D" }), refused("prefix_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { penaltyRate: "101" }), refused("penalty_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { capital: "abc" }), refused("capital_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { franchise: "yes" }), refused("invalid"));
  const c = await updateCompany(sql, asMember(camille), {
    legalName: "Atelier Martin SARL", legalForm: "SARL", capital: "10 000", address: "12 rue des Tanneurs", postcode: "69002", city: "Lyon", siren: "853 128 940",
    siret: "85312894000014", vatNumber: "FR 25 853128940", penaltyRate: "12,15", paymentDays: "45", invoicePrefix: "fac",
  });
  assert.equal(c.capital, 1_000_000);
  assert.equal(c.vatNumber, "FR25853128940");
  assert.equal(c.penaltyRate, 1215);
  assert.equal(c.paymentDays, 45);
  assert.equal(c.invoicePrefix, "FAC");
  assert.equal(c.updatedBy, camille.id);
  assert.deepEqual(missing(c), []);
  // Under the VAT exemption, no VAT number is needed.
  const f = await updateCompany(sql, asMember(camille), { franchise: true, vatNumber: "" });
  assert.deepEqual(missing(f), []);
  await updateCompany(sql, asMember(camille), { penaltyRate: "" });
  assert.equal((await company(sql)).penaltyRate, null);
});

test("clients: added by anyone selling, checked, archived rather than deleted", async () => {
  const { sql } = database;
  await assert.rejects(addClient(sql, asMember(lea), { name: "x" }), refused("forbidden"));
  await assert.rejects(addClient(sql, asMember(nora), { name: "x" }), refused("forbidden"));
  await assert.rejects(addClient(sql, asMember(ines), { name: "" }), refused("empty"));
  await assert.rejects(addClient(sql, asMember(ines), { name: "x", email: "no" }), refused("email_invalid"));
  await assert.rejects(addClient(sql, asMember(ines), { name: "x", siren: "1" }), refused("siren_invalid"));
  await assert.rejects(addClient(sql, asMember(ines), { name: "x", language: "de" }), refused("invalid"));
  await assert.rejects(addClient(sql, asMember(ines), { name: "x", kind: "robot" }), refused("invalid"));
  await assert.rejects(addClient(sql, asMember(ines), { name: "x", country: "France" }), refused("country_invalid"));
  const c = await addClient(sql, asMember(ines), { name: "  Garage Rossi  ", kind: "company", siren: "412 873 564", vatNumber: "fr59412873564", email: "rossi@garage.test", address: "5 rue Neuve\n2e étage", city: "Lyon", country: "fr" });
  assert.equal(c.name, "Garage Rossi");
  assert.equal(c.vatNumber, "FR59412873564");
  assert.equal(c.country, "FR");
  assert.equal(c.address, "5 rue Neuve\n2e étage");
  const eu = await addClient(sql, asMember(hugo), { name: "Brussels Design BV", country: "BE", vatNumber: "BE0477472701", language: "en", reverseCharge: true });
  assert.equal(eu.reverseCharge, true);
  const updated = await updateClient(sql, asMember(hugo), c.id, { contact: "Luca Rossi" });
  assert.equal(updated.contact, "Luca Rossi");
  assert.equal(updated.siren, "412873564");
  assert.deepEqual((await listClients(sql, asMember(lea), { q: "ross" })).map(x => x.name), ["Garage Rossi"]);
  assert.deepEqual((await listClients(sql, asMember(lea), { q: "412873" })).map(x => x.name), ["Garage Rossi"]);
  await archiveClient(sql, asMember(ines), c.id, true);
  assert.ok(!(await listClients(sql, asMember(lea))).some(x => x.id === c.id));
  assert.ok((await listClients(sql, asMember(lea), { archived: true })).some(x => x.id === c.id));
  await archiveClient(sql, asMember(ines), c.id, false);
  assert.equal((await getClient(sql, asMember(lea), c.id)).archived, false);
  await assert.rejects(getClient(sql, asMember(lea), "abc"), refused("not_found"));
  await assert.rejects(listClients(sql, asMember(nora)), refused("forbidden"));
});

test("the catalogue: prices excluding VAT, the French rates, archived rather than deleted", async () => {
  const { sql } = database;
  await assert.rejects(addItem(sql, asMember(lea), { name: "x" }, "EUR"), refused("forbidden"));
  await assert.rejects(addItem(sql, asMember(hugo), { name: "x", vatRate: 1900 }, "EUR"), refused("rate_invalid"));
  await assert.rejects(addItem(sql, asMember(hugo), { name: "x", unitPrice: "abc" }, "EUR"), refused("amount_invalid"));
  await assert.rejects(addItem(sql, asMember(hugo), { name: "x", unitPrice: "100000000" }, "EUR"), refused("amount_invalid"));
  const item = await addItem(sql, asMember(hugo), { name: "Journée de développement", unit: "jour", unitPrice: "650,00", vatRate: 2000 }, "EUR");
  assert.equal(item.unitPrice, 65000);
  const book = await addItem(sql, asMember(sofia), { name: "Guide imprimé", unitPrice: "12.50", vatRate: 550, goods: true }, "EUR");
  assert.equal(book.goods, true);
  const cheaper = await updateItem(sql, asMember(hugo), item.id, { unitPrice: "600" }, "EUR");
  assert.equal(cheaper.unitPrice, 60000);
  assert.deepEqual((await listItems(sql, asMember(lea))).map(i => i.name), ["Guide imprimé", "Journée de développement"]);
  await archiveItem(sql, asMember(hugo), book.id, true);
  assert.deepEqual((await listItems(sql, asMember(lea))).map(i => i.name), ["Journée de développement"]);
  await assert.rejects(updateItem(sql, asMember(hugo), "999", { name: "x" }, "EUR"), refused("not_found"));
});

test("the company's row comes back empty if it was ever missing, and the payment link is https only", async () => {
  const { sql } = database;
  const { company: read, updateCompany: update } = await import("../src/lib/company.ts");
  await assert.rejects(update(sql, asMember(camille), { paymentLink: "http://pay.test" }), (e: unknown) => (e as { code?: string }).code === "link_invalid");
  assert.equal((await update(sql, asMember(camille), { paymentLink: "https://pay.test/x" })).paymentLink, "https://pay.test/x");
  await sql`delete from company`;
  assert.equal((await read(sql)).legalName, "");
});
