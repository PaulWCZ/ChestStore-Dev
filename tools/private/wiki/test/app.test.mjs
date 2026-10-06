import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { testDatabase } from "./support/db.ts";
import { camille, everyone, groups, hugo, ines, lea, nora, tom } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL
// (TEST_DATABASE_URL, or PGlite) with the sample handbook of
// seed/sample.sql. The services are tested on their own in the other
// files; here, what the server adds: routes, policy, look, pages and their
// islands, actions, the editor's beacon, the import's upload, downloads,
// the Chest's signed calls.
atLeast(12);
let chest, database, app;
before(async () => {
  chest = await fakeChest({
    tool: "wiki",
    network: {},
    members: everyone,
    capabilities: ["members", "files", "notifications", "groups"],
    groups: [
      { id: groups.office, name: "Office", members: [camille.id] },
      { id: groups.sales, name: "Sales", members: [ines.id, hugo.id] },
      { id: groups.tech, name: "Tech", members: [tom.id, lea.id] },
    ],
    chest: { timeZone: "Europe/Paris", organization: "Lumen & Co", publicUrl: null },
  });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://wiki-chest.chest.test";
const url = path => `${team}${path}`;
const get = (who, path, headers = {}) => app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
const page = async (who, path) => {
  const response = await get(who, path);
  assert.equal(response.status, 200, path);
  return checkPage(await response.text());
};
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

test("home: the member's language, the policy, the look as a stylesheet, the sections and the sidebar", async () => {
  const response = await get(lea, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = checkPage(await response.text());
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Wiki<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /data-island="Sidebar"/u);
  assert.match(html, /data-island="Search"/u, "the header's search");
  assert.match(html, /Que cherchez-vous/u);
  assert.doesNotMatch(html, /href="\/chest\/trash"/u, "a reader without My pages has no trash");
  assert.match(await page(tom, "/chest"), /href="\/chest\/trash"/u);
  assert.equal((await get(null, "/chest")).status, 401);
  // No role: why, not an error, and no sections.
  const none = await page(nora, "/chest");
  assert.match(none, /You can’t open the wiki yet/u);
  assert.doesNotMatch(none, /data-island="Sidebar"/u);
});

test("the look: Library by default, kept a year by its hash, 304 when the browser has it", async () => {
  const html = await page(hugo, "/chest");
  const v = /look\.css\?v=([\w-]{16})/u.exec(html)[1];
  const sheet = await get(hugo, `/chest/look.css?v=${v}`);
  assert.equal(sheet.status, 200);
  assert.equal(sheet.headers.get("cache-control"), "private, max-age=31536000, immutable");
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#1d5b43/u, "the wiki's own identity: Library");
  assert.match(css, /url\(\/assets\/fonts\/newsreader-latin-wght-normal\.woff2\)/u);
  assert.equal((await get(hugo, "/chest/look.css", { "if-none-match": sheet.headers.get("etag") })).status, 304);
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  assert.doesNotMatch(await page(hugo, "/chest"), new RegExp(`look\\.css\\?v=${v}`, "u"));
  chest.theme.all = null;
  forgetTheme();
});

test("a page: its text from the server, the islands people act on, the editor's tools for editors only", async () => {
  const html = await page(tom, "/chest/pages/2");
  assert.match(html, /<title>[^<]+ · Wiki<\/title>/u);
  assert.match(html, /<div class="prose">/u);
  assert.match(html, /data-island="PageActions"/u);
  assert.match(html, /data-island="Comments"/u);
  assert.match(html, /data-island="AutoRefresh"/u);
  assert.equal((await get(hugo, "/chest/pages/999")).status, 404);
  assert.equal((await get(hugo, "/chest/pages/abc")).status, 404);
  assert.match(await (await get(lea, "/chest/pages/999")).text(), /Rien ici[\s\S]*Retour au wiki/u);
  // A space kept to the office: not even its title for others.
  const kept = (await database.sql`select id from pages where space_id = 4 limit 1`)[0];
  if (kept) {
    assert.equal((await get(hugo, `/chest/pages/${kept.id}`)).status, 404);
    assert.equal((await get(camille, `/chest/pages/${kept.id}`)).status, 200);
  }
  // The editor: its island for an editor; a reader is told why not.
  assert.match(await page(tom, "/chest/pages/1/edit"), /data-island="Editor"/u);
  assert.doesNotMatch(await page(hugo, "/chest/pages/1/edit"), /data-island="Editor"/u);
});

test("every page of the wiki renders for its people, with nothing the policy blocks", async () => {
  for (const [who, path] of [[tom, "/chest/pages"], [tom, "/chest/spaces/1"], [ines, "/chest/spaces/2/settings"], [ines, "/chest/pages/2/history"], [ines, "/chest/pages/2/history?v=1&view=page"], [camille, "/chest/pages/8/reads"], [tom, "/chest/search/synonyms"], [camille, "/chest/trash"], [camille, "/chest/import"], [hugo, "/chest/search"]]) await page(who, path);
  assert.match(await page(hugo, "/chest/search?q=wifi"), /<mark>/u);
  assert.equal((await get(hugo, "/chest/search/synonyms")).status, 404, "editors only");
  assert.equal((await get(hugo, "/chest/spaces/1/settings")).status, 404);
});

test("actions from an island: a page made, moved, deleted and restored; refusals are codes in the reader's words", async () => {
  const made = await call(tom, "createPage", { spaceId: "3", parentId: null, title: "Coffee machine", start: "blank" });
  assert.equal(made.status, 200);
  const { ok, value } = await made.json();
  assert.equal(ok, true);
  const empty = await call(lea, "createPage", { spaceId: "1", parentId: null, title: "  " });
  assert.equal(empty.status, 403, "a reader writes in My pages only");
  assert.equal((await empty.json()).message, "Votre rôle ne le permet pas.");
  const blank = await call(tom, "createPage", { spaceId: "3", parentId: null, title: "  " });
  assert.equal(blank.status, 400);
  assert.deepEqual(await blank.json(), { ok: false, error: "empty", message: "Write something first." });
  assert.deepEqual(await (await call(tom, "deletePage", { pageId: value.id })).json(), { ok: true, value: { pages: 1 } });
  assert.deepEqual(await (await call(tom, "restorePage", { pageId: value.id })).json(), { ok: true, value: null });
  assert.equal((await call(hugo, "deletePage", { pageId: value.id })).status, 403);
  assert.equal((await call(hugo, "noSuchAction", {})).status, 404);
  // The editor: the lock, the draft (its time in the editor's zone), the save.
  const opened = await (await call(tom, "openEditor", { pageId: value.id })).json();
  assert.equal(opened.value.status, "editing");
  const draft = await (await call(tom, "saveDraft", { pageId: value.id, title: "Coffee machine", doc: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Descale it on Fridays." }] }] }), baseVersion: opened.value.version })).json();
  assert.match(draft.value.time, /^\d{2}:\d{2}$/u);
  const locked = await (await call(ines, "openEditor", { pageId: value.id })).json();
  assert.equal(locked.value.status, "locked");
  assert.equal(locked.value.holder.name, "Tom Walker");
  const saved = await (await call(tom, "publishPage", { pageId: value.id, title: "Coffee machine", doc: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Descale it on Fridays." }] }] }), baseVersion: opened.value.version })).json();
  assert.equal(saved.ok, true);
  assert.match(await page(hugo, `/chest/pages/${value.id}`), /Descale it on Fridays/u);
  // An upload: the Chest's address to PUT to, then the file recorded.
  const grant = await (await call(tom, "requestUpload", { pageId: value.id, size: 10 })).json();
  assert.match(grant.value.url, /^http:\/\/127\.0\.0\.1:\d+\/_chest\/files\//u);
  assert.equal((await call(hugo, "requestUpload", { pageId: value.id, size: 10 })).status, 403);
  assert.equal((await call(tom, "recordUpload", { pageId: value.id, name: "pages/1/../x", fileName: "x" })).status, 400);
});

test("cross-site requests are refused: actions, the beacon, the import", async () => {
  assert.equal((await call(tom, "setPinned", { pageId: "1", on: true }, { "sec-fetch-site": "cross-site" })).status, 403);
  const noHeader = withMember(new Request(url("/chest/actions/setPinned"), { method: "POST", body: JSON.stringify({ pageId: "1", on: true }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), tom);
  assert.equal((await app.fetch(noHeader)).status, 403, "JSON without the island's header");
  const beacon = (site, body = "") => app.fetch(withMember(new Request(url("/chest/api/pages/1/leave"), { method: "POST", body, headers: { "content-type": "text/plain", "sec-fetch-site": site } }), tom));
  assert.equal((await beacon("cross-site")).status, 403);
  assert.equal((await beacon("same-origin")).status, 204, "the lock given back");
  const form = new FormData();
  form.append("files", new Blob(["# Hello\n\nA page."], { type: "text/markdown" }), "hello.md");
  const imported = (site, who = camille) => app.fetch(withMember(new Request(url("/chest/api/import"), { method: "POST", body: form, headers: { "sec-fetch-site": site } }), who));
  assert.equal((await imported("cross-site")).status, 403);
  assert.equal((await imported("same-origin", hugo)).status, 403);
  const done = await imported("same-origin");
  assert.equal(done.status, 200);
  const result = await done.json();
  assert.equal(result.pages, 1);
});

test("downloads: a page as Markdown, HTML and zip, a space, everything, who has read as CSV; a file through a fresh link", async () => {
  const md = await get(tom, "/chest/pages/1/export?format=md");
  assert.equal(md.status, 200);
  assert.equal(md.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.match(md.headers.get("content-disposition"), /^attachment;/u);
  assert.match(await md.text(), /https:\/\/wiki-chest\.chest\.test\/chest\/pages\/|\]\(/u);
  const html = await get(tom, "/chest/pages/1/export?format=html");
  assert.equal(html.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal((await get(tom, "/chest/pages/1/export?format=zip")).headers.get("content-type"), "application/zip");
  assert.equal((await get(tom, "/chest/spaces/1/export")).headers.get("content-type"), "application/zip");
  const all = await get(tom, "/chest/export");
  assert.equal(all.headers.get("content-type"), "application/zip");
  const csv = await get(camille, "/chest/pages/8/reads/csv");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal((await get(hugo, "/chest/pages/8/reads/csv")).status, 404, "the page's editors only");
  assert.equal((await get(hugo, "/chest/files/999")).status, 404);
});

test("the host's root, the language switch, the error pages, the browser's files", async () => {
  const root = await get(null, "/", { "accept-language": "fr" });
  assert.equal(root.status, 200);
  assert.match(checkPage(await root.text()), /Ce wiki se trouve dans votre Chest/u);
  assert.equal((await get(null, "/lang/fr?back=//evil.test")).headers.get("location"), "/");
  assert.equal((await get(null, "/nothing")).status, 404);
  const icon = await get(null, "/assets/icon.svg?v=1");
  assert.equal(icon.status, 200, "the browser's files (npm run build: dist/client)");
  assert.equal((await get(null, "/assets/fonts/newsreader-latin-wght-normal.woff2")).status, 200);
});

test("the Chest's events and schedule runs, signed, each handled once", async () => {
  const to = request => app.fetch(request);
  const left = { type: "member.removed", id: "evt_" + "d".repeat(26), data: { id: lea.id } };
  assert.equal(await chest.emit(left, to), 204);
  assert.equal(await chest.emit(left, to), 204);
  assert.equal(await chest.run("reviews", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  assert.equal((await app.fetch(new Request(url("/chest-schedules"), { method: "POST", body: "{}" }))).status, 401, "unsigned");
  assert.equal((await app.fetch(new Request(url("/chest-events"), { method: "POST", body: "{}" }))).status, 401, "unsigned");
});

test("a request is logged by its route's pattern, never its path", async () => {
  const lines = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { lines.push(String(chunk)); return write(chunk, ...rest); };
  try {
    await get(tom, "/chest/search?q=secret-words");
  } finally {
    process.stdout.write = write;
  }
  const logged = lines.join("");
  assert.match(logged, /\/chest\/search/u);
  assert.doesNotMatch(logged, /secret-words/u);
});

test("islands receive data only: no function, no Date in their props", async () => {
  const html = await page(tom, "/chest/pages/2");
  for (const m of html.matchAll(/data-props="([^"]*)"/gu)) JSON.parse(m[1].replaceAll("&quot;", "\"").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&#x27;", "'"));
});

test("a reader with My pages: their own space, private, and a trash", async () => {
  const made = await call(hugo, "createPage", { spaceId: "mine", parentId: null, title: "My notes" });
  assert.equal(made.status, 200);
  assert.match(await page(hugo, "/chest"), /href="\/chest\/trash"/u);
  const { id } = (await made.json()).value;
  assert.equal((await get(camille, `/chest/pages/${id}`)).status, 404, "not even an admin");
});
