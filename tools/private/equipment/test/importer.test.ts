import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "@argentic/chest-app";
import { listCategories } from "../src/lib/categories.ts";
import { csvRow, toCsv, parseCsv } from "../src/lib/csv.ts";
import { exportRows } from "../src/lib/export.ts";
import { allFields } from "../src/lib/fields.ts";
import { catalogue } from "../src/i18n/index.ts";
import { applyImport, plan, previewImport, readDate, type Context } from "../src/lib/importer.ts";
import * as items from "../src/lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
const M = asMember(camille);

// The header of Snipe-IT's own sample file (sample_csvs/assets-sample.csv),
// with its byte-order mark and US dates.
const snipe = "﻿Company,Name,Asset Tag,Category,Supplier,Manufacturer,Location,Order Number,Model,Model Notes,Model Number,Asset Notes,Purchase Date,Purchase Cost,Checkout Type,Checked Out To: Username,Checked Out To: First Name,Checked Out To: Last Name,Checked Out To: Email,Checkout Location,Asset EOL Date\n" +
  "Atelier,,SN-001,Laptops,Apple,Apple,Paris,PO-1,MacBook Air 13,,A2681,Charger missing,1/23/23,\"1,199.00\",user,hugo.bernard,Hugo,Bernard,hugo@example.test,,1/23/27\n" +
  "Atelier,Hall screen,SN-002,Monitors,Dell,Dell,Paris,,U2723QE,,,,3/5/24,549,location,,,,,Reception,\n" +
  "Atelier,,SN-003,Phones,Apple,Apple,,,iPhone 15,,,,12/1/23,899.00,user,jdoe,John,Doe,jdoe@example.test,,\n" +
  "Atelier,,SN-001,Laptops,Apple,Apple,,,MacBook Air 13,,,,,,,,,,,,\n" +
  "Atelier,,SN-004,Drones,DJI,DJI,,,Mini 4,,,,,,,,,,,,\n" +
  "Atelier,,SN-005,Laptops,,,,,,,,,,,,,,,,,\n";

// A French spreadsheet: semicolons, day-first dates, euros, a warranty in
// months, a name written "Last First".
const french = "Nom;Catégorie;N° de série;Détenteur;Date d'achat;Prix;Fournisseur;Garantie (mois);Statut\n" +
  "Écran Dell 27\";Écrans;CN-0X1;Inès Moreau;15/03/2024;349,90 €;LDLC;36;\n" +
  "Badge accueil;Clés et badges;;;;;;;Perdu\n" +
  "Casque Jabra;Accessoires;JB-9;Moreau Inès;;;;;\n" +
  "Licence Figma;Logiciels;;;;;;;\n";

async function context(): Promise<Context> {
  const cats = await listCategories(database.sql, M);
  return {
    people: everyone.map(p => ({ id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName, photo: null, role: p.role, locale: "en" as const })),
    tags: new Set(), serials: new Set(),
    categories: cats.map(c => ({ id: c.id, key: c.key, name: c.name, kind: c.kind })),
    fields: [],
  };
}

test("Snipe-IT's CSV: model and maker, US dates, holders by name, places, new categories, duplicates", async () => {
  const p = plan(snipe, "snipe", await context());
  assert.equal(p.rows.length, 6);
  const [mac, screen, iphone, dup, drone, noName] = p.rows;
  assert.equal(mac!.name, "Apple MacBook Air 13");
  assert.equal(mac!.tag, "SN-001");
  assert.equal(mac!.holder, hugo.id);
  assert.equal(mac!.status, "in_use");
  assert.equal(mac!.purchasedOn, "2023-01-23");
  assert.equal(mac!.priceCents, 119900);
  assert.equal(mac!.notes, "Charger missing");
  assert.equal(mac!.category.ref?.key, "laptop");
  assert.equal(screen!.name, "Dell U2723QE");
  assert.equal(screen!.notes, "Hall screen");
  assert.equal(screen!.category.ref?.key, "screen");
  assert.equal(screen!.place, "Reception");
  assert.equal(screen!.purchasedOn, "2024-03-05");
  assert.equal(iphone!.holder, null);
  assert.equal(iphone!.status, "in_stock");
  assert.deepEqual(iphone!.problems, [{ code: "holder_not_found", name: "John Doe" }]);
  assert.equal(dup!.skip, "duplicate");
  assert.equal(drone!.category.newName, "Drones");
  assert.equal(noName!.skip, "no_name");
  assert.deepEqual(p.newCategories, ["Drones"]);
  assert.ok(p.ignored.includes("Location") && p.ignored.includes("Asset EOL Date") && p.ignored.includes("Company"));
  // A column of its own (Snipe-IT's order number) may be kept as a field.
  assert.deepEqual(p.offered, ["Order Number"]);
  assert.deepEqual(p.newFields, [{ name: "Order Number", categoryId: mac!.category.ref!.id, categoryName: null, type: "text" }]);
  assert.deepEqual(mac!.extraNew, { "Order Number": "PO-1" });
  const without = plan(snipe, "snipe", await context(), { keep: [] });
  assert.deepEqual(without.newFields, []);
  assert.ok(without.ignored.includes("Order Number"));
});

test("a French spreadsheet: day-first dates, euros, warranty in months, “Last First”, statuses in French", async () => {
  const p = plan(french, "csv", await context());
  const [screen, badge, headset, figma] = p.rows;
  assert.equal(screen!.holder, ines.id);
  assert.equal(screen!.purchasedOn, "2024-03-15");
  assert.equal(screen!.warrantyUntil, "2027-03-15");
  assert.equal(screen!.priceCents, 34990);
  assert.equal(screen!.supplier, "LDLC");
  assert.equal(screen!.category.ref?.key, "screen");
  assert.equal(badge!.status, "lost");
  assert.equal(badge!.category.ref?.key, "key");
  assert.equal(headset!.holder, ines.id);
  assert.equal(headset!.category.ref?.key, "accessory");
  assert.equal(figma!.category.ref?.key, "licence");
  assert.equal(figma!.seats, 1);
  assert.equal(figma!.holder, null);
});

test("dates as spreadsheets write them", () => {
  assert.equal(readDate("2024-3-5", "dmy"), "2024-03-05");
  assert.equal(readDate("05/03/2024", "dmy"), "2024-03-05");
  assert.equal(readDate("3/5/24", "mdy"), "2024-03-05");
  assert.equal(readDate("2024-03-05 10:00:00", "dmy"), "2024-03-05");
  assert.equal(readDate("", "dmy"), null);
  assert.throws(() => readDate("March 5", "dmy"), AppError);
});

test("a file that is not a table is refused", async () => {
  const c = await context();
  for (const bad of ["", "just one line", "Colour;Size\nred;big\n", 42]) {
    assert.throws(() => plan(bad, "csv", c), (e: unknown) => e instanceof AppError && e.code === "import_invalid");
  }
});

test("the import adds the items, gives them, and a second import of the same file adds nothing", async () => {
  const { sql } = database;
  await assert.rejects(previewImport(sql, asMember(hugo), "snipe", snipe), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  await assert.rejects(applyImport(sql, asMember(hugo), "snipe", snipe), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  await assert.rejects(applyImport(sql, M, "excel", snipe), (e: unknown) => e instanceof AppError && e.code === "invalid");
  const first = await applyImport(sql, M, "snipe", snipe);
  assert.deepEqual(first, { imported: 4, skipped: 2, fields: 1 });
  const [mac] = await items.listItems(sql, M, { q: "SN-001" });
  assert.equal(mac!.holder, hugo.id);
  const detail = await items.itemDetail(sql, M, mac!.id);
  assert.ok(detail.full);
  assert.deepEqual(detail.history.map(h => h.kind).reverse(), ["imported", "given"]);
  assert.ok((await listCategories(sql, M)).some(c => c.name === "Drones"));
  const again = await applyImport(sql, M, "snipe", snipe);
  assert.equal(again.imported, 0);
  const fr = await applyImport(sql, M, "csv", french);
  assert.equal(fr.imported, 4);
  // Imported rows without a tag take the tool's own series.
  assert.ok((await items.listItems(sql, M, { q: "Casque" }))[0]!.tag.startsWith("EQ-"));
  // No bell for an import: it would be one item per row.
  assert.equal(chest.notifications.length, 0);
});

test("this tool's own export reads back, in English and in French", async () => {
  const { sql } = database;
  const all = await items.listItems(sql, M);
  for (const locale of ["en", "fr"] as const) {
    const t = catalogue(locale);
    const text = toCsv(exportRows(all, t, "EUR", id => (id === hugo.id ? "Hugo Bernard" : id === ines.id ? "Inès Moreau" : "")));
    assert.equal(parseCsv(text)[0]![0], t.export.headers.tag);
    const c = await context();
    c.tags = new Set();
    const p = plan(text, "csv", c);
    assert.equal(p.rows.length, all.length);
    const byTag = new Map(p.rows.map(r => [r.tag, r]));
    for (const item of all) {
      const r = byTag.get(item.tag)!;
      assert.equal(r.name, item.name, `${locale} name`);
      assert.equal(r.status === "in_use" ? r.holder ?? r.place : null, item.status === "in_use" ? item.holder ?? item.place : null, `${locale} holder of ${item.tag}`);
      assert.equal(r.priceCents, item.priceCents, `${locale} price`);
      assert.equal(r.purchasedOn, item.purchasedOn, `${locale} date`);
    }
    // Against the tool itself, every row is already here.
    const same = await previewImport(sql, M, "csv", text);
    assert.ok(same.rows.every(r => r.skip === "exists"));
  }
});

// Snipe-IT's own exports, as its source writes them (test/fixtures/, columns
// cited in THIRD_PARTY.md): the Custom Asset Report and the assets list's
// export, with custom fields.
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

test("Snipe-IT's Custom Asset Report: holders, places, statuses, the asset's notes, custom fields kept", async () => {
  const p = plan(fixture("snipe-it-custom-asset-report.csv"), "snipe", await context());
  const byTag = new Map(p.rows.map(r => [r.tag, r]));
  assert.equal(p.rows.length, 9);
  const mac = byTag.get("ATL-0012")!;
  assert.equal(mac.name, "Apple MacBook Pro 14\" M3");
  assert.equal(mac.serial, "C02XK1ZZMD6T");
  assert.equal(mac.holder, hugo.id);
  assert.equal(mac.status, "in_use");
  assert.equal(mac.since, "2024-02-14");
  assert.equal(mac.purchasedOn, "2024-02-12");
  assert.equal(mac.priceCents, 239900);
  assert.equal(mac.warrantyUntil, "2027-02-12");
  assert.equal(mac.supplier, "Apple Store Business");
  // The asset's notes (the last "Notes"), not the user's.
  assert.equal(mac.notes, "Charger and USB-C hub included.");
  assert.deepEqual(mac.extraNew, { "Order Number": "PO-2024-017", RAM: "16", "Operating System": "macOS 15 Sequoia", "MAC Address": "A4:83:E7:1B:22:9C" });
  const phone = byTag.get("ATL-0013")!;
  assert.equal(phone.holder, ines.id);
  assert.equal(phone.category.ref?.key, "phone");
  assert.equal(phone.notes, "Inès — phone\nLine 06 12 34 56 79");
  assert.equal(phone.extraNew["IMEI"], "356938035643809");
  const screen = byTag.get("ATL-0014")!;
  assert.equal(screen.holder, null);
  assert.equal(screen.place, "Meeting room Atlas");
  assert.equal(screen.status, "in_use");
  assert.equal(byTag.get("ATL-0015")!.status, "in_stock");
  assert.equal(byTag.get("ATL-0015")!.priceCents, 134900);
  assert.equal(byTag.get("ATL-0016")!.status, "lost");
  assert.equal(byTag.get("ATL-0017")!.status, "in_repair");
  assert.equal(byTag.get("ATL-0018")!.status, "retired");
  // Checked out to another asset (a dock on a laptop): with nobody here.
  const dock = byTag.get("ATL-0019")!;
  assert.equal(dock.holder, null);
  assert.equal(dock.place, null);
  assert.deepEqual(dock.problems, []);
  assert.deepEqual(byTag.get("ATL-0020")!.problems, [{ code: "holder_not_found", name: "John Doe" }]);
  // Snipe-IT's own columns are not offered as fields; its custom fields are.
  assert.deepEqual(p.offered, ["Order Number", "IMEI", "RAM", "Operating System", "MAC Address"]);
  for (const own of ["Current Value", "Company", "Location", "Default Location", "URL", "Last Audit", "Employee No.", "Manager"]) assert.ok(p.ignored.includes(own), own);
  const ram = p.newFields.find(f => f.name === "RAM")!;
  assert.equal(ram.type, "number");
  assert.equal(ram.categoryId, mac.category.ref!.id);
  assert.equal(p.newFields.find(f => f.name === "IMEI")!.type, "text");
  assert.deepEqual(p.newFields.filter(f => f.name === "Operating System").map(f => f.categoryId).sort(), [mac.category.ref!.id, phone.category.ref!.id].sort());
});

test("Snipe-IT's assets list export reads too", async () => {
  const p = plan(fixture("snipe-it-assets-list-export.csv"), "snipe", await context());
  const [air, galaxy] = p.rows;
  assert.equal(air!.holder, camille.id);
  assert.equal(air!.status, "in_use");
  assert.equal(air!.purchasedOn, "2023-10-05");
  assert.equal(air!.priceCents, 129900);
  assert.equal(air!.warrantyUntil, "2026-10-05");
  assert.equal(galaxy!.status, "in_stock");
  assert.equal(galaxy!.notes, "Spare phone for on-call week.");
  assert.equal(galaxy!.extraNew["IMEI"], "352099001761499");
});

test("importing the Custom Asset Report makes the fields and fills them", async () => {
  const { sql } = database;
  const text = fixture("snipe-it-custom-asset-report.csv");
  const done = await applyImport(sql, M, "snipe", text, { keep: ["IMEI", "RAM", "Operating System"] });
  assert.equal(done.imported, 9);
  // IMEI (phones), RAM (laptops), Operating System (both) — and Order
  // Number for phones: laptops already have that field (the import above),
  // so that column is always read.
  assert.equal(done.fields, 5);
  const fields = await allFields(sql);
  const [mac] = await items.listItems(sql, M, { q: "ATL-0012" });
  const ram = fields.find(f => f.name === "RAM" && f.categoryId === mac!.category.id)!;
  assert.equal(mac!.extra[ram.id], "16");
  assert.equal(fields.some(f => f.name === "MAC Address"), false, "a column not kept makes no field");
  const [phone] = await items.listItems(sql, M, { q: "356938035643809" });
  assert.equal(phone!.tag, "ATL-0013");
  // Twice: nothing more, and the columns now match the fields.
  const again = await previewImport(sql, M, "snipe", text);
  assert.ok(again.rows.every(r => r.skip === "exists"));
  assert.deepEqual(again.offered, ["MAC Address"]);
});

test("CSV as spreadsheets write it: quotes, doubled quotes, line breaks inside, ; or ,, a mark, \\r\\n", () => {
  assert.deepEqual(parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\n1,,3\n\n'), [["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"], ["1", "", "3"]]);
  assert.deepEqual(parseCsv("a;b\nc;d,e\r"), [["a", "b"], ["c", "d,e"]]);
  assert.deepEqual(parseCsv('a,b\n"q"tail,x"y\nend,'), [["a", "b"], ["qtail", 'x"y'], ["end", ""]]);
  assert.equal(parseCsv("h\n" + "r\n".repeat(50), 10).length, 11, "stops past the rows asked");
  // The export's own line, read back.
  assert.deepEqual(parseCsv(csvRow(["a;b", "=1+1", 'q"'], ";")), [["a;b", "'=1+1", 'q"']]);
});
