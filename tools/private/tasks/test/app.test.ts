import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { atLeast, checkPage } from "@argentic/chest-app/testing";

atLeast(11);

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL (PGlite,
// or TEST_DATABASE_URL). The services have their own tests; these check
// what the server adds: routes, pages, islands, actions, the look, the
// policy, the Chest's own deliveries.
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "tasks", members: everyone, capabilities: ["database", "members", "files", "notifications"] });
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await chest.close();
  await database.close();
});

const url = (path: string) => `https://tasks-chest.chest.test${path}`;
const get = (who: FakeMember | null, path: string, headers: Record<string, string> = {}) =>
  app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
// An action as call() sends it from an island.
async function call(who: FakeMember, name: string, input: unknown, headers: Record<string, string> = {}) {
  const response = await app.fetch(withMember(new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string; redirect?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

let boardId = "", todo = "", done = "", first = "", second = "";

test("a member's page: their language, the policy, no inline script or style, the look as a stylesheet", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Mes tâches/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look.css\?v=[\w-]+"\/>/u);
  checkPage(html);
  assert.match(html, /<meta name="theme-color"/u);
  assert.doesNotMatch(html, /\sstyle="/u);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u);
  assert.doesNotMatch(html, /<style/u);
  // Each island is its own root, with its own prefix for the ids it makes.
  const prefixes = [...html.matchAll(/data-prefix="([^"]+)"/gu)].map(m => m[1]);
  assert.ok(prefixes.length >= 3);
  assert.equal(new Set(prefixes).size, prefixes.length);
});

test("the look: the company's choice as a stylesheet, its address the hash of its text", async () => {
  const linkOf = async () => /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(await (await get(hugo, "/chest")).text())![1]!;
  const own = await linkOf();
  const sheet = await get(hugo, own);
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") ?? "", /^text\/css/u);
  const css = await sheet.text();
  assert.match(css, /--accent:/u);
  assert.match(css, /\/assets\/fonts\/space-grotesk-latin-wght-normal\.woff2/u);
  // The company's choice: another sheet at another address.
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  const chosen = await linkOf();
  assert.notEqual(chosen, own);
  assert.doesNotMatch(await (await get(hugo, chosen)).text(), /space-grotesk/u);
  chest.theme.all = { mode: "own" };
  assert.equal((await get(null, "/look.css")).status, 200);
  assert.equal((await get(null, "/assets/icon.svg")).status, 200);
});

test("a board made by an action opens at once; its page has the board and the card as islands", async () => {
  const made = await call(hugo, "createBoard", { name: "Launch", template: "simple", visibility: "team" });
  assert.equal(made.ok, true);
  assert.match(made.redirect ?? "", /^\/chest\/boards\/[0-9]+$/u);
  boardId = made.redirect!.split("/").pop()!;
  const cols = await database.sql<{ id: string; done: boolean }[]>`select id::text, done from columns where board_id = ${boardId} order by position`;
  todo = cols[0]!.id;
  done = cols.find(c => c.done)!.id;
  first = (await call(hugo, "addCard", { board: boardId, column: todo, title: "Book the truck" })).value.id;
  second = (await call(hugo, "addCard", { board: boardId, column: todo, title: "Load the truck" })).value.id;
  const page = checkPage(await (await get(hugo, `/chest/boards/${boardId}?card=${second}`)).text());
  assert.match(page, /data-island="BoardView"/u);
  assert.match(page, /data-island="CardPanel"/u);
  assert.match(page, /<title>Load the truck · Launch · Tasks<\/title>/u);
  assert.match(page, /Book the truck/u);
  assert.doesNotMatch(page, /\sstyle="/u);
  // The timeline places its bars with classes, never a style attribute.
  await call(hugo, "updateCard", { id: first, start: new Date().toISOString().slice(0, 10), due: null });
  const timeline = checkPage(await (await get(hugo, `/chest/boards/${boardId}?view=timeline`)).text());
  for (const view of ["list", "calendar"]) checkPage(await (await get(hugo, `/chest/boards/${boardId}?view=${view}`)).text());
  for (const path of ["/chest/boards", "/chest/search?q=truck", "/chest/import", `/chest/boards/${boardId}/settings`]) checkPage(await (await get(camille, path)).text());
  assert.match(timeline, /tl-bar tl-from-\d+ tl-len-1/u);
  assert.doesNotMatch(timeline, /\sstyle="/u);
});

test("moves: a card waiting for another is refused in the reader's words, then done anyway", async () => {
  assert.equal((await call(hugo, "addBlocker", { id: second, blocker: first })).ok, true);
  const refused = await call(ines, "moveCard", { id: second, column: done });
  assert.equal(refused.status, 400);
  assert.equal(refused.error, "blocked");
  assert.match(refused.message ?? "", /^Bloquée\s:\s«\sBook the truck\s» n’est pas encore faite\.$/u);
  assert.equal((await call(ines, "moveCard", { id: second, column: done, force: true })).ok, true);
  const [row] = await database.sql`select column_id::text from cards where id = ${second}`;
  assert.equal(row!["column_id"], done);
});

test("refusals: a code and the reader's words; a role that gives nothing, nothing", async () => {
  const empty = await call(hugo, "addCard", { board: boardId, column: todo, title: "  " });
  assert.equal(empty.status, 400);
  assert.deepEqual([empty.error, empty.message], ["empty", "Write something first."]);
  const long = await call(hugo, "updateBoard", { id: boardId, name: "x".repeat(81) });
  assert.equal(long.message, "Too long: 80 characters at most.");
  assert.equal((await call(hugo, "noSuchAction", {})).status, 404);
  assert.equal((await call(nora, "addCard", { board: boardId, column: todo, title: "x" })).status, 404, "no role: the board is not there");
  const noRole = await (await get(nora, "/chest")).text();
  assert.match(noRole, /You can’t use Tasks yet/u);
  assert.doesNotMatch(noRole, /data-island="TaskGroups"/u);
});

test("cross-site requests are refused", async () => {
  const crossSite = withMember(new Request(url("/chest/actions/addCard"), { method: "POST", body: JSON.stringify({ board: boardId, column: todo, title: "x" }), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "cross-site" } }), hugo);
  assert.equal((await app.fetch(crossSite)).status, 403);
  const noHeader = withMember(new Request(url("/chest/actions/addCard"), { method: "POST", body: JSON.stringify({ board: boardId, column: todo, title: "x" }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), hugo);
  assert.equal((await app.fetch(noHeader)).status, 403, "JSON without the island's header");
});

test("an import may send 10 MB; any other action 1 MiB", async () => {
  const csv = "Title,Column,Notes\n" + Array.from({ length: 400 }, (_, i) => `Card number ${i},To do,${"A long note. ".repeat(250)}`).join("\n");
  assert.ok(csv.length > 1 << 20);
  const imported = await call(hugo, "importBoard", { kind: "csv", text: csv, name: "Big", visibility: "private" });
  assert.equal(imported.ok, true);
  assert.equal(imported.value.cards, 400);
  const big = withMember(new Request(url("/chest/actions/addCard"), { method: "POST", body: JSON.stringify({ board: boardId, column: todo, title: "x".repeat(2 << 20) }), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } }), hugo);
  assert.equal((await app.fetch(big)).status, 413);
});

test("a file: granted, sent to the Chest, recorded, opened by a fresh link", async () => {
  const grant = await call(hugo, "uploadFile", { id: first, size: 9 });
  assert.equal(grant.ok, true);
  const put = await chest.upload(grant.value.url, "a, b, c\n", "text/csv");
  assert.equal(put.status < 300, true);
  const { name } = await put.json() as { name: string };
  const recorded = await call(hugo, "recordFile", { id: first, name, fileName: "list.csv" });
  assert.equal(recorded.ok, true);
  assert.equal((await call(hugo, "recordFile", { id: first, name: "cards/1/elsewhere", fileName: "x" })).error, "invalid");
  assert.equal((await call(hugo, "uploadFile", { id: first, size: 30 << 20 })).error, "file_too_large");
  const open = await get(hugo, `/chest/files/${recorded.value.id}`);
  assert.equal(open.status, 303);
  assert.match(open.headers.get("location") ?? "", /\/_chest\/files\//u);
});

test("downloads and a card's own address", async () => {
  const csv = await get(hugo, `/chest/boards/${boardId}/export?format=csv`);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.headers.get("content-disposition") ?? "", /^attachment; filename=".+\.csv"$/u);
  assert.equal((await get(hugo, "/chest/export")).status, 403, "every board: managers only");
  assert.equal((await get(camille, "/chest/export")).status, 200);
  const address = await get(ines, `/chest/cards/${first}`);
  assert.equal(address.status, 302);
  assert.equal(address.headers.get("location"), `/chest/boards/${boardId}?card=${first}`);
  assert.equal((await get(ines, "/chest/cards/999999")).status, 404);
  assert.equal((await get(ines, "/chest/boards/999999")).status, 404);
});

test("the Chest's own deliveries: schedules and events, signed, each handled once", async () => {
  const to = (request: Request) => app.fetch(request);
  assert.equal(await chest.run("morning", to), 204);
  assert.equal(await chest.run("retry", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  const unsigned = await app.fetch(new Request(url("/chest-schedules"), { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
  assert.equal(unsigned.status, 401);
  const erased = { type: "member.erased" as const, id: "evt_" + "c".repeat(26), data: { id: ines.id, erasure: "era_" + "b".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(erased, to), 204);
  assert.equal(await chest.emit(erased, to), 204);
  assert.deepEqual(chest.acknowledged, [erased.data.erasure]);
});

test("errors: the reader's page and the right status, outside /chest too", async () => {
  const missing = await get(camille, "/chest/nothing");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Rien ici/u);
  assert.equal((await get(null, "/nothing")).status, 404);
  assert.equal((await get(null, "/assets/nothing.js")).status, 404);
  assert.match(await (await get(null, "/", { "accept-language": "fr" })).text(), /Tâches se trouve dans votre Chest/u);
});
