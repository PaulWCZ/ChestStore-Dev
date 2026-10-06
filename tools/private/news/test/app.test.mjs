import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { testDatabase } from "./support/db.ts";
import { camille, everyone, fakeGroups, hugo, ines, sofia, stranger } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL (PGlite,
// or TEST_DATABASE_URL) with the sample month of seed/sample.sql. The
// services are tested on their own in the other files; here, what the
// server adds: routes, policy, look, actions, downloads, the Slack import,
// the Chest's signed calls.
let chest, database, app;
before(async () => {
  chest = await fakeChest({ tool: "news", network: {}, members: everyone, groups: fakeGroups, capabilities: ["members", "files", "notifications", "calendar", "members.groups"], calendar: { domain: "atelier.test", toolTitle: "News", company: "Atelier" }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", publicUrl: null } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://news-chest.chest.test";
const url = path => `${team}${path}`;
const get = (who, path, headers = {}) => app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const clean = html => {
  assert.doesNotMatch(html, /\sstyle="/u, "no style attribute");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u, "no inline script");
  assert.doesNotMatch(html, /<style/u, "no style element");
};

test("the front page: the member's language, the policy, the look as a stylesheet, nothing inline", async () => {
  const response = await get(ines, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  clean(html);
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Actualités<\/title>/u);
  assert.match(html, /Nous déménageons le 2 novembre/u, "the post in the reader's language");
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /data-island="AutoRefresh"/u);
  assert.match(html, /data-island="Search"/u, "the header's search");
  assert.equal((await get(null, "/chest")).status, 401);
  // No role: why, not an error.
  assert.match(await (await get(stranger, "/chest")).text(), /You can’t read News yet/u);
});

test("the look: a stylesheet with its hash, kept a year when linked by it, 304 when the browser has it", async () => {
  const html = await (await get(hugo, "/chest")).text();
  const v = /look\.css\?v=([\w-]{16})/u.exec(html)[1];
  const sheet = await get(hugo, `/chest/look.css?v=${v}`);
  assert.equal(sheet.status, 200);
  assert.equal(sheet.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(sheet.headers.get("cache-control"), "private, max-age=31536000, immutable");
  const etag = sheet.headers.get("etag");
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#c4121a/u, "News's own identity: Newsprint");
  assert.match(css, /url\(\/assets\/fonts\/fraunces-latin-wght-normal\.woff2\)/u);
  assert.equal((await get(hugo, "/chest/look.css", { "if-none-match": etag })).status, 304);
  assert.equal((await get(null, "/chest/look.css")).status, 401, "the team's look is the team's");
  chest.theme.all = { mode: "catalogue", theme: "library" };
  forgetTheme();
  assert.doesNotMatch(await (await get(hugo, "/chest")).text(), new RegExp(`look\\.css\\?v=${v}`, "u"));
  chest.theme.all = null;
  forgetTheme();
});

test("a post: its words, the islands people act on, who confirmed as a <meter> for its publishers", async () => {
  const response = await get(camille, "/chest/posts/4");
  assert.equal(response.status, 200);
  const html = await response.text();
  clean(html);
  assert.match(html, /<title>Nous déménageons le 2 novembre · Actualités<\/title>/u);
  assert.match(html, /data-island="PostTools"/u);
  assert.match(html, /<meter class="meter" aria-hidden="true" min="0" max="\d+" value="\d+"/u);
  assert.match(html, /data-island="Comments"/u);
  const reader = await (await get(hugo, "/chest/posts/4")).text();
  assert.match(reader, /data-island="ConfirmBox"/u);
  assert.doesNotMatch(reader, /data-island="PostTools"|<meter/u, "a reader sees no publisher's tools");
  assert.equal((await get(hugo, "/chest/posts/999")).status, 404);
  assert.equal((await get(hugo, "/chest/posts/abc")).status, 404);
  assert.match(await (await get(ines, "/chest/posts/999")).text(), /Rien ici[\s\S]*Retour à la une/u);
  // The composer is the publishers'.
  assert.match(await (await get(sofia, "/chest/new?kind=event")).text(), /data-island="Composer"[^>]*&quot;kind&quot;:&quot;event&quot;/u);
  assert.equal((await get(hugo, "/chest/new")).status, 404);
  assert.match(await (await get(sofia, "/chest/posts/4/edit")).text(), /data-island="Composer"/u);
  // Search, share something, to approve, moving.
  assert.match(await (await get(hugo, "/chest/search?q=bikes")).text(), /<mark>/u);
  assert.match(await (await get(hugo, "/chest/propose")).text(), /data-island="ProposeForm"/u);
  assert.equal((await get(hugo, "/chest/proposals")).status, 404);
  assert.equal((await get(sofia, "/chest/proposals")).status, 200);
  assert.match(await (await get(camille, "/chest/transfer")).text(), /data-island="SlackImport"/u);
});

test("actions from an island: a post written and confirmed; refusals are codes in the reader's words", async () => {
  const saved = await call(sofia, "savePost", { postId: null, input: { kind: "announcement", title: "Coffee machine fixed", body: "It works again.", locale: "en", important: true } });
  assert.equal(saved.status, 200);
  const { ok, value } = await saved.json();
  assert.equal(ok, true);
  assert.ok(value.undoUntil, "an Important post waits its Undo seconds");
  assert.deepEqual(await (await call(sofia, "recallPost", { postId: value.id })).json(), { ok: true, value: null });
  const empty = await call(camille, "savePost", { postId: null, input: { kind: "announcement", title: "  ", locale: "fr" } });
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { ok: false, error: "empty", message: "Écrivez d’abord quelque chose." });
  const notAllowed = await call(hugo, "pinPost", { postId: "4", pinned: false });
  assert.equal(notAllowed.status, 403);
  assert.equal((await notAllowed.json()).message, "Your role does not allow this.");
  assert.equal((await call(hugo, "confirmRead", { postId: "999" })).status, 404);
  assert.deepEqual(await (await call(hugo, "confirmRead", { postId: "4" })).json(), { ok: true, value: null });
  assert.equal((await call(hugo, "noSuchAction", {})).status, 404);
  assert.equal((await call(hugo, "requestUpload", { role: "attachment", size: 10 })).status, 403, "a reader adds a proposal's picture only");
  const grant = await (await call(hugo, "requestUpload", { role: "cover", size: 10 })).json();
  assert.equal(grant.ok, true);
  assert.match(grant.value.url, /^http:\/\/127\.0\.0\.1:\d+\/_chest\/files\//u);
});

test("cross-site requests are refused", async () => {
  assert.equal((await call(sofia, "pinPost", { postId: "4", pinned: false }, { "sec-fetch-site": "cross-site" })).status, 403);
  const noHeader = withMember(new Request(url("/chest/actions/pinPost"), { method: "POST", body: JSON.stringify({ postId: "4", pinned: false }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), sofia);
  assert.equal((await app.fetch(noHeader)).status, 403, "JSON without the island's header");
  const zip = withMember(new Request(url("/chest/transfer/import"), { method: "POST", body: new Uint8Array([1, 2, 3]), headers: { "content-type": "application/zip", "sec-fetch-site": "cross-site" } }), camille);
  assert.equal((await app.fetch(zip)).status, 403, "the Slack import too");
  const [{ pinned }] = await database.sql`select pinned_at is not null as pinned from posts where id = 4`;
  assert.equal(pinned, true);
});

test("the Slack import: a ZIP read in memory, refused in the reader's words when it is not an export", async () => {
  const send = (who, body, query = "") => app.fetch(withMember(new Request(url("/chest/transfer/import" + query), { method: "POST", body, headers: { "content-type": "application/zip", "sec-fetch-site": "same-origin" } }), who));
  const archive = readFileSync("test/fixtures/slack-export-viewer-testarchive.zip");
  const read = await send(camille, archive);
  assert.equal(read.status, 200);
  const { channels } = await read.json();
  assert.ok(channels.length > 0);
  const notZip = await send(camille, new Uint8Array([1, 2, 3]));
  assert.equal(notZip.status, 400);
  assert.match((await notZip.json()).message, /pas un export Slack/u);
  assert.equal((await send(hugo, archive)).status, 403);
  // Past 50 MB: refused while it is read — a chunked body (no length said)
  // stops at the limit, never read whole first.
  let sent = 0;
  const endless = new ReadableStream({ pull(controller) { sent += 1 << 20; controller.enqueue(new Uint8Array(1 << 20)); if (sent > 80 << 20) controller.close(); } });
  const chunked = withMember(new Request(url("/chest/transfer/import"), { method: "POST", body: endless, duplex: "half", headers: { "content-type": "application/zip", "sec-fetch-site": "same-origin" } }), camille);
  const big = await app.fetch(chunked);
  assert.equal(big.status, 413);
  assert.ok(sent <= 52 << 20, `read ${sent >> 20} MiB, not all 80`);
  const declared = withMember(new Request(url("/chest/transfer/import"), { method: "POST", body: "x", headers: { "content-type": "application/zip", "content-length": String(60 << 20), "sec-fetch-site": "same-origin" } }), camille);
  assert.equal((await app.fetch(declared)).status, 413, "a length said too large: refused before reading");
});

test("downloads: who confirmed as CSV, the event as .ics, every post as a ZIP; a file through a fresh link", async () => {
  const csv = await get(sofia, "/chest/posts/4/confirmations");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.headers.get("content-disposition"), /^attachment; filename="read-confirmations-4\.csv"$/u);
  assert.equal((await get(hugo, "/chest/posts/4/confirmations")).status, 404, "a publisher's download does not exist for a reader, as the composer");
  const ics = await get(hugo, "/chest/posts/3/calendar");
  assert.equal(ics.status, 200);
  assert.match(await ics.text(), /^BEGIN:VCALENDAR\r\n/u);
  assert.equal((await get(hugo, "/chest/posts/4/calendar")).status, 404, "not an event");
  const zip = await get(camille, "/chest/transfer/export");
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.equal((await get(hugo, "/chest/transfer/export")).status, 404);
  assert.equal((await get(hugo, "/chest/files/999")).status, 404);
});

test("the one-tap answer links of the old emails are gone: nothing answers at that address", async () => {
  assert.equal((await get(hugo, "/chest/posts/3/answer?a=yes&t=forged")).status, 404);
});

test("the host's root, the language switch, the error pages, the browser's files", async () => {
  const root = await get(null, "/", { "accept-language": "fr" });
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Actualités se trouve dans votre Chest/u);
  assert.equal((await get(null, "/lang/fr?back=//evil.test")).headers.get("location"), "/");
  assert.equal((await get(null, "/nothing")).status, 404);
  const icon = await get(null, "/assets/icon.svg?v=1");
  assert.equal(icon.status, 200, "the browser's files (npm run build: dist/client)");
  assert.equal(icon.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("the Chest's events and schedule runs, signed, each handled once", async () => {
  const to = request => app.fetch(request);
  const left = { type: "member.removed", id: "evt_" + "d".repeat(26), data: { id: ines.id } };
  assert.equal(await chest.emit(left, to), 204);
  assert.equal(await chest.emit(left, to), 204);
  assert.equal(await chest.run("publish", to), 204);
  assert.equal(await chest.run("digest", to), 404, "no digest of its own: the Chest groups notifications as each member chose");
  assert.equal(await chest.run("nothing", to), 404);
  assert.equal((await app.fetch(new Request(url("/chest-schedules"), { method: "POST", body: "{}" }))).status, 401, "unsigned");
  assert.equal((await app.fetch(new Request(url("/chest-events"), { method: "POST", body: "{}" }))).status, 401, "unsigned");
});
