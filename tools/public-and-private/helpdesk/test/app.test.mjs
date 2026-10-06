import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { formToken } from "@argentic/chest-app";
import { atLeast, checkPage, settled } from "@argentic/chest-app/testing";
import { testDatabase } from "./support/db.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, visitors on the public
// host, a real PostgreSQL (TEST_DATABASE_URL, or PGlite) with the sample
// tickets of seed/sample.sql. The rules are tested on their own in the
// other files; here, what the server adds: routes, policy, look, frame,
// actions from an island and from a form, the public part, files, the
// Chest's signed deliveries. Every page is checked for what the policy
// would block (checkPage).
atLeast(15);
let chest, database, app;
const logs = [];
const log = console.log;
before(async () => {
  chest = await fakeChest({ tool: "helpdesk", network: {}, members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] }, storage: { publicUploads: true }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en" } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
  console.log = (...line) => { logs.push(line.join(" ")); };
});
after(async () => {
  console.log = log;
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://helpdesk-chest.chest.test";
const visitor = "https://helpdesk.chest.test";
const lampLink = "demoLampFollowUpLinkForScreens00";
const send = async request => {
  const response = await app.fetch(request);
  // The work an answer left to do (after()) done before the next request:
  // PGlite serves every connection from one session.
  await settled();
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
};
const get = (who, path, headers = {}) => send(who ? withMember(new Request(team + path, { headers }), who) : new Request((path.startsWith("/chest") ? team : visitor) + path, { headers }));
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(`${who ? team + "/chest" : visitor}/actions/${name}`, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return send(who ? withMember(request, who) : request);
};
// A form posted without JavaScript.
const form = (who, path, fields, from, headers = {}) => {
  const base = who ? team : visitor;
  const request = new Request(base + path, { method: "POST", body: new URLSearchParams(fields), headers: { "sec-fetch-site": "same-origin", referer: base + from, host: new URL(base).host, ...headers } });
  return send(who ? withMember(request, who) : request);
};
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// The single-use token a public page carries for an action (<Honeypot />, <FormToken />),
// shown long enough ago that a person could have written the form.
const token = (action, age = 10_000) => formToken(action, Date.now() - age);
// The browser's own key the package sets at a first public call, when the
// Chest names no visitor (a real 0.4 Chest names none).
const browserOf = response => /chest_v=[\w-]+/u.exec(response.headers.get("set-cookie") ?? "")?.[0];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("the inbox: the member's language, the policy, the look as a stylesheet, the folders with their counts", async () => {
  const response = await get(ines, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>À attribuer · Support<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /<link rel="icon" href="\/assets\/icon\.svg"/u);
  assert.match(html, /class="folders"/u);
  assert.match(html, /My lamp arrived broken/u);
  assert.match(html, /data-island="InboxList"/u);
  assert.equal((await get(null, "/chest")).status, 401);
  const sheet = await get(ines, "/chest/look.css");
  assert.match(await sheet.text(), /--accent:\s*#0b6e69/u, "Support's own identity: Calm counter");
});

test("a member without a role reaches My requests only; a ticket's address leads to their own view of it", async () => {
  const home = await get(nora, "/chest");
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), "/chest/mine");
  assert.equal((await get(nora, "/chest/tickets/1003")).headers.get("location"), "/chest/mine/1003");
  assert.equal((await get(nora, "/chest/settings")).headers.get("location"), "/chest/mine");
  const mine = await get(nora, "/chest/mine");
  assert.equal(mine.status, 200);
  assert.doesNotMatch(await mine.text(), /class="folders"/u);
  assert.equal((await get(nora, "/chest/mine/1003")).status, 404, "another person's ticket: not found");
  assert.equal((await get(nora, "/chest/files/1")).status, 403);
});

test("a ticket: the conversation on the server, the answer box and the side card as islands; a reply from the island", async () => {
  const page = await get(hugo, "/chest/tickets/1001");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<h1>My lamp arrived broken<\/h1>/u);
  assert.match(html, /data-island="Composer"/u);
  assert.match(html, /data-island="TicketSide"/u);
  assert.match(html, /la lampe Arco/u);
  const sent = await call(hugo, "reply", { number: 1001, body: "We send a new lamp today.", close: false, files: [] });
  assert.equal(sent.status, 200);
  assert.deepEqual(await sent.json(), { ok: true, value: { delivery: "email" } });
  assert.match(chest.outbox.at(-1).subject, /\[#1001\]/u);
  assert.match(await (await get(hugo, "/chest/tickets/1001")).text(), /We send a new lamp today\./u);
  const empty = await (await call(hugo, "reply", { number: 1001, body: "   ", close: false })).json();
  assert.deepEqual(empty, { ok: false, error: "empty", message: "Write something first." });
  const viewer = await call(lea, "reply", { number: 1001, body: "Hi", close: false });
  assert.equal(viewer.status, 403);
  assert.equal((await get(hugo, "/chest/tickets/9999")).status, 404);
});

test("several tickets at once, with what Undo needs", async () => {
  const done = await (await call(hugo, "bulk", { numbers: [1002, 1004], action: { kind: "priority", priority: "high" } })).json();
  assert.equal(done.ok, true);
  assert.equal(done.value.before.length, 2);
  const [{ n }] = await database.sql`select count(*)::int as n from tickets where number in (1002, 1004) and priority = 'high'`;
  assert.equal(n, 2);
  assert.equal((await (await call(hugo, "unbulk", { before: done.value.before, tag: null })).json()).ok, true);
  const [{ back }] = await database.sql`select count(*)::int as back from tickets where number in (1002, 1004) and priority = 'high'`;
  assert.equal(back, done.value.before.filter(b => b.priority === "high").length);
});

test("the public contact form: the visitor's language, the company's sentence, Support's look on /look.css", async () => {
  const fr = await get(null, "/", { "accept-language": "fr-CH, en;q=0.5" });
  assert.equal(fr.status, 200);
  assert.equal(fr.headers.get("content-security-policy"), policy);
  const html = await fr.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Contacter Atelier Martin/u);
  assert.match(html, /nous répondons sous un jour ouvré/u);
  assert.match(html, /<link rel="stylesheet" href="\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/u);
  // The address names the language (a frame may not keep the cookie).
  assert.match(await (await get(null, "/?lang=en", { "accept-language": "fr" })).text(), /<html lang="en">/u);
  const lang = await get(null, "/lang/fr?back=" + encodeURIComponent("/?lang=fr"));
  assert.equal(lang.headers.get("location"), "/?lang=fr");
  assert.match(lang.headers.get("set-cookie"), /^lang=fr;/u);
  assert.equal((await get(null, "/look.css")).status, 200);
});

test("a request from the form: sent in place (the request's page opens), robots answered and ignored, a stale form refused", async () => {
  const fields = { name: "Lucie Garnier", email: "lucie@example.com", subject: "Missing screws", message: "The bag of screws was missing.", lang: "fr", embed: "", website: "", files: [] };
  const page = await (await get(null, "/")).text();
  assert.match(page, /data-action="sendRequest" name="chest_form" value="[\w.-]+"/u, "the page carries its form token");
  assert.match(page, /name="website"/u, "and the field only robots fill");
  const robot = await (await call(null, "sendRequest", { ...fields, chest_form: token("sendRequest"), website: "spam.example" })).json();
  assert.deepEqual([robot.ok, robot.value], [true, null], "a robot is told it is done");
  const stale = await (await call(null, "sendRequest", { ...fields, chest_form: token("sendRequest", 3 * 3600_000) })).json();
  assert.equal(stale.error, "expired");
  assert.equal((await database.sql`select count(*)::int as n from tickets where subject = 'Missing screws'`)[0].n, 0, "nothing kept");
  const once = token("sendRequest");
  const sent = await (await call(null, "sendRequest", { ...fields, chest_form: once })).json();
  assert.equal(sent.ok, true);
  assert.match(sent.redirect, /^\/t\/[A-Za-z0-9_-]{32}\?new=1&mailed=1$/u);
  assert.match(sent.form, /^\d{13}\./u, "the answer brings the next token");
  assert.equal((await (await call(null, "sendRequest", { ...fields, chest_form: once })).json()).error, "expired", "a token serves once");
  // Its page: the request's language (French) — what the visitor reads.
  const shown = await get(null, sent.redirect, { "accept-language": "en" });
  const html = await shown.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Merci — nous avons bien reçu votre demande/u);
  assert.match(html, /The bag of screws was missing\./u);
  // Never the link in the log: the route's pattern only.
  assert.ok(logs.some(l => /route=\/t\/:secret/u.test(l)), "the follow-up page is logged by its pattern");
  assert.ok(!logs.some(l => l.includes(sent.redirect.slice(3, 35))), "the secret is never logged");
});

test("a form posted without JavaScript: the same request, a refusal said under its field", async () => {
  const refused = await form(null, "/actions/sendRequest", { name: "Marc", email: "marc.lenoir@gmail", subject: "Quick", message: "A question.", chest_form: token("sendRequest"), lang: "en", website: "" }, "/");
  assert.equal(refused.status, 303);
  const back = refused.headers.get("location");
  assert.equal(back, "/?error=invalid_email");
  assert.match(await (await get(null, back)).text(), /Check the email address\./u);
  const sent = await form(null, "/actions/sendRequest", { name: "Marc", email: "marc.lenoir@gmail.com", subject: "Quick", message: "A question.", chest_form: token("sendRequest"), lang: "en", website: "" }, "/");
  assert.match(sent.headers.get("location"), /^\/t\/[A-Za-z0-9_-]{32}\?new=1/u);
  // From another site: refused.
  assert.equal((await form(null, "/actions/sendRequest", { email: "x@example.com" }, "/", { "sec-fetch-site": "cross-site" })).status, 403);
});

test("with no visitor address (a real 0.4 Chest): junk is never counted, a browser's limit is its own, a real customer gets through", async () => {
  await database.sql`delete from chest_bounds`;
  const fields = i => ({ name: "", email: `v${i}@example.com`, subject: `Visitor ${i}`, message: "Hello there.", lang: "en", website: "" });
  // A flood of junk: forged tokens, the robots' field, words refused.
  for (let i = 0; i < 40; i++) {
    const junk = i % 3 === 0 ? { ...fields(i), chest_form: "1.2.3" } : i % 3 === 1 ? { ...fields(i), chest_form: token("sendRequest"), website: "x" } : { ...fields(i), email: "nope", chest_form: token("sendRequest") };
    const answer = await call(null, "sendRequest", junk, { "x-forwarded-for": `198.51.100.${i}` });
    assert.ok([200, 400].includes(answer.status), String(answer.status));
  }
  const [{ n }] = await database.sql`select coalesce(sum(count), 0)::int as n from chest_bounds where scope = 'sendRequest'`;
  assert.equal(n, 0, "junk spends nothing");
  // One browser (its cookie), whatever X-Forwarded-For it writes: ten a day.
  const first = await call(null, "sendRequest", { ...fields(100), chest_form: token("sendRequest") }, { "x-forwarded-for": "203.0.113.1" });
  const browser = browserOf(first);
  assert.ok(browser, "a key of its own, in a cookie");
  const answers = [];
  for (let i = 0; i < 11; i++) answers.push(await call(null, "sendRequest", { ...fields(101 + i), chest_form: token("sendRequest") }, { cookie: browser, "x-forwarded-for": `198.51.100.${i}` }));
  assert.deepEqual(answers.map(a => a.status), [...Array(10).fill(200), 429]);
  assert.equal((await answers[10].json()).error, "limit");
  // A real customer, another browser: through.
  const customer = await (await call(null, "sendRequest", { ...fields(200), chest_form: token("sendRequest") })).json();
  assert.equal(customer.ok, true, "another visitor is not blocked");
});

test("the follow-up link: writing again and rating are counted per request — a flood on one link never blocks another", async () => {
  await database.sql`delete from chest_bounds`;
  const own = async email => (await (await call(null, "sendRequest", { name: "", email, subject: "Count me", message: "Hello.", lang: "en", website: "", chest_form: token("sendRequest") })).json()).redirect.slice(3, 35);
  const flooded = await own("flood@example.com");
  const other = await own("calm@example.com");
  const write = (secret, message = "Any news?") => call(null, "writeAgain", { secret, message, files: [], chest_form: token("writeAgain") });
  // An unknown link, empty words: refused before anything is counted.
  assert.equal((await write("y".repeat(32))).status, 404);
  assert.equal((await write(flooded, "  ")).status, 400);
  const answers = [];
  for (let i = 0; i < 61; i++) {
    answers.push((await write(flooded, `Again ${i}`)).status);
  }
  assert.deepEqual(answers, [...Array(60).fill(200), 429]);
  assert.equal((await write(other)).status, 200, "another request's link is its own count");
  const [{ n }] = await database.sql`select count(*)::int as n from messages m join tickets t on t.id = m.ticket_id where t.customer_email = 'flood@example.com' and m.kind = 'customer'`;
  assert.equal(n, 61, "the first message and sixty more today");
});

test("a request's files: downloads in a sandbox, only through the request's own link", async () => {
  const [t] = await database.sql`select id from tickets where number = 1001`;
  const [m] = await database.sql`insert into messages (ticket_id, kind, body) values (${t.id}, 'customer', 'Photo') returning id`;
  const { put } = await import("@argentic/chest-sdk/files");
  await put("files/0123456789abcdef0123.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png");
  const [a] = await database.sql`insert into attachments (message_id, object, file_name, type, size) values (${m.id}, 'files/0123456789abcdef0123.png', 'lamp.png', 'image/png', 8) returning id`;
  const file = await get(null, `/t/${lampLink}/files/${a.id}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-security-policy"), "sandbox; default-src 'none'");
  assert.match(file.headers.get("content-disposition"), /^attachment; filename="lamp\.png"/u);
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.equal(file.headers.get("referrer-policy"), "no-referrer", "the file's own policy is kept");
  assert.equal((await file.arrayBuffer()).byteLength, 8);
  // Two at once at most (a file is read whole): the third waits a moment.
  const one = await get(null, `/t/${lampLink}/files/${a.id}`);
  const two = await get(null, `/t/${lampLink}/files/${a.id}`);
  const three = await get(null, `/t/${lampLink}/files/${a.id}`);
  assert.deepEqual([one.status, two.status, three.status], [200, 200, 503]);
  assert.equal(three.headers.get("retry-after"), "5");
  // Asked for its headers only (HEAD): no slot taken, none left held.
  const head = await send(new Request(`${visitor}/t/${lampLink}/files/${a.id}`, { method: "HEAD" }));
  assert.deepEqual([head.status, head.headers.get("content-length"), head.headers.get("referrer-policy")], [200, "8", "no-referrer"]);
  await one.arrayBuffer();
  await two.body.cancel();
  assert.equal((await get(null, `/t/${lampLink}/files/${a.id}`)).status, 200, "a slot is free again once a file has left, or was cancelled");
  assert.equal((await get(null, `/t/demoFollowUpLinkForTheScreens000/files/${a.id}`)).status, 404, "another request's link");
  // The team opens it through a link the Chest signs.
  const team = await get(lea, `/chest/files/${a.id}`);
  assert.equal(team.status, 303);
});

test("the public pages may be framed by the company's websites an administrator listed; the team's never", async () => {
  assert.equal((await call(camille, "saveSettings", { input: { frameOrigins: "https://www.atelier-martin.fr" } })).status, 200);
  const framed = (await get(null, "/")).headers.get("content-security-policy");
  assert.match(framed, /frame-ancestors https:\/\/www\.atelier-martin\.fr$/u);
  assert.match((await get(null, `/t/${lampLink}`)).headers.get("content-security-policy"), /frame-ancestors https:\/\/www\.atelier-martin\.fr$/u);
  assert.match((await get(camille, "/chest")).headers.get("content-security-policy"), /frame-ancestors 'none'$/u);
  await call(camille, "saveSettings", { input: { frameOrigins: "" } });
  assert.equal((await get(null, "/")).headers.get("content-security-policy"), policy);
  assert.equal((await call(hugo, "saveSettings", { input: { frameOrigins: "https://evil.example" } })).status, 403, "an agent is no administrator");
});

test("settings, reports and export: by role", async () => {
  const settings = await get(camille, "/chest/settings");
  assert.equal(settings.status, 200);
  const html = await settings.text();
  for (const box of ["FormBox", "HoursBox", "RulesBox", "NoticesBox", "EmbedBox", "TagsBox", "RepliesBox", "EraseBox"]) assert.match(html, new RegExp(`data-island="${box}"`, "u"), box);
  assert.doesNotMatch(await (await get(hugo, "/chest/settings")).text(), /data-island="EraseBox"/u, "an agent erases no one");
  assert.equal((await get(camille, "/chest/reports?weeks=4")).status, 200);
  assert.equal((await get(hugo, "/chest/reports")).status, 404);
  const zip = await get(hugo, "/chest/export");
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.match(zip.headers.get("content-disposition"), /^attachment; filename="support-export-\d{4}-\d{2}-\d{2}\.zip"/u);
  const bytes = Buffer.from(await zip.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50, "a ZIP, sent whole");
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  // Followed in place (navigate()): no archive made, the browser loads it.
  const inPlace = await get(hugo, "/chest/export", { "x-tool-navigate": "1" });
  assert.equal(inPlace.status, 204);
  assert.equal((await get(lea, "/chest/export")).status, 403);
});

test("the follow-up page: the request's language unless the visitor switches; a wrong link says so", async () => {
  const fr = await (await get(null, `/t/${lampLink}`, { "accept-language": "en" })).text();
  assert.match(fr, /<html lang="fr">/u);
  assert.match(fr, /Demande 1001/u);
  const en = await (await get(null, `/t/${lampLink}?lang=en`)).text();
  assert.match(en, /<html lang="en">/u);
  assert.match(en, /Request 1001/u);
  assert.match(en, /href="\/lang\/fr\?back=%2Ft%2FdemoLampFollowUpLinkForScreens00%3Flang%3Dfr"/u, "the switch comes back in the chosen language");
  const wrong = await get(null, "/t/" + "x".repeat(32));
  assert.equal(wrong.status, 404);
  const said = await wrong.text();
  assert.match(said, /This link does not work/u);
  assert.match(said, /<a class="button" href="\/">Write a new request<\/a>/u);
  const again = await (await call(null, "writeAgain", { secret: lampLink, message: "Any news?", files: [], chest_form: token("writeAgain") })).json();
  assert.equal(again.ok, true);
  assert.equal((await (await call(null, "writeAgain", { secret: "y".repeat(32), message: "Mine now", chest_form: token("writeAgain") })).json()).error, "not_found");
});

test("the Chest's deliveries: schedules, events, each delivered at least once", async () => {
  const to = request => app.fetch(request);
  assert.equal(await chest.run("cleanup", to), 204);
  assert.equal(await chest.run("late", to), 204);
  assert.equal(await chest.run("nothing", to), 404, "a schedule without a handler");
  const removed = { type: "member.removed", id: "evt_" + "c".repeat(26), data: { id: hugo.id } };
  assert.equal(await chest.emit(removed, to), 204);
  assert.equal(await chest.emit(removed, to), 204);
  const [{ n }] = await database.sql`select count(*)::int as n from tickets where assignee = ${hugo.id}`;
  assert.equal(n, 0, "their tickets went back to the shared inbox");
  assert.equal((await app.fetch(new Request(team + "/chest-schedules", { method: "POST", body: "{}" }))).status, 401, "unsigned");
});

test("errors: the reader's page, the right status, in its frame", async () => {
  const missing = await get(ines, "/chest/nothing");
  assert.equal(missing.status, 404);
  const html = await missing.text();
  assert.match(html, /Rien ici/u);
  assert.match(html, /class="ck-shell/u, "the team's frame");
  const lost = await get(null, "/nothing");
  assert.equal(lost.status, 404);
  assert.match(await lost.text(), /class="public-top"/u, "the public frame");
  assert.equal((await get(null, "/assets/nothing.js")).status, 404);
  // The browser's files exist once built (npm run build; npm test builds
  // the server only).
  if (existsSync("dist/client/assets/icon.svg")) assert.equal((await get(null, "/assets/icon.svg")).status, 200);
});
