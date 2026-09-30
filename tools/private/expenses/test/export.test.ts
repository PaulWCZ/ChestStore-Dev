import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { GET as csvRoute } from "../app/chest/export/csv/route.ts";
import { GET as zipRoute } from "../app/chest/export/zip/route.ts";
import { POST as grantRoute } from "../app/chest/api/receipts/route.ts";
import { GET as receiptRoute } from "../app/chest/receipts/[id]/route.ts";
import * as expenses from "../lib/expenses.ts";
import * as settings from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";
import { upload } from "./support/receipts.ts";
import { readZip } from "./zip.test.ts";

let database: TestDatabase;
let chest: FakeChest;
const cat: Record<string, string> = {};
const yes = async () => true;
const ids: Record<string, string> = {};
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  const { sql } = database;
  for (const r of await sql<{ id: string; key: string }[]>`select id, key from categories`) cat[r.key] = String(r.id);
  // September: Hugo's lunch (receipt, VAT), hotel on the company card, a trip;
  // Léa's supplies; a draft and an August expense that stay out.
  const r1 = await upload(chest, sql, asMember(hugo), "%PDF-1.4 lunch");
  const r2 = await upload(chest, sql, asMember(hugo), "%PDF-1.4 hotel");
  const r3 = await upload(chest, sql, asMember(lea), "%PDF-1.4 pens");
  ids["lunch"] = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "42,50", vat: "3,86", categoryId: cat["meals"], merchant: "=HYPERLINK(\"x\")", note: "Client: Dupont SA", guestMembers: [lea.id], guestNames: ["Jean Dupont (Acme)"] }, r1)).expense.id;
  ids["hotel"] = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-11", amount: "120", vat: "10,91", categoryId: cat["lodging"], merchant: "Hôtel du Parc", paidBy: "company" }, r2)).expense.id;
  await settings.setVehicle(sql, asMember(hugo), { kind: "car", power: "5", electric: false });
  ids["trip"] = (await expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-09-12", from: "Paris", to: "Lyon", distance: "465" })).id;
  ids["pens"] = (await expenses.saveExpense(sql, asMember(lea), null, { spentOn: "2026-09-15", amount: "9,90", vat: "1,65", categoryId: cat["fuel"], merchant: "Station" }, r3)).expense.id;
  ids["draft"] = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-20", amount: "5", categoryId: cat["other"] })).expense.id;
  ids["august"] = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-08-31", amount: "7", categoryId: cat["other"] })).expense.id;
  await expenses.submit(sql, asMember(hugo), [ids["lunch"], ids["hotel"], ids["trip"], ids["august"]], yes);
  await expenses.submit(sql, asMember(lea), [ids["pens"]], yes);
  await expenses.decide(sql, asMember(camille), [ids["lunch"], ids["hotel"], ids["trip"], ids["august"], ids["pens"]], "approve");
  await expenses.markPaid(sql, asMember(camille), [ids["lunch"]], "2026-09-28");
});
after(async () => {
  await chest.close();
  await database.close();
});

const get = (path: string, who: typeof camille | null) => {
  const request = new Request("http://tool.test" + path);
  return who ? withMember(request, who) : request;
};

test("the CSV: the month's approved and paid expenses, in the accountant's language, safe for spreadsheets", async () => {
  const response = await csvRoute(get("/chest/export/csv?month=2026-09", camille));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition") ?? "", /Notes-de-frais_2026-09\.csv/u);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // the BOM: accents survive in spreadsheets
  const lines = new TextDecoder().decode(bytes).trim().split("\r\n");
  assert.equal(lines[0], "Date;Personne;Catégorie;Compte;Où;Détails;Montant HT;TVA;TVA récupérable;Montant TTC;Devise;Taux de change;Montant en EUR;Payé avec;Statut;Validée par;Remboursée le;Fichier justificatif;Référence;Invités");
  assert.equal(lines.length, 5);
  assert.equal(lines[1], `10/09/2026;Hugo Bernard;Repas;625700;"'=HYPERLINK(""x"")";Client: Dupont SA;38,64;3,86;3,86;42,50;EUR;;42,50;Argent personnel;Remboursée;Camille Martin;28/09/2026;2026-09-10_Hugo-Bernard_42-50EUR_E${ids["lunch"]}.pdf;E${ids["lunch"]};Léa Dubois, Jean Dupont (Acme)`);
  // The hotel: VAT not recoverable (0 %), company card.
  assert.equal(lines[2]!.split(";").slice(6, 15).join(";"), "109,09;10,91;0,00;120,00;EUR;;120,00;Carte société;Carte société");
  // The trip: no VAT, the scale in the details.
  assert.equal(lines[3]!.split(";")[5], "Paris → Lyon, 465 km, Voiture 5 CV, Barème kilométrique 2025");
  assert.equal(lines[3]!.split(";").slice(6, 10).join(";"), "295,74;0,00;0,00;295,74");
  // Fuel: 80 % of the VAT.
  assert.equal(lines[4]!.split(";").slice(7, 9).join(";"), "1,65;1,32");
  // English: commas and dots.
  const english = await (await csvRoute(get("/chest/export/csv?month=2026-09&person=" + lea.id, { ...lea, language: "en" }))).status;
  assert.equal(english, 403);
  const en = await (await csvRoute(get("/chest/export/csv?month=2026-09&person=" + lea.id, { ...camille, language: "en" }))).text();
  assert.equal(en.trim().split("\r\n")[1], `2026-09-15,Léa Dubois,Fuel,606100,Station,,8.25,1.65,1.32,9.90,EUR,,9.90,Own money,Approved,Camille Martin,,2026-09-15_Lea-Dubois_9-90EUR_E${ids["pens"]}.pdf,E${ids["pens"]},`);
});

test("the ZIP: every receipt named by date and person, and the CSV, streamed", async () => {
  const response = await zipRoute(get("/chest/export/zip?month=2026-09", camille));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/zip");
  const entries = readZip(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(entries.map(e => e.name), [
    `2026-09-10_Hugo-Bernard_42-50EUR_E${ids["lunch"]}.pdf`,
    `2026-09-11_Hugo-Bernard_120-00EUR_E${ids["hotel"]}.pdf`,
    `2026-09-15_Lea-Dubois_9-90EUR_E${ids["pens"]}.pdf`,
    "Notes-de-frais_2026-09.csv",
  ]);
  assert.equal(new TextDecoder().decode(entries[0]!.data), "%PDF-1.4 lunch");
  assert.match(new TextDecoder().decode(entries[3]!.data), /Paris → Lyon/u);
  // One person.
  const one = readZip(new Uint8Array(await (await zipRoute(get(`/chest/export/zip?month=2026-09&person=${lea.id}`, camille))).arrayBuffer()));
  assert.equal(one.length, 2);
  assert.equal(one[1]!.name, "Notes-de-frais_2026-09_Lea-Dubois.csv");
});

test("exports: accountants only, a real month, a real person", async () => {
  assert.equal((await zipRoute(get("/chest/export/zip?month=2026-09", ines))).status, 403);
  assert.equal((await zipRoute(get("/chest/export/zip?month=2026-09", null))).status, 401);
  assert.equal((await csvRoute(get("/chest/export/csv?month=2026-13", camille))).status, 400);
  assert.equal((await csvRoute(get("/chest/export/csv?month=2026-09&person=bob", camille))).status, 400);
  assert.equal((await csvRoute(get("/chest/export/csv", camille))).status, 400);
});

test("a receipt opens for who may see its expense, through a fresh link; thumbnails only for photos", async () => {
  const open = (id: string, who: typeof camille | null, query = "") => receiptRoute(get(`/chest/receipts/${id}${query}`, who), { params: Promise.resolve({ id }) });
  const own = await open(ids["lunch"]!, hugo);
  assert.equal(own.status, 303);
  assert.match(own.headers.get("Location") ?? "", /\/_chest\/files\//u);
  assert.equal((await open(ids["lunch"]!, camille)).status, 303);
  assert.equal((await open(ids["lunch"]!, lea)).status, 404);
  assert.equal((await open(ids["lunch"]!, null)).status, 401);
  assert.equal((await open(ids["lunch"]!, hugo, "?size=256")).status, 404); // a PDF has no thumbnail
  assert.equal((await open(ids["draft"]!, hugo)).status, 404); // no receipt
  assert.equal((await open("nope", hugo)).status, 404);
});

test("an upload is authorised for a member with a role only, for receipts' types and size", async () => {
  const post = (who: typeof camille | null, body: unknown) => {
    const request = new Request("http://tool.test/chest/api/receipts", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return grantRoute(who ? withMember(request, who) : request);
  };
  const ok = await post(hugo, { type: "image/jpeg", size: 2000 });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { url: string; method: string; object: string };
  assert.equal(body.method, "PUT");
  assert.match(body.object, /^receipts\/\d{4}-\d{2}\/[0-9a-f]{24}\.jpg$/u);
  assert.equal((await post(hugo, { type: "image/svg+xml", size: 2000 })).status, 400);
  assert.equal((await post(hugo, { type: "image/png", size: 20 << 20 })).status, 413);
  assert.equal((await post({ ...hugo, role: null }, { type: "image/png", size: 20 })).status, 403);
  assert.equal((await post(null, {})).status, 401);
});
