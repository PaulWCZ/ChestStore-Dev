import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage, testDatabase } from "@argentic/chest-app/testing";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL
// (TEST_DATABASE_URL, the preview's, or PGlite: testDatabase()). Every
// page fetched is checked for what the policy would block (checkPage).
atLeast(8);
const member = (id, firstName, language, extra = {}) => ({ id: `mbr_${id.padEnd(26, "a")}`, firstName, lastName: "Test", name: `${firstName} Test`, photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language, timeZone: "Europe/Paris", ...extra });
const camille = member("camille", "Camille", "fr");
const sam = member("sam", "Sam", "en", { timeZone: "America/New_York" });

let chest, database, app;
before(async () => {
  chest = await fakeChest({ members: [camille, sam] });
  database = await testDatabase();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
});

const url = path => `https://tool.test${path}`;
const get = async (who, path, headers = {}) => {
  const response = await app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
};
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(url(`${who ? "/chest" : ""}/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
// A form posted without JavaScript.
const form = (who, path, fields, from) => {
  const request = new Request(url(path), { method: "POST", body: new URLSearchParams(fields), headers: { "sec-fetch-site": "same-origin", referer: url(from), host: "tool.test" } });
  return app.fetch(who ? withMember(request, who) : request);
};

test("a page: the member's language, the tool's policy, no inline script or style", async () => {
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Nouvelle note/u);
  assert.match(html, /0 note</u); // French: zero is singular
  assert.equal(response.headers.get("content-security-policy"), "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await get(null, "/chest")).status, 401);
});

test("an action from an island: typed answer, then the page shows it", async () => {
  const response = await call(sam, "addNote", { body: "  Fire drill on Friday  " });
  assert.equal(response.status, 200);
  const { ok, value } = await response.json();
  assert.equal(ok, true);
  assert.match(value.id, /^[0-9]+$/u);
  const html = await (await get(sam, "/chest")).text();
  assert.match(html, /Fire drill on Friday/u);
  assert.match(html, /1 note</u);
  assert.match(html, /Sam Test, /u); // the author's name, resolved when the page renders
});

test("refusals: a code and the reader's words, nothing written", async () => {
  const empty = await call(camille, "addNote", { body: "   " });
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { ok: false, error: "empty", message: "Écrivez d’abord quelque chose.", field: "body" });
  const long = await (await call(sam, "addNote", { body: "x".repeat(2001) })).json();
  assert.equal(long.message, "Too long: 2000 characters at most.");
  assert.equal((await call(sam, "noSuchAction", {})).status, 404);
  const plain = withMember(new Request(url("/chest/actions/addNote"), { method: "POST", body: "body=x", headers: { "content-type": "text/plain", "sec-fetch-site": "same-origin", "x-tool-action": "1" } }), sam);
  assert.equal((await app.fetch(plain)).status, 415, "neither a form nor JSON");
  const [{ count }] = await database.sql`select count(*)::int from notes`;
  assert.equal(count, 1);
});

test("a note is changed only by its author", async () => {
  const [{ id }] = await database.sql`select id::text from notes`;
  const refused = await call(camille, "removeNote", { id });
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, "forbidden");
  assert.equal((await (await call(sam, "removeNote", { id })).json()).ok, true);
  assert.doesNotMatch(await (await get(sam, "/chest")).text(), /Fire drill/u);
  assert.equal((await (await call(sam, "restoreNote", { id })).json()).ok, true);
  assert.match(await (await get(sam, "/chest")).text(), /Fire drill/u);
});

test("cross-site requests are refused", async () => {
  assert.equal((await call(sam, "addNote", { body: "x" }, { "sec-fetch-site": "cross-site" })).status, 403);
  const noHeader = withMember(new Request(url("/chest/actions/addNote"), { method: "POST", body: JSON.stringify({ body: "x" }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), sam);
  assert.equal((await app.fetch(noHeader)).status, 403, "JSON without the island's header");
  const oldBrowser = withMember(new Request(url("/chest/actions/addNote"), { method: "POST", body: new URLSearchParams({ body: "x" }), headers: { origin: "https://evil.test", host: "tool.test" } }), sam);
  assert.equal((await app.fetch(oldBrowser)).status, 403);
});

test("a form without JavaScript: posted, then back to its page", async () => {
  const [{ id }] = await database.sql`select id::text from notes`;
  const pinned = await form(sam, "/chest/actions/pinNote", { id, pinned: "1" }, "/chest");
  assert.equal(pinned.status, 303);
  assert.equal(pinned.headers.get("location"), "/chest");
  assert.match(await (await get(sam, "/chest")).text(), /Pinned/u);
  const refused = await form(sam, "/chest/actions/addNote", { body: "" }, "/chest");
  assert.equal(refused.headers.get("location"), "/chest?error=empty");
  assert.match(await (await get(sam, "/chest?error=empty")).text(), /role="alert">Write something first\./u);
  // A refusal with values says them (not "{max}").
  const long = await form(sam, "/chest/actions/addNote", { body: "x".repeat(2001) }, "/chest");
  const back = long.headers.get("location");
  assert.match(await (await get(sam, back)).text(), /role="alert">Too long: 2000 characters at most\./u);
});

test("a download streams the rows as CSV, formulas defused", async () => {
  await call(sam, "addNote", { body: "=HYPERLINK(\"x\")" });
  const response = await get(sam, "/chest/notes.csv");
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="notes-\d{4}-\d{2}-\d{2}\.csv"; filename\*=UTF-8''notes-\d{4}-\d{2}-\d{2}\.csv$/u);
  const text = await response.text();
  assert.match(text, /^id,created_at,author,pinned,body\r\n/u);
  assert.match(text, /"'=HYPERLINK\(""x""\)"/u);
});

test("no public part: visitors get 404, and nothing sends them elsewhere", async () => {
  assert.equal((await get(null, "/", { "accept-language": "fr-CH, en;q=0.5" })).status, 404);
  assert.equal((await call(null, "addNote", { body: "x" })).status, 404, "a members' action is not a public one");
  const lang = await get(null, "/lang/fr?back=/");
  assert.match(lang.headers.get("set-cookie"), /^lang=fr;/u);
  // Never back to another site: //, /\, /<tab>/, dot segments raw or encoded.
  for (const evil of ["//evil.example", "/%5Cevil.example", "/%09/evil.example", "https://evil.example", "/..//evil.example", "/.//evil.example", "/%2e%2e//evil.example", "/./%5Cevil.example", "/chest/..//evil.example"]) {
    assert.equal((await get(null, `/lang/fr?back=${encodeURIComponent(evil)}`)).headers.get("location"), "/", evil);
    assert.equal((await get(null, `/lang/fr?back=${evil}`)).headers.get("location"), "/", evil);
  }
});

test("a page that refuses: fail() is a 404 or 403 page, never a 500", async () => {
  assert.equal((await get(sam, "/chest/notes/999999")).status, 404);
});

test("errors: the reader's page, the right status", async () => {
  const missing = await get(camille, "/chest/nothing");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Rien ici/u);
  assert.equal((await get(null, "/nothing")).status, 404);
  assert.equal((await get(null, "/assets/nothing.js")).status, 404);
});

test("the Chest's events and schedules, each delivered at least once", async () => {
  const to = request => app.fetch(request);
  const erased = { type: "member.erased", id: "evt_" + "c".repeat(26), data: { id: sam.id, erasure: "era_" + "b".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(erased, to), 204);
  assert.equal(await chest.emit(erased, to), 204); // again: seen, nothing done twice
  assert.deepEqual(chest.acknowledged, [erased.data.erasure]);
  const [{ authors }] = await database.sql`select count(*)::int as authors from notes where author = ${sam.id}`;
  assert.equal(authors, 0);
  assert.equal(await chest.run("nothing", to), 404, "a schedule without a handler");
});
