import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { testDatabase } from "./support/db.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest on the team host, visitors
// on the public host, a real PostgreSQL (PGlite, or TEST_DATABASE_URL) with
// the sample bookings of seed/sample.sql. The services are tested on their
// own in the other files; here, what the server adds: routes, policy,
// look, actions (from an island, from a form), public pages and their
// guard, files, the Chest's signed calls.
let chest, database, app;
before(async () => {
  chest = await fakeChest({ tool: "booking", network: {}, members: everyone, capabilities: ["members", "notifications", "mail", "calendar"], mail: { domain: "atelier.test" }, calendar: { domain: "atelier.test", toolTitle: "Booking", company: "Atelier Martin" }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin" } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://booking-chest.chest.test";
const publicHost = "https://booking.chest.test";
const get = (who, path, headers = {}) => app.fetch(who ? withMember(new Request(team + path, { headers }), who) : new Request(publicHost + path, { headers }));
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(`${who ? team + "/chest" : publicHost}/actions/${name}`, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
// A form as an island sends it (FormData, the island's header).
const form = (path, fields, headers = {}) => app.fetch(new Request(publicHost + path, { method: "POST", body: new URLSearchParams(fields), headers: { "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }));
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const clean = html => {
  assert.doesNotMatch(html, /\sstyle="/u, "no style attribute");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u, "no inline script");
  assert.doesNotMatch(html, /<style/u, "no style element");
};
const props = (html, island) => JSON.parse(new RegExp(`data-island="${island}"[^>]*? data-props="([^"]*)"`, "u").exec(html)[1].replaceAll("&quot;", "\"").replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));

test("the agenda: the member's language, the policy, the look as a stylesheet, nothing inline; 401 without the Chest", async () => {
  const response = await get(ines, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  clean(html);
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Rendez-vous<\/title>|<title>[^<]+ · Rendez-vous<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /Marie Leroy/u, "her booking on Inès's agenda");
  assert.match(html, /data-island="AgendaTools"/u, "blocking a time, from the agenda");
  assert.match(html, /data-block="\{&quot;day&quot;/u, "free stretches say what they ask, as data");
  assert.match(html, /class="meeting type-[a-z]+/u, "a type's colour is a class");
  const anonymous = await app.fetch(new Request(team + "/chest"));
  assert.equal(anonymous.status, 401);
});

test("the look: a stylesheet with its hash, kept a year when linked by it, 304 when the browser has it; the public pages wear Booking's own", async () => {
  const html = await (await get(hugo, "/chest")).text();
  const v = /look\.css\?v=([\w-]{16})/u.exec(html)[1];
  const sheet = await get(hugo, `/chest/look.css?v=${v}`);
  assert.equal(sheet.status, 200);
  assert.equal(sheet.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(sheet.headers.get("cache-control"), "private, max-age=31536000, immutable");
  const etag = sheet.headers.get("etag");
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#5b2a86/u, "Booking's own identity: Appointment card");
  assert.match(css, /url\(\/assets\/fonts\/figtree-latin-wght-normal\.woff2\)/u);
  assert.equal((await get(hugo, "/chest/look.css", { "if-none-match": etag })).status, 304);
  assert.equal((await app.fetch(new Request(team + "/chest/look.css"))).status, 401, "the team's look is the team's");
  // The company chooses a catalogue theme for all its tools: the team's
  // pages wear it, the public ones keep Booking's own.
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  const after = await (await get(hugo, "/chest")).text();
  assert.doesNotMatch(after, new RegExp(`look\\.css\\?v=${v}`, "u"));
  const company = await (await get(null, "/")).text();
  assert.match(company, new RegExp(`href="/look\\.css\\?v=${v}"`, "u"));
  assert.match(await (await get(null, `/look.css?v=${v}`)).text(), /--accent:\s*#5b2a86/u);
  chest.theme.all = null;
  forgetTheme();
});

test("the team's pages: a booking, types, a type's form, hours, settings, a new booking", async () => {
  for (const path of ["/chest/bookings/1", "/chest/types", "/chest/types/new", "/chest/hours", "/chest/settings", "/chest/new", "/chest?show=past", "/chest?show=cancelled"]) {
    const response = await get(ines, path);
    assert.equal(response.status, 200, path);
    clean(await response.text());
  }
  const types = await (await get(ines, "/chest/types")).text();
  assert.match(types, /data-island="TypeSwitch"/u);
  const [{ id }] = await database.sql`select id::text from types where member_id = ${ines.id} order by position limit 1`;
  const edit = await (await get(ines, `/chest/types/${id}`)).text();
  assert.equal(props(edit, "TypeForm").id, id);
  assert.equal((await get(hugo, `/chest/types/${id}`)).status, 404, "another host's type does not exist for him");
  assert.equal((await get(ines, "/chest/types/abc")).status, 404);
  assert.equal((await get(ines, "/chest/bookings/999999")).status, 404);
  const missing = await get(ines, "/chest/nothing/here");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Rien ici/u, "a member's 404, in her words");
  // Nora has no role: why, not an error.
  assert.match(await (await get(nora, "/chest")).text(), /can’t use Booking yet/u);
  const settings = await (await get(camille, "/chest/settings")).text();
  assert.match(settings, /data-island="EmbedSettings"/u, "an administrator's settings");
  assert.match(settings, /href=\\?&quot;\/_chest\/calendar\\?&quot;|&quot;chestCalendar&quot;:&quot;\/_chest\/calendar&quot;/u, "the Chest's calendar page");
});

test("actions from an island: a time blocked and freed, refusals are codes in the reader's words", async () => {
  const day = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const blocked = await call(hugo, "blockTime", { day, from: 600, to: 660, note: "Dentist" });
  assert.equal(blocked.status, 200);
  const { ok, value } = await blocked.json();
  assert.equal(ok, true);
  assert.match(value, /^\d+$/u);
  assert.deepEqual(await (await call(hugo, "unblock", { id: value })).json(), { ok: true, value: null });
  const wrong = await call(ines, "blockTime", { day, from: 660, to: 600, note: "" });
  assert.equal(wrong.status, 400);
  const refusal = await wrong.json();
  assert.equal(refusal.ok, false);
  assert.match(refusal.message, /fin/u, "in French, for Inès");
  assert.equal((await call(nora, "createType", { input: { title: "Mine" } })).status, 403, "no role, no type");
  assert.equal((await call(ines, "noSuchAction", {})).status, 404);
  assert.equal((await call(ines, "bookTime", {})).status, 404, "a public action is not a members' one");
  assert.equal((await call(null, "blockTime", {})).status, 404, "nor the reverse");
  assert.equal((await call(ines, "saveWeekly", { weekly: "[]", zone: "Europe/Paris", dailyMax: 0 })).status, 400, "a structured value is never text");
});

test("cross-site requests are refused, on both parts", async () => {
  assert.equal((await call(ines, "confirmHours", {}, { "sec-fetch-site": "cross-site" })).status, 403);
  const noHeader = withMember(new Request(team + "/chest/actions/confirmHours", { method: "POST", body: "{}", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), ines);
  assert.equal((await app.fetch(noHeader)).status, 403, "JSON without the island's header");
  assert.equal((await form("/actions/cancelMine", { secret: "demoGuestLinkForTheScreens000000" }, { "sec-fetch-site": "cross-site" })).status, 403);
  const [{ status }] = await database.sql`select status from bookings where secret = 'demoGuestLinkForTheScreens000000'`;
  assert.equal(status, "confirmed");
});

test("the public pages: the company, a host, a type to book, in the visitor's words, nothing inline", async () => {
  const company = await get(null, "/", { "accept-language": "fr" });
  assert.equal(company.status, 200);
  assert.equal(company.headers.get("content-security-policy"), policy);
  const html = await company.text();
  clean(html);
  assert.match(html, /Atelier Martin/u);
  assert.match(html, /href="\/ines-moreau"/u);
  const host = await (await get(null, "/ines-moreau")).text();
  clean(host);
  assert.match(host, /class="offer type-[a-z]+"/u);
  const type = await get(null, "/ines-moreau/project-call");
  assert.equal(type.status, 200);
  const page = await type.text();
  clean(page);
  const island = props(page, "BookTime");
  assert.equal(island.typeSlug, "project-call");
  assert.ok(island.zones.length > 1, "the time zones, written by the server");
  assert.ok(island.started.length > 10, "the form's signed shown-at time");
  assert.equal((await get(null, "/nobody-here")).status, 404);
  assert.match(await (await get(null, "/nobody-here")).text(), /This page does not exist/u);
  assert.equal((await get(null, "/chest-events")).status, 404, "a reserved name is no host");
});

test("booking a time as a visitor: the form's guard, the booking, the guest's page, cancelled by its guest", async () => {
  const page = await (await get(null, "/ines-moreau/project-call")).text();
  const { started } = props(page, "BookTime");
  const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const slots = await (await get(null, `/api/slots?host=ines-moreau&type=project-call&from=${from}&to=${to}`)).json();
  assert.ok(slots.slots.length > 0, "free times");
  assert.equal((await get(null, "/api/slots?host=ines-moreau&type=project-call&from=x&to=y")).status, 400);
  const fields = { host: "ines-moreau", type: "project-call", start: slots.slots[0], zone: "America/Montreal", started, website: "", name: "Alex Martin", email: "alex@example.com", phone: "", note: "Hello", q_project1: "A home", q_budget01: "", q_plans001: "yes" };
  // A robot fills the field people never see: refused, nothing kept.
  const robot = await form("/actions/bookTime", { ...fields, website: "spam.test" });
  assert.equal(robot.status, 400);
  assert.equal((await robot.json()).error, "invalid");
  // A person (the server waits the few seconds a person takes, if needed).
  // (In English: the host's choices are answered as the visitor read them.)
  const booked = await form("/actions/bookTime", fields, { "chest-visitor-address": "203.0.113.7", "accept-language": "en" });
  assert.equal(booked.status, 200);
  const outcome = await booked.json();
  assert.equal(outcome.ok, true);
  assert.match(outcome.redirect, /^\/b\/[\w-]+\?new=1(&mailed=1)?$/u);
  const [row] = await database.sql`select guest_name, guest_language, answers from bookings where guest_email = 'alex@example.com'`;
  assert.equal(row.guest_name, "Alex Martin");
  assert.ok(chest.notifications.some(n => n.member === ines.id), "Inès is told in her bell");
  // The same time again: taken, in the visitor's words.
  const again = await form("/actions/bookTime", fields);
  assert.equal((await again.json()).error, "taken");
  // The guest's page, its calendar file, then cancelled by its guest.
  const guestPage = await get(null, outcome.redirect);
  assert.equal(guestPage.status, 200);
  const guest = await guestPage.text();
  clean(guest);
  assert.match(guest, /Alex|Inès Moreau/u);
  const secret = /^\/b\/([\w-]+)\?/u.exec(outcome.redirect)[1];
  const ics = await get(null, `/b/${secret}/ics`);
  assert.equal(ics.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.match(await ics.text(), /^BEGIN:VCALENDAR\r\n/u);
  const cancelled = await form("/actions/cancelMine", { secret, reason: "Sorry" });
  assert.deepEqual(await cancelled.json(), { ok: true, value: null });
  const [{ status }] = await database.sql`select status from bookings where guest_email = 'alex@example.com'`;
  assert.equal(status, "cancelled");
  assert.match(await (await get(null, `/b/${secret}`)).text(), /cancel/iu);
  assert.equal((await get(null, "/b/nolinkatall")).status, 200, "an unknown link says so, kindly");
});

test("downloads: the bookings as CSV for the team, a host's private feed", async () => {
  const csv = await get(camille, "/chest/export?who=all");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(await csv.text(), /Marie Leroy/u);
  assert.equal((await get(nora, "/chest/export?who=all")).status, 403);
  const made = await (await call(ines, "newFeed", {})).json();
  assert.match(made.value, /\/feed\/[\w-]+\.ics$/u);
  const feed = await get(null, new URL(made.value).pathname);
  assert.equal(feed.status, 200);
  assert.match(await feed.text(), /BEGIN:VEVENT/u);
  assert.equal((await get(null, "/feed/nothing.ics")).status, 404);
});

test("the public pages may be framed by the websites an administrator allowed", async () => {
  assert.equal((await call(camille, "saveSites", { sites: "https://www.atelier-martin.fr" })).status, 200);
  const framed = await get(null, "/ines-moreau");
  assert.match(framed.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/www\.atelier-martin\.fr$/u);
  assert.match((await get(ines, "/chest")).headers.get("content-security-policy"), /frame-ancestors 'none'$/u, "never the team's");
  await call(camille, "saveSites", { sites: "" });
  assert.equal((await get(null, "/ines-moreau")).headers.get("content-security-policy"), policy);
});

test("the language switch, the browser's files, the error pages", async () => {
  const lang = await get(null, "/lang/fr?back=/ines-moreau");
  assert.equal(lang.headers.get("location"), "/ines-moreau");
  assert.match(lang.headers.get("set-cookie"), /^lang=fr;/u);
  assert.equal((await get(null, "/lang/fr?back=//evil.test")).headers.get("location"), "/");
  const icon = await get(null, "/assets/icon.svg?v=1");
  assert.equal(icon.status, 200, "the browser's files (npm run build: dist/client)");
  assert.equal(icon.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await get(null, "/assets/nothing.js")).status, 404);
});

test("the Chest's events and schedule runs, signed, each handled once", async () => {
  const to = request => app.fetch(request);
  assert.equal(await chest.run("reminders", to), 204);
  assert.equal(await chest.run("cleanup", to), 204);
  assert.equal(await chest.run("calendars", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  assert.equal((await app.fetch(new Request(team + "/chest-schedules", { method: "POST", body: "{}" }))).status, 401, "unsigned");
  // A host who leaves: their page takes no new booking.
  const left = { type: "member.removed", id: "evt_" + "d".repeat(26), data: { id: hugo.id } };
  assert.equal(await chest.emit(left, to), 204);
  assert.equal(await chest.emit(left, to), 204);
  assert.equal((await get(null, "/hugo-bernard")).status, 404);
});
