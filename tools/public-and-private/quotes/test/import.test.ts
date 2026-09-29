import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { listClients } from "../lib/clients.ts";
import { AppError } from "../lib/errors.ts";
import { clientsCsv, itemsCsv } from "../lib/export.ts";
import { importTable } from "../lib/importers.ts";
import { listItems } from "../lib/items.ts";
import { countryOf, goodsOf, guessMapping, readTable, vatRateOf } from "../lib/parse-import.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea, sofia } from "./support/members.ts";

// Switching costs an afternoon: the clients and the catalogue come from
// the previous tool's spreadsheets. The files in test/fixtures follow the
// columns the French invoicing tools document for their exports and import
// templates (Axonaut, Sellsy, Pennylane — THIRD_PARTY.md says what could
// be verified): French headers, ";" or ",", quoted fields with line breaks,
// "France" for FR, Pennylane's VAT codes (FR_200), prices with a decimal
// comma or including VAT.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const options = { currency: "EUR", defaultLanguage: "fr" as const, today: "2026-09-29" };
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("the values of other tools: VAT rates, kinds, countries", () => {
  assert.deepEqual(["20", "20 %", "20,00", "0.2", "5,5%", "FR_200", "FR_55", "FR_21", "FR_100", "exonéré", "0", "19,6", "FR_196", "abc"].map(vatRateOf),
    [2000, 2000, 2000, 2000, 550, 2000, 550, 210, 1000, 0, 0, null, null, null]);
  assert.deepEqual(["Produit", "Service", "Prestation de services", "Marchandise", "Goods", ""].map(goodsOf), [true, false, false, true, true, null]);
  assert.deepEqual(["France", "Belgique", "Allemagne", "germany", "fr", "Atlantide"].map(countryOf), ["FR", "BE", "DE", "DE", "FR", null]);
});

test("clients from an Axonaut-style export: columns guessed, rows checked, bad ones said", async () => {
  const text = fixture("axonaut-clients.csv");
  const table = readTable(text);
  const mapping = guessMapping("clients", table.head);
  assert.deepEqual(mapping, ["name", "firstName", "contact", "email", "phone", "address", "postcode", "city", "country", "siret", "vatNumber", ""]);
  // Sales may import clients; a viewer may not.
  await assert.rejects(importTable(database.sql, asMember(lea), "clients", text, mapping, options), refused("forbidden"));
  const report = await importTable(database.sql, asMember(hugo), "clients", text, mapping, options);
  assert.equal(report.created, 4);
  assert.deepEqual(report.skipped, [{ line: 5, error: "siret_invalid" }]);
  const all = await listClients(database.sql, asMember(lea));
  const dupain = all.find(c => c.name === "Boulangerie Dupain SAS")!;
  assert.equal(dupain.siren, "812345676"); // from the SIRET
  assert.equal(dupain.contact, "Marie Dupain");
  assert.equal(dupain.country, "FR");
  const lefort = all.find(c => c.name === "Cabinet Lefort; Avocats")!;
  assert.equal(lefort.address, "8 quai Saint-Antoine\n3e étage");
  const verbeke = all.find(c => c.name === "Studio Verbeke BV")!;
  assert.equal(verbeke.country, "BE");
  assert.equal(verbeke.language, "fr"); // Belgium speaks French too: the tool's guess, changeable
  assert.equal(verbeke.vatNumber, "BE0765432146");
  // The same file again doubles nothing.
  const again = await importTable(database.sql, asMember(hugo), "clients", text, mapping, options);
  assert.equal(again.created, 0);
  assert.equal(again.duplicates, 4);
});

test("clients from a Sellsy-style export: individuals, account codes, the same client not twice", async () => {
  const text = fixture("sellsy-clients.csv");
  const table = readTable(text);
  const mapping = guessMapping("clients", table.head);
  assert.deepEqual(mapping, ["name", "kind", "siren", "vatNumber", "address", "address2", "postcode", "city", "country", "email", "phone", "account", "notes"]);
  const report = await importTable(database.sql, asMember(sofia), "clients", text, mapping, options);
  // Dupain came with the Axonaut file (same SIREN).
  assert.deepEqual([report.created, report.duplicates, report.skipped.length], [2, 1, 0]);
  const roux = (await listClients(database.sql, asMember(lea), { q: "Roux" }))[0]!;
  assert.equal(roux.kind, "person");
  assert.equal(roux.address, "5 impasse des Lilas\nBât. B");
  assert.equal(roux.account, "ROUX");
});

test("clients from a Pennylane-style export: countries and languages in words", async () => {
  const text = fixture("pennylane-clients.csv");
  const mapping = guessMapping("clients", readTable(text).head);
  assert.deepEqual(mapping, ["name", "siren", "vatNumber", "address", "postcode", "city", "country", "email", "language", "deliveryAddress"]);
  const report = await importTable(database.sql, asMember(sofia), "clients", text, mapping, options);
  assert.equal(report.created, 2);
  const rhein = (await listClients(database.sql, asMember(lea), { q: "Rhein" }))[0]!;
  assert.deepEqual([rhein.country, rhein.language, rhein.vatNumber], ["DE", "en", "DE129274202"]);
});

test("catalogue items from Pennylane- and Sellsy-style exports: VAT codes, decimal commas, prices including VAT", async () => {
  const products = fixture("pennylane-products.csv");
  const mapping = guessMapping("items", readTable(products).head);
  assert.deepEqual(mapping, ["name", "description", "unit", "unitPrice", "vatRate", "kind"]);
  await assert.rejects(importTable(database.sql, asMember(lea), "items", products, mapping, options), refused("forbidden"));
  const report = await importTable(database.sql, asMember(hugo), "items", products, mapping, options);
  assert.equal(report.created, 3);
  assert.deepEqual(report.skipped, [{ line: 5, error: "rate_invalid" }, { line: 6, error: "amount_invalid" }]);
  const items = await listItems(database.sql, asMember(lea));
  const book = items.find(i => i.name === "Petit manuel de typographie")!;
  assert.deepEqual([book.unitPrice, book.vatRate, book.goods, book.unit], [2400, 550, true, "exemplaire"]);
  assert.equal(items.find(i => i.name === "Formation")!.goods, false);
  const sellsy = fixture("sellsy-items.csv");
  const map2 = guessMapping("items", readTable(sellsy).head);
  assert.deepEqual(map2, ["name", "priceInclVat", "vatRate", "unit"]);
  const r2 = await importTable(database.sql, asMember(hugo), "items", sellsy, map2, options);
  assert.equal(r2.created, 2);
  const all = await listItems(database.sql, asMember(lea));
  // 21.60 incl. 20 % VAT is 18.00; 12.66 incl. 5.5 % is 12.00.
  assert.equal(all.find(i => i.name === "Nom de domaine")!.unitPrice, 1800);
  assert.equal(all.find(i => i.name === "Livre de recettes")!.unitPrice, 1200);
});

test("a mapping is checked again on the server, and a file that is not a table is refused", async () => {
  const text = fixture("pennylane-products.csv");
  await assert.rejects(importTable(database.sql, asMember(hugo), "items", text, ["name"], options), refused("import_invalid"));
  await assert.rejects(importTable(database.sql, asMember(hugo), "items", text, ["name", "name", "", "", "", ""], options), refused("import_invalid"));
  await assert.rejects(importTable(database.sql, asMember(hugo), "items", text, ["", "description", "", "", "", ""], options), refused("import_invalid"));
  await assert.rejects(importTable(database.sql, asMember(hugo), "items", "Nom\n", ["name"], options), refused("import_empty"));
  await assert.rejects(importTable(database.sql, asMember(hugo), "payments", text, [], options), refused("import_invalid"));
  // Invoices to collect are billing's to bring.
  await assert.rejects(importTable(database.sql, asMember(hugo), "invoices", text, [], options), refused("forbidden"));
  await assert.rejects(importTable(database.sql, asMember(hugo), "items", "x".repeat(3 * 1024 * 1024), ["name"], options), refused("import_too_large"));
});

test("what leaves comes back: the clients and catalogue exports import as they are", async () => {
  const { sql } = database;
  await client(sql, { name: "Client exporté", siren: "", vatNumber: "", account: "EXP01" });
  for (const locale of ["fr", "en"] as const) {
    const clientsText = await clientsCsv(sql, asMember(lea), locale);
    const itemsText = await itemsCsv(sql, asMember(lea), locale, "EUR");
    const head = readTable(clientsText).head;
    const mapping = guessMapping("clients", head);
    // Every column but "reverse charge" and "archived" is known.
    assert.equal(mapping.filter(m => m === "").length, 2, `${locale}: ${head.join("|")}`);
    const itemsMapping = guessMapping("items", readTable(itemsText).head);
    assert.equal(itemsMapping.filter(m => m === "").length, 1, `${locale} items`);
    // Into a fresh database: the same clients and items.
    const other = await testDatabase();
    await company(other.sql);
    const r = await importTable(other.sql, asMember(camille), "clients", clientsText, mapping, options);
    const ri = await importTable(other.sql, asMember(camille), "items", itemsText, itemsMapping, options);
    const before = await listClients(sql, asMember(lea));
    const after = await listClients(other.sql, asMember(lea));
    assert.equal(r.created, before.length);
    assert.equal(ri.created, (await listItems(sql, asMember(lea))).length);
    for (const c of before) {
      const twin = after.find(x => x.name === c.name)!;
      assert.deepEqual([twin.kind, twin.siren, twin.vatNumber, twin.address, twin.city, twin.country, twin.email, twin.account], [c.kind, c.siren, c.vatNumber, c.address, c.city, c.country, c.email, c.account], c.name);
    }
    const items = await listItems(other.sql, asMember(lea));
    for (const i of await listItems(sql, asMember(lea))) {
      const twin = items.find(x => x.name === i.name)!;
      assert.deepEqual([twin.unitPrice, twin.vatRate, twin.goods, twin.unit], [i.unitPrice, i.vatRate, i.goods, i.unit], i.name);
    }
    await other.close();
    // testDatabase took over db(): give it back.
    (await import("../lib/db.ts")).provide(sql);
  }
  await assert.rejects(clientsCsv(sql, asMember(hugo), "fr"), refused("forbidden"));
});
