import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
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
atLeast(14);
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
// A form shown long enough ago that a person could have written it.
const shown = async () => {
  const html = await (await get(null, "/")).text();
  return /name="started" value="([^"]+)"/u.exec(html)?.[1] ?? /&quot;started&quot;:&quot;([^&]+)&quot;/u.exec(html)[1];
};
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

test("a request from the form: sent in place (the request's page opens), too fast refused, robots ignored", async () => {
  const started = await shown();
  const fields = { name: "Lucie Garnier", email: "lucie@example.com", subject: "Missing screws", message: "The bag of screws was missing.", started, lang: "fr", embed: "", website: "", files: [] };
  const fast = await (await call(null, "sendRequest", fields)).json();
  assert.equal(fast.error, "too_fast");
  await wait(1600);
  const robot = await (await call(null, "sendRequest", { ...fields, website: "spam.example" })).json();
  assert.equal(robot.ok, false);
  const sent = await (await call(null, "sendRequest", fields)).json();
  assert.equal(sent.ok, true);
  assert.match(sent.redirect, /^\/t\/[A-Za-z0-9_-]{32}\?new=1&mailed=1$/u);
  // Its page: the request's language (French) — what the visitor reads.
  const page = await get(null, sent.redirect, { "accept-language": "en" });
  const html = await page.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Merci — nous avons bien reçu votre demande/u);
  assert.match(html, /The bag of screws was missing\./u);
  // Never the link in the log: the route's pattern only.
  assert.ok(logs.some(l => /route=\/t\/:secret/u.test(l)), "the follow-up page is logged by its pattern");
  assert.ok(!logs.some(l => l.includes(sent.redirect.slice(3, 35))), "the secret is never logged");
});

test("a form posted without JavaScript: the same request, a refusal said under its field", async () => {
  const started = await shown();
  await wait(1600);
  const refused = await form(null, "/actions/sendRequest", { name: "Marc", email: "marc.lenoir@gmail", subject: "Quick", message: "A question.", started, lang: "en", website: "" }, "/");
  assert.equal(refused.status, 303);
  const back = refused.headers.get("location");
  assert.equal(back, "/?error=invalid_email");
  assert.match(await (await get(null, back)).text(), /Check the email address\./u);
  const sent = await form(null, "/actions/sendRequest", { name: "Marc", email: "marc.lenoir@gmail.com", subject: "Quick", message: "A question.", started, lang: "en", website: "" }, "/");
  assert.match(sent.headers.get("location"), /^\/t\/[A-Za-z0-9_-]{32}\?new=1/u);
  // From another site: refused.
  assert.equal((await form(null, "/actions/sendRequest", { email: "x@example.com" }, "/", { "sec-fetch-site": "cross-site" })).status, 403);
});

test("the form's counters know a visitor by the address the Chest's front saw — never by X-Forwarded-For", async () => {
  await database.sql`delete from form_counts`;
  const started = await shown();
  await wait(1600);
  const ask = async (i, headers) => (await call(null, "sendRequest", { name: "", email: `v${i}@example.com`, subject: `Visitor ${i}`, message: "Hello there.", started, lang: "en", website: "" }, headers)).json();
  // A visitor who writes a new X-Forwarded-For each time is still one visitor.
  const answers = [];
  for (let i = 0; i < 6; i++) answers.push(await ask(i, { "chest-visitor-address": "203.0.113.7", "x-forwarded-for": `198.51.100.${i}` }));
  assert.deepEqual(answers.map(a => a.ok), [true, true, true, true, true, false]);
  assert.equal(answers[5].error, "too_many");
  assert.equal((await ask(9, { "chest-visitor-address": "203.0.113.8" })).ok, true, "another visitor");
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
  assert.match(zip.headers.get("content-disposition"), /^attachment; filename="support-export-\d{4}-\d{2}-\d{2}\.zip"$/u);
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
  assert.match(await wrong.text(), /This link does not work/u);
  const again = await (await call(null, "writeAgain", { secret: lampLink, message: "Any news?", files: [] })).json();
  assert.equal(again.ok, true);
  assert.equal((await (await call(null, "writeAgain", { secret: "y".repeat(32), message: "Mine now" })).json()).error, "not_found");
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
  assert.equal((await get(null, "/assets/icon.svg")).status, 200);
});
