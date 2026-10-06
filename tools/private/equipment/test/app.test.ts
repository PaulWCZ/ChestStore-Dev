import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { catalogue } from "../src/i18n/index.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { camille, everyone, hugo, ines, nora, sofia } from "./support/members.ts";

atLeast(14);

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL
// (TEST_DATABASE_URL, or PGlite). The services have their own tests;
// these check what the server adds: routes, pages, islands, actions, the
// refusals, the look, the policy, downloads, the Chest's own deliveries.
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "equipment", members: everyone, chest: { organization: "Atelier Martin", publicUrl: null } });
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await chest.close();
  await database.close();
});

const origin = "https://equipment-chest.chest.test";
const url = (path: string) => `${origin}${path}`;
async function get(who: FakeMember | null, path: string, headers: Record<string, string> = {}) {
  const response = await app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
}
const html = async (who: FakeMember | null, path: string) => (await get(who, path)).text();
// An action as call() sends it from an island.
async function call(who: FakeMember, name: string, input: unknown, headers: Record<string, string> = {}) {
  const response = await app.fetch(withMember(new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

let laptops = "", licences = "", mac = "", figma = "";

test("a manager's first page: their language, the policy, no inline script or style, the look as a stylesheet", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const page = await response.text();
  assert.match(page, /<html lang="fr">/u);
  // An empty tool says what it is for, with its two first steps.
  assert.match(page, /Ajouter votre premier objet|Importer un tableur/u);
  assert.match(page, /<link rel="stylesheet" href="\/chest\/look.css\?v=[\w-]+"\/>/u);
  assert.match(page, /<link rel="icon" href="\/assets\/icon.svg"/u);
  const sheet = await get(camille, /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(page)![1]!);
  assert.equal(sheet.status, 200);
  assert.match(await sheet.text(), /\/assets\/fonts\/ibm-plex-sans-latin-wght-normal\.woff2/u);
  assert.equal((await get(null, "/assets/icon.svg")).status, 200);
  assert.equal((await get(null, "/assets/fonts/ibm-plex-sans-latin-wght-normal.woff2")).status, 200);
});

test("items made by an action; refusals are a code and the reader's words", async () => {
  const categories = await database.sql<{ id: string; key: string }[]>`select id::text, key from categories`;
  laptops = categories.find(c => c.key === "laptop")!.id;
  licences = categories.find(c => c.key === "licence")!.id;
  const made = await call(sofia, "createItem", { input: { categoryId: laptops, name: "MacBook Pro 14", serial: "C02XK1", price: "2 399,00", supplier: "=HYPERLINK(\"x\")" } });
  assert.equal(made.status, 200);
  assert.equal(made.value.length, 1);
  assert.equal(made.value[0].tag, "EQ-0001");
  mac = made.value[0].id;
  figma = (await call(sofia, "createItem", { input: { categoryId: licences, name: "Figma", seats: "2" } })).value[0].id;
  const money = await call(camille, "createItem", { input: { categoryId: laptops, name: "x", price: "lots" } });
  assert.deepEqual([money.status, money.error, money.message], [400, "invalid_money", "Saisissez un montant comme 1299,90."]);
  const member = await call(hugo, "createItem", { input: { categoryId: laptops, name: "Mine now" } });
  assert.deepEqual([member.status, member.error], [403, "forbidden"]);
  assert.equal((await call(sofia, "giveItem", { id: "abc", to: { member: hugo.id } })).error, "invalid");
  assert.equal((await call(sofia, "noSuchAction", {})).status, 404);
  assert.equal((await call(sofia, "deleteItem", { id: mac }, { "sec-fetch-site": "cross-site" })).status, 403);
});

test("give and take back from the item's page: the island's actions, the history, Undo", async () => {
  const given = await call(sofia, "giveItem", { id: mac, to: { member: hugo.id }, note: "Like new" });
  assert.equal(given.ok, true);
  const page = await html(sofia, `/chest/items/${mac}`);
  assert.match(page, /data-island="ItemControls"/u);
  assert.match(page, new RegExp(`id="i-item-${mac}"`, "u"));
  assert.match(page, /Hugo Bernard/u);
  assert.match(page, /Like new/u);
  // The label's QR code opens the item's page on the Chest's team host.
  assert.match(page, /role="img" aria-label="https:\/\/equipment-chest\.chest\.test\/chest\/items\/\d+"/u);
  const back = await call(sofia, "takeBackItem", { id: mac, note: "Scratched" });
  assert.deepEqual(back.value, { member: hugo.id });
  const undo = await call(sofia, "undoTakeBack", { id: mac, to: back.value });
  assert.equal(undo.ok, true);
  assert.equal((await database.sql<{ holder: string }[]>`select holder from items where id = ${mac}`)[0]!.holder, hugo.id);
  // A seat of a licence, never more than bought.
  assert.equal((await call(sofia, "giveSeat", { id: figma, member: hugo.id })).ok, true);
  assert.equal((await call(sofia, "giveSeat", { id: figma, member: hugo.id })).error, "has_seat");
});

test("a member: My equipment first, their item's short view, nothing of anyone else's", async () => {
  const mine = await html(hugo, "/chest");
  assert.match(mine, /My equipment/u);
  assert.match(mine, /MacBook Pro 14/u);
  assert.match(mine, /data-island="ReceiveButton"/u);
  const own = await html(hugo, `/chest/items/${mac}`);
  assert.match(own, /C02XK1/u);
  assert.doesNotMatch(own, /2[  ,.]?399/u, "no price for a member");
  const other = await html(ines, `/chest/items/${mac}`);
  assert.doesNotMatch(other, /C02XK1/u, "no one else's serial number");
  // "I received it", from the island.
  assert.equal((await call(hugo, "confirmReceipt", { id: mac, remark: "" })).ok, true);
  assert.equal((await call(ines, "confirmReceipt", { id: mac })).ok, false, "only the holder");
  // Someone whose role gives nothing: the kit's NoAccess, and nothing read.
  assert.match(await html(nora, "/chest"), /You can’t use this tool yet/u);
  assert.equal((await get(nora, "/chest/items")).status, 200);
});

const managersPages = ["/chest/items/new", "/chest/items/1/edit", "/chest/import", "/chest/settings", "/chest/inventory", "/chest/inventory/1", "/chest/labels", "/chest/people", `/chest/people/${hugo.id}`, `/chest/people/${hugo.id}/return`, "/chest/export"];

test("every managers' page answers a member 403, the kit's NoAccess with the managers' words and a way to their own things", async () => {
  for (const path of managersPages) {
    const response = await get(ines, path);
    assert.equal(response.status, 403, path);
    const page = await response.text();
    assert.match(page, /Cette page est réservée aux gestionnaires/u, path);
    assert.match(page, /href="\/chest\/mine"/u, path);
    assert.match(page, /ck-no-access/u, path);
  }
  // Something a member may not see at all is "not found": someone else's sheet.
  assert.equal((await get(ines, `/chest/people/${hugo.id}/handover`)).status, 404);
  assert.equal((await get(hugo, `/chest/people/${hugo.id}/handover`)).status, 200);
});

test("every page a manager opens renders, in their words", async () => {
  const pages = ["/chest", "/chest/mine", "/chest/items", `/chest/items/${mac}`, "/chest/items/new", `/chest/items/${mac}/edit`, "/chest/people", `/chest/people/${hugo.id}`, `/chest/people/${hugo.id}/handover`, `/chest/people/${hugo.id}/return`, "/chest/inventory", "/chest/labels?all=1", "/chest/import", "/chest/settings", "/chest/people/erased"];
  for (const path of pages) {
    const response = await get(sofia, path);
    assert.equal(response.status, 200, path);
  }
  const overview = await html(sofia, "/chest");
  assert.match(overview, /Needs your attention/u);
  assert.match(overview, /data-island="SearchBox"/u);
  // A sheet is printed as proof: the company, the person, signatures.
  const sheet = await html(sofia, `/chest/people/${hugo.id}/handover`);
  assert.match(sheet, /Atelier Martin/u);
  assert.match(sheet, /Hugo Bernard/u);
  assert.match(sheet, /data-island="PrintButton"/u);
  assert.equal((await get(sofia, "/chest/items/999999")).status, 404);
  assert.equal((await get(sofia, "/chest/people/not-a-member")).status, 404);
});

test("the list: search, filters, pages; a tag typed exactly opens its item", async () => {
  const list = await html(sofia, "/chest/items?q=macbook");
  assert.match(list, /data-island="ItemsView"/u);
  assert.match(list, /MacBook Pro 14/u);
  const exact = await get(sofia, "/chest/items?q=eq-0001");
  assert.equal(exact.status, 302);
  assert.equal(exact.headers.get("location"), `/chest/items/${mac}`);
  assert.doesNotMatch(await html(sofia, "/chest/items?status=retired"), /MacBook Pro 14/u);
});

test("the export: CSV in the reader's language, written as it is read, formulas defused", async () => {
  const response = await get(camille, "/chest/export?sort=name");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="materiel-\d{4}-\d{2}-\d{2}\.csv"$/u);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a byte-order mark: spreadsheets read UTF-8");
  const text = new TextDecoder().decode(bytes.slice(3));
  const h = catalogue("fr").export.headers;
  assert.ok(text.startsWith([h.tag, h.name, h.category].join(",")), text.slice(0, 40));
  assert.match(text, /EQ-0001,MacBook Pro 14,/u);
  assert.match(text, /"'=HYPERLINK\(""x""\)"/u);
  assert.match(text, /2399\.00,EUR/u);
});

test("the photo: one upload granted, the file sent to the Chest, recorded, then a signed link", async () => {
  const grant = await call(sofia, "uploadPhoto", { id: mac, size: 100 });
  assert.equal(grant.ok, true);
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const put = await fetch(grant.value.url, { method: "PUT", body: png, headers: { "Content-Type": "image/png" } });
  assert.ok(put.ok);
  const { name } = await put.json() as { name: string };
  assert.equal((await call(sofia, "savePhoto", { id: mac, name: "photos/1/../../etc" })).error, "invalid");
  assert.equal((await call(sofia, "savePhoto", { id: mac, name })).ok, true);
  const link = await get(hugo, `/chest/items/${mac}/photo`);
  assert.equal(link.status, 303);
  assert.ok(link.headers.get("location"));
  assert.equal((await call(hugo, "uploadPhoto", { id: mac, size: 100 })).error, "forbidden");
  assert.equal((await call(sofia, "uploadPhoto", { id: mac, size: 20 << 20 })).error, "file_too_large");
  // The invoice is the managers' only.
  assert.equal((await get(hugo, `/chest/items/${mac}/invoice`)).status, 404);
  assert.equal((await call(sofia, "removePhoto", { id: mac })).ok, true);
});

test("an import: the file's text checked, then written; the same file twice adds nothing", async () => {
  const text = "Name,Category,Serial number\nThinkPad T14,Laptop,PF-1\nDell U2723,Screen,CN-2\n";
  const checked = await call(sofia, "checkImport", { source: "csv", text });
  assert.equal(checked.ok, true);
  assert.equal(checked.value.rows.length, 2);
  const run = await call(sofia, "runImport", { source: "csv", text });
  assert.equal(run.value.imported, 2);
  assert.equal((await call(sofia, "runImport", { source: "csv", text })).value.imported, 0);
  assert.equal((await call(sofia, "checkImport", { source: "csv", text: "x".repeat(6 << 20) })).status, 400);
  assert.equal((await call(sofia, "checkIntune", {})).error, "intune_not_connected");
});

test("the inventory: started, items seen by tag, closed with what was missed", async () => {
  assert.equal((await call(sofia, "startInventory", {})).ok, true);
  const seen = await call(sofia, "markSeen", { text: "EQ-0001" });
  assert.equal(seen.value.tag, "EQ-0001");
  assert.equal((await call(sofia, "markSeen", { text: "NOPE-1" })).error, "no_such_tag");
  const closed = await call(sofia, "closeInventory", {});
  assert.ok(closed.value.missing >= 1);
  const report = await get(sofia, `/chest/inventory/${closed.value.id}`);
  assert.equal(report.status, 200);
  assert.match(await report.text(), /ThinkPad T14/u);
});

test("the Chest's own deliveries reach the server: events and schedules, signed", async () => {
  const to = (request: Request) => app.fetch(request);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: ines.id } }, to), 204);
  assert.equal(await chest.run("weekly", to), 204);
  assert.equal(await chest.run("returns", to), 204);
  assert.equal(await chest.run("intune", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  assert.equal((await app.fetch(new Request(url("/chest-events"), { method: "POST", body: "{}" }))).status, 401);
});

test("outside /chest: the page that says where the tool lives, in the visitor's language; 404 elsewhere", async () => {
  const home = await get(null, "/", { "accept-language": "fr-FR,fr;q=0.9" });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Cet outil se trouve dans votre Chest/u);
  assert.equal((await get(null, "/nothing")).status, 404);
  assert.equal((await get(null, "/fonts/ibm-plex-sans-latin-wght-normal.woff2")).status, 404, "files live under /assets/");
  const lang = await get(null, "/lang/fr?back=/");
  assert.match(lang.headers.get("set-cookie") ?? "", /^lang=fr;/u);
});

test("an action refused without JavaScript comes back to its page", async () => {
  const request = withMember(new Request(url("/chest/actions/askFor"), { method: "POST", body: new URLSearchParams({ body: "" }), headers: { "sec-fetch-site": "same-origin", referer: url("/chest/mine"), host: "equipment-chest.chest.test" } }), hugo);
  const response = await app.fetch(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/chest/mine?error=empty");
});
