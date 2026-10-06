import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { formToken } from "@argentic/chest-app";
import { atLeast, checkPage, checkSources, checkWords } from "@argentic/chest-app/testing";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import { testDatabase } from "./support/db.ts";
import { camille, everyone, lea, nora, tom } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest on the team host,
// visitors on the public host — the company's own domain
// (status.atelier-martin.fr) —, a real PostgreSQL (TEST_DATABASE_URL, or
// PGlite) with Atelier Martin's sample shop (seed/sample.sql). The rules
// are tested on their own in the other files; here, what the server adds:
// routes, the policy, the look, actions from islands and forms without
// script, caching, files, the API, the Chest's signed deliveries.
atLeast(18);
const domain = "https://status.atelier-martin.fr";
let chest, database, app;
before(async () => {
  chest = await fakeChest({ network: {}, tool: "status", members: everyone, capabilities: ["database", "members", "notifications", "mail"], mail: { domain: "atelier-martin.test" }, webhooks: { max: 200 }, checks: { max: 10 }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en", publicUrl: domain } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
  forgetTheme();
});

const teamHost = "https://status-chest.chest.test";
const publicHost = "https://status.chest.test";
const get = (who, path, headers = {}) => app.fetch(who ? withMember(new Request(teamHost + path, { headers }), who) : new Request(publicHost + path, { headers }));
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(`${who ? teamHost + "/chest" : publicHost}/actions/${name}`, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
// A public form posted without JavaScript.
const form = (path, fields, from, headers = {}) => app.fetch(new Request(publicHost + path, { method: "POST", body: new URLSearchParams(fields), headers: { "sec-fetch-site": "same-origin", referer: publicHost + from, host: "status.chest.test", ...headers } }));
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const page = async (who, path, headers) => {
  const response = await get(who, path, headers);
  assert.equal(response.status, 200, path);
  return checkPage(await response.text());
};

test("the status page: the company's title, the visitor's language, the policy, the look and the state colours as a stylesheet, kept 30 s per language", async () => {
  const response = await get(null, "/", { "accept-language": "fr-FR,fr;q=0.9" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "public, max-age=30, stale-while-revalidate=30");
  // The package gzips the page: a shared cache keeps one copy per encoding too.
  assert.equal(response.headers.get("vary"), "Accept-Language, Cookie, Accept-Encoding");
  const html = checkPage(await response.text());
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>État des services — Atelier Martin<\/title>/u);
  assert.match(html, /<meta name="robots" content="index, follow"\/>/u);
  assert.match(html, /data-island="LocalTimes"/u, "times in the visitor's zone");
  assert.doesNotMatch(html, /data-island="(?!LocalTimes|ToastHost|AutoRefresh)/u, "nothing else runs on the public page");
  assert.match(html, /<link rel="alternate" type="application\/atom\+xml" href="\/feed\.atom"/u);
  // The states' shapes once, the 90 days' tooltips by reference.
  assert.equal((html.match(/id="state-operational"/gu) ?? []).length, 1);
  assert.ok((html.match(/<use href="#state-/gu) ?? []).length > 500);
  assert.ok(html.length < 160_000, `the page weighs ${html.length} characters`);
  // A reload with the page's ETag: 304 while nothing changed.
  const tag = response.headers.get("etag");
  assert.match(tag, /^W\/"[\w-]{22}"$/u);
  const again = await get(null, "/", { "accept-language": "fr-FR,fr;q=0.9", "if-none-match": tag });
  assert.equal(again.status, 304);
  assert.equal(again.headers.get("etag"), tag);
  const v = /href="\/look\.css\?v=([\w-]{16})"/u.exec(html)?.[1];
  assert.ok(v, "the look is linked by its hash");
  const sheet = await get(null, `/look.css?v=${v}`);
  assert.equal(sheet.headers.get("cache-control"), "public, max-age=31536000, immutable".replace("public", "private"));
  const css = await sheet.text();
  assert.match(css, /--s-major:#c42d17/u, "the five state colours, fixed in every look");
  assert.match(css, /url\(\/assets\/fonts\/red-hat-text-latin-wght-normal\.woff2\)/u);
  // An editor's link shows it fresh, never a copy a cache kept.
  assert.equal((await get(null, "/?fresh=1")).headers.get("cache-control"), "no-store");
});

test("the public pages render without script and stay apart from the team's: history, an incident, 404s in the visitor's words", async () => {
  assert.match(await page(null, "/history"), /<title>Incident history — Atelier Martin status<\/title>/u);
  const incident = await page(null, "/incidents/1");
  assert.match(incident, /id="postmortem"/u);
  const missing = await get(null, "/incidents/999");
  assert.equal(missing.status, 404);
  const html = checkPage(await missing.text());
  assert.match(html, /The status page is one click away/u);
  assert.match(html, /href="\/">Back to the status page/u);
  assert.equal((await get(null, "/chest")).status, 401, "the team's part needs the Chest's assertion");
  assert.equal((await get(null, "/nowhere")).status, 404);
});

// A form's token as a page carries it, old enough not to wait the form's
// two seconds.
const token = (action = "subscribe") => formToken(action, Date.now() - 3000);
const subscribeForm = (fields, headers = {}) => form("/actions/subscribe", { website: "", scope: "all", chest_form: token(), ...fields }, "/subscribe", headers);

test("subscribing by email without script: the form's token, the same answer whoever, the address never kept by a cache or passed on", async () => {
  const shown = await get(null, "/subscribe");
  assert.equal(shown.headers.get("cache-control"), "no-store");
  assert.equal(shown.headers.get("referrer-policy"), "no-referrer");
  const html = checkPage(await shown.text());
  assert.match(html, /<form [^>]*action="\/actions\/subscribe" method="post"/u);
  const pageToken = /data-action="subscribe" name="chest_form" value="([^"]+)"/u.exec(html)[1];
  // A refused address comes back to the form, typed, with the reason.
  const wrong = await form("/actions/subscribe", { website: "", scope: "all", chest_form: pageToken, email: "ana@example" }, "/subscribe");
  assert.equal(wrong.status, 303);
  const back = wrong.headers.get("location");
  assert.match(back, /^\/subscribe\?error=invalid_email&values=/u);
  const refilled = checkPage(await (await get(null, back)).text());
  assert.match(refilled, /role="alert">This email address does not look right/u);
  assert.match(refilled, /name="email"[^>]*value="ana@example"|value="ana@example"[^>]*name="email"/u, "what was typed is kept");
  // A token serves once, whatever the answer: the page the form came back
  // to carries the next one.
  const spentToken = await form("/actions/subscribe", { website: "", scope: "all", chest_form: pageToken, email: "ana@example.com" }, "/subscribe");
  assert.match(spentToken.headers.get("location"), /^\/subscribe\?error=expired/u);
  const nextToken = /data-action="subscribe" name="chest_form" value="([^"]+)"/u.exec(refilled)[1];
  const sent = await form("/actions/subscribe", { website: "", scope: "all", chest_form: nextToken, email: "ana@example.com" }, "/subscribe");
  assert.equal(sent.headers.get("location"), "/subscribe?sent=1");
  // The field only robots fill: "done", and nothing done.
  const robot = await subscribeForm({ website: "spam", email: "robot@example.com" });
  assert.equal(robot.status, 303);
  assert.equal((await database.sql`select 1 from subscribers where email = 'robot@example.com'`).length, 0);
  const mail = chest.outbox.find(m => m.to.includes("ana@example.com"));
  assert.ok(mail, "a confirmation email");
  assert.match(mail.text, new RegExp(`${domain.replace(/\./gu, "\\.")}/s/[A-Za-z0-9_-]+`, "u"), "its link is on the company's own domain");
  // The subscriber's own page, from that link.
  const token = new RegExp(`${domain.replace(/\./gu, "\\.")}/s/([A-Za-z0-9_-]+)`, "u").exec(mail.text)[1];
  const own = await get(null, `/s/${token}`);
  assert.equal(own.headers.get("referrer-policy"), "no-referrer");
  assert.match(checkPage(await own.text()), /action="\/actions\/confirmSubscription"/u);
  const confirmed = await form("/actions/confirmSubscription", { token }, `/s/${token}`);
  assert.equal(confirmed.headers.get("location"), `/s/${token}?done=confirmed`);
  const gone = await form("/actions/unsubscribe", { token }, `/s/${token}`);
  assert.equal(gone.headers.get("location"), "/unsubscribed");
  assert.match(checkPage(await (await get(null, `/s/${token}`)).text()), /This link does not work/u);
});

test("a robot with no visitor address cannot close the form for customers, nor mail an address over and over", async () => {
  // One token, a hundred and five times: one goes, the rest are refused.
  const one = token();
  const answers = [];
  for (let k = 0; k < 105; k++) answers.push((await form("/actions/subscribe", { website: "", scope: "all", chest_form: one, email: `bot${k}@example.com` }, "/subscribe")).headers.get("location"));
  assert.equal(answers.filter(a => a === "/subscribe?sent=1").length, 1);
  assert.equal(answers.filter(a => a.startsWith("/subscribe?error=expired")).length, 104);
  // Fresh tokens, no cookie, no address: the same victim's address 60
  // times — one confirmation email (ten minutes apart, three a day at most).
  const before = chest.outbox.filter(m => m.to.includes("victim@example.com")).length;
  for (let k = 0; k < 60; k++) await subscribeForm({ email: "victim@example.com" });
  assert.equal(chest.outbox.filter(m => m.to.includes("victim@example.com")).length - before, 1);
  // And 150 new addresses: still far from the day's thousand.
  for (let k = 0; k < 150; k++) await subscribeForm({ email: `flood${k}@example.com` });
  // A customer, with no address the Chest gives either, subscribes.
  assert.equal((await subscribeForm({ email: "lucie@example.com" })).headers.get("location"), "/subscribe?sent=1");
});

test("the form's day: five new addresses per browser, a thousand in all, then it closes for new ones only", async () => {
  const cookie = { cookie: "chest_v=browser-of-a-person-123" };
  for (let k = 0; k < 5; k++) assert.equal((await subscribeForm({ email: `person${k}@example.com` }, cookie)).headers.get("location"), "/subscribe?sent=1");
  assert.match((await subscribeForm({ email: "person5@example.com" }, cookie)).headers.get("location"), /^\/subscribe\?error=limit/u);
  // The day's thousand new addresses reached: new ones wait for tomorrow…
  await database.sql`insert into chest_bounds (scope, visitor, day, count) values ('subscribe:new', '*', current_date, 1000) on conflict (scope, visitor, day) do update set count = 1000`;
  const closed = await subscribeForm({ email: "late@example.com" });
  assert.match(closed.headers.get("location"), /^\/subscribe\?error=limit/u);
  assert.match(checkPage(await (await get(null, closed.headers.get("location"))).text()), /Too many requests today/u);
  // …someone already known still gets the link to their page.
  assert.equal((await subscribeForm({ email: "lucie@example.com" })).headers.get("location"), "/subscribe?sent=1");
  await database.sql`delete from chest_bounds where scope = 'subscribe:new'`;
});

test("public actions refuse another site, and a form sent with JavaScript gets JSON", async () => {
  const cross = await form("/actions/unsubscribe", { token: "x" }, "/", { "sec-fetch-site": "cross-site" });
  assert.equal(cross.status, 403);
  const fetched = await call(null, "chooseFollowed", { token: "nothing", scope: "all" });
  assert.deepEqual(await fetched.json(), { ok: true, value: null, redirect: "/s/unknown" });
});

test("the team's pages: every one renders without inline style or script, in the member's language", async () => {
  for (const path of ["/chest", "/chest/incidents/new", "/chest/incidents/7", "/chest/incidents/9", "/chest/maintenance/new", "/chest/components", "/chest/checks", "/chest/subscribers", "/chest/history", "/chest/settings"]) {
    const html = await page(tom, path);
    assert.match(html, /<html lang="en">/u, path);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/u, path);
    assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u, path);
    assert.match(html, /data-look="own"/u, path);
  }
  const fr = await page(lea, "/chest");
  assert.match(fr, /<html lang="fr">/u);
  assert.match(fr, /href="https:\/\/status\.atelier-martin\.fr\/\?fresh=\d+"/u, "the public page, on the company's own domain, fresh");
  assert.equal((await get(tom, "/chest/incidents/999")).status, 404);
  assert.equal((await get(tom, "/chest/look.css")).headers.get("content-type"), "text/css; charset=utf-8");
});

test("a member without a role reads the team's status page, whatever the address, and may change nothing", async () => {
  for (const path of ["/chest", "/chest/settings", "/chest/incidents/7"]) {
    const html = await page(nora, path);
    assert.match(html, /<h1[^>]*>État de nos services<\/h1>/u, path);
    assert.doesNotMatch(html, /data-island="(IncidentView|SettingsView)"/u, path);
  }
  const refused = await call(nora, "addComponent", { name: "Intranet" });
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, "forbidden");
  assert.equal((await get(nora, "/chest/export")).status, 403);
});

test("actions from an island: an incident posted, updated, resolved — told to the team; another site refused", async () => {
  const [component] = await database.sql`select id from components where kind = 'component' and name = 'Payments'`;
  const posted = await call(tom, "postIncident", { title: "Payments failing", status: "investigating", body: "We are looking into it.", states: { [component.id]: "major" } });
  assert.equal(posted.status, 200);
  const { value } = await posted.json();
  assert.match(value.id, /^\d+$/u);
  assert.ok(chest.notifications.some(n => n.member === camille.id || n.broadcast), "the editors are told");
  const resolved = await call(tom, "postUpdate", { incidentId: value.id, status: "resolved", body: "Fixed." });
  assert.deepEqual(await resolved.json(), { ok: true, value: { resolved: true } });
  const again = await call(tom, "postUpdate", { incidentId: value.id, status: "monitoring", body: "x" });
  assert.equal((await again.json()).error, "already_resolved");
  const empty = await call(tom, "postIncident", { title: "", status: "investigating", body: "x", states: { [component.id]: "major" } });
  assert.equal((await empty.json()).message, "Write something first.");
  assert.equal((await call(tom, "removeIncident", { incidentId: value.id }, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await call(tom, "removeIncident", { incidentId: "1 or 1=1" })).status, 400);
});

test("the public API in Statuspage's shape: any site may read it, links on the company's domain", async () => {
  const response = await get(null, "/api/v2/summary.json");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("cache-control"), "public, max-age=30");
  const body = await response.json();
  assert.equal(body.page.url, domain);
  assert.ok(body.components.length > 0);
  for (const path of ["status.json", "components.json", "incidents.json", "incidents/unresolved.json", "scheduled-maintenances.json", "scheduled-maintenances/upcoming.json", "scheduled-maintenances/active.json"]) assert.equal((await get(null, `/api/v2/${path}`)).status, 200, path);
  assert.equal((await app.fetch(new Request(publicHost + "/api/v2/status.json", { method: "OPTIONS" }))).status, 204);
});

test("the badge and the banner keep their own policies: a picture, and a frame only the listed sites may hold", async () => {
  const badge = await get(null, "/badge.svg?lang=fr");
  assert.equal(badge.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal(badge.headers.get("content-security-policy"), "default-src 'none'; style-src 'none'; frame-ancestors 'none'");
  assert.match(await badge.text(), /<svg[^>]*role="img"/u);
  await call(tom, "savePage", { website: "https://atelier-martin.fr", support: "", embedSites: "" });
  let banner = await get(null, "/embed?lang=en");
  assert.match(banner.headers.get("content-security-policy"), /frame-ancestors 'none'$/u, "no site listed: nobody frames it");
  await call(tom, "savePage", { website: "https://atelier-martin.fr", support: "", embedSites: "https://shop.atelier-martin.fr" });
  banner = await get(null, "/embed?lang=en&theme=dark");
  assert.match(banner.headers.get("content-security-policy"), /style-src 'self';.*frame-ancestors https:\/\/shop\.atelier-martin\.fr$/u);
  const html = checkPage(await banner.text());
  assert.match(html, /<link rel="stylesheet" href="\/embed\.css\?theme=dark&amp;v=[\w-]{16}">/u);
  assert.match(html, new RegExp(`href="${domain.replace(/\./gu, "\\.")}/"`, "u"));
  const css = await get(null, "/embed.css?theme=dark");
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  assert.match(await css.text(), /--bg:#141a21/u);
});

test("feeds and the maintenance calendar link to the company's domain, in the visitor's language", async () => {
  const atom = await (await get(null, "/feed.atom", { cookie: "lang=fr" })).text();
  assert.match(atom, new RegExp(`<link[^>]*href="${domain.replace(/\./gu, "\\.")}/incidents/\\d+"`, "u"));
  assert.match(atom, /État des services/u);
  const rss = await get(null, "/feed.rss");
  assert.equal(rss.headers.get("content-type"), "application/rss+xml; charset=utf-8");
  const ics = await (await get(null, "/maintenance.ics")).text();
  assert.match(ics, /^BEGIN:VCALENDAR/u);
  assert.match(ics, /URL:https:\/\/status\.atelier-martin\.fr\/incidents\//u);
});

test("heartbeats: a job's secret address answers 204, an unknown one 404, never cached", async () => {
  const [component] = await database.sql`select id from components where kind = 'component' order by id limit 1`;
  const made = await call(tom, "createHeartbeat", { componentId: component.id, every: 60 });
  const { value } = await made.json();
  assert.ok(value.url.startsWith(`${domain}/heartbeat/`), "the address is on the company's domain");
  const path = new URL(value.url).pathname;
  assert.equal((await app.fetch(new Request(publicHost + path, { method: "POST" }))).status, 204);
  assert.equal((await get(null, path)).status, 204);
  const unknown = await get(null, "/heartbeat/nothing-here");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get("cache-control"), "no-store");
});

test("downloads for editors: everything as JSON, the subscribers as a spreadsheet", async () => {
  const all = await get(tom, "/chest/export");
  assert.equal(all.status, 200);
  assert.match(all.headers.get("content-disposition"), /^attachment; filename="status-export-\d{4}-\d{2}-\d{2}\.json"$/u);
  assert.equal((await all.json()).format, "chest-status-export");
  const csv = await get(tom, "/chest/export/subscribers.csv");
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
});

test("the Chest's deliveries, signed: the 'updates' schedule, events, check results, a stopped chat — and nothing unsigned", async () => {
  const to = request => app.fetch(request);
  assert.equal(await chest.run("updates", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  for (const path of ["/chest-schedules", "/chest-events", "/chest-checks", "/chest-webhooks"]) {
    assert.equal((await app.fetch(new Request(teamHost + path, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }))).status, 401, path);
  }
  assert.equal(await chest.emit({ type: "member.removed", data: { id: lea.id } }, to), 204);
});

test("the language switch keeps the visitor's choice and never sends them elsewhere", async () => {
  const switched = await get(null, "/lang/fr?back=/history");
  assert.equal(switched.status, 303);
  assert.equal(switched.headers.get("location"), "/history");
  assert.match(switched.headers.get("set-cookie"), /^lang=fr;/u);
  assert.equal((await get(null, "/lang/fr?back=//evil.test")).headers.get("location"), "/");
  assert.match(await page(null, "/history", { cookie: "lang=fr" }), /<html lang="fr">/u);
});

test("the stack's rules hold: no style attribute, no server code in the browser, capabilities used and declared, every word in both languages", () => {
  checkSources();
  checkWords({ en, fr });
});

test("the look follows the company's choice on the team's pages; the public pages keep the brand or Status's own", async () => {
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  const teamPage = await page(tom, "/chest");
  assert.match(teamPage, /data-look="catalogue"/u);
  const publicPage = await page(null, "/");
  assert.match(publicPage, /data-look="own"/u, "a catalogue theme stays inside");
  chest.theme.all = null;
  forgetTheme();
});

test("the request log names the route, never a subscriber's link", async () => {
  const lines = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { lines.push(String(chunk)); return write(chunk, ...rest); };
  try {
    await get(null, "/s/a-secret-token-of-someone");
    await get(null, "/heartbeat/another-secret");
  } finally {
    process.stdout.write = write;
  }
  const text = lines.join("");
  assert.doesNotMatch(text, /a-secret-token-of-someone|another-secret/u);
  assert.match(text, /route=\/s\/:token/u);
});
