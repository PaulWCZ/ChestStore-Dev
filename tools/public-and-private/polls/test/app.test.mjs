import assert from "node:assert/strict";
import { solveWork } from "@argentic/chest-app";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { testDatabase } from "./support/db.ts";
import { camille, chestGroups, everyone, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, visitors on the public
// host, a real PostgreSQL (PGlite, or TEST_DATABASE_URL) with the sample
// polls of seed/sample.sql. The services are tested on their own in the
// other files; here, what the server adds: routes, policy, look, actions,
// forms without script, files, the Chest's signed calls.
let chest, database, app;
before(async () => {
  chest = await fakeChest({ tool: "polls", network: {}, members: everyone, groups: chestGroups, capabilities: ["members", "notifications", "mail", "calendar", "members.groups"], mail: { domain: "atelier.test" }, calendar: { domain: "atelier.test", toolTitle: "Polls", company: "Atelier" }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin" } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://polls-chest.chest.test";
const url = path => `${team}${path}`;
const get = (who, path, headers = {}) => app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
// An action as call() sends it from an island of the page.
// A proof of work, as the browser computes it, for a token that asks one.
const proven = fields => (typeof fields.chest_form === "string" && Number(fields.chest_form.split(".")[3] ?? 0) > 0 && fields.chest_work === undefined ? { ...fields, chest_work: solveWork(fields.chest_form) } : fields);
const call = (who, name, input, headers = {}) => {
  const request = new Request(url(`${who ? "/chest" : ""}/actions/${name}`), { method: "POST", body: JSON.stringify(proven(input)), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
// A form posted without JavaScript.
const form = (who, path, fields, from, headers = {}) => {
  const request = new Request(url(path), { method: "POST", body: new URLSearchParams(proven(fields)), headers: { "sec-fetch-site": "same-origin", referer: url(from), host: "polls-chest.chest.test", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const clean = html => {
  assert.doesNotMatch(html, /\sstyle="/u, "no style attribute");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u, "no inline script");
  assert.doesNotMatch(html, /<style/u, "no style element");
};

test("the home page: the member's language, the policy, the look as a stylesheet, nothing inline", async () => {
  const response = await get(ines, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  clean(html);
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Sondages<\/title>/u);
  assert.match(html, /À répondre/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#fff7ef"\/>/u);
  assert.equal((await get(null, "/chest")).status, 401);
});

test("the look: a stylesheet with its hash, kept a year when linked by it, 304 when the browser has it", async () => {
  const html = await (await get(hugo, "/chest")).text();
  const v = /look\.css\?v=([\w-]{16})/u.exec(html)[1];
  const sheet = await get(hugo, `/chest/look.css?v=${v}`);
  assert.equal(sheet.status, 200);
  assert.equal(sheet.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(sheet.headers.get("cache-control"), "private, max-age=31536000, immutable");
  const etag = sheet.headers.get("etag");
  assert.ok(etag.startsWith(`"${v}`), "the ETag begins with the link's hash");
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#ff7a63/u, "Polls' own identity: Confetti");
  assert.match(css, /url\(\/assets\/fonts\/fredoka-latin-wght-normal\.woff2\)/u);
  assert.equal((await get(hugo, "/chest/look.css", { "if-none-match": etag })).status, 304);
  assert.equal((await get(hugo, "/chest/look.css")).headers.get("cache-control"), "private, no-cache");
  assert.equal((await get(null, "/chest/look.css")).status, 401, "the team's look is the team's");
  // The company chooses another look for all its tools: a new sheet, a new link.
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  const after = await (await get(hugo, "/chest")).text();
  assert.doesNotMatch(after, new RegExp(`look\\.css\\?v=${v}`, "u"));
  // The public pages keep Polls' own look (a catalogue theme is the team's choice).
  const publicPage = await (await get(null, "/")).text();
  assert.match(publicPage, new RegExp(`href="/look\\.css\\?v=${v}"`, "u"));
  assert.match(await (await get(null, `/look.css?v=${v}`)).text(), /--accent:\s*#ff7a63/u);
  chest.theme.all = null;
  forgetTheme();
});

test("a poll's page: its words, the answer island, the results with bars as classes", async () => {
  const response = await get(sofia, "/chest/polls/1");
  assert.equal(response.status, 200);
  const html = await response.text();
  clean(html);
  assert.match(html, /<title>Where shall we have lunch on Friday\? · Polls<\/title>/u);
  assert.match(html, /data-island="AnswerArea"/u, "Sofia is asked too");
  assert.match(html, /class="bar"[^>]*><i class="pct-\d{1,3}"/u);
  assert.match(html, /data-island="Manage"/u, "her poll: the organiser's panel");
  assert.match(html, /data-island="AutoRefresh"/u, "open: it re-reads itself");
  // A draft goes to the composer; a poll not put to someone does not exist for them.
  const draft = await get(camille, "/chest/polls/5");
  assert.equal(draft.status, 302);
  assert.equal(draft.headers.get("location"), "/chest/polls/5/edit");
  assert.equal((await get(hugo, "/chest/polls/5")).status, 404);
  assert.equal((await get(hugo, "/chest/polls/999")).status, 404);
  assert.equal((await get(hugo, "/chest/polls/abc")).status, 404);
  const missing = await get(lea, "/chest/polls/999");
  assert.match(await missing.text(), /Rien ici[\s\S]*Retour aux sondages/u);
});

test("the composer: a new poll, the team pulse for organisers only, a draft", async () => {
  const fresh = await (await get(hugo, "/chest/new?kind=date")).text();
  clean(fresh);
  assert.match(fresh, /data-island="Composer"/u);
  assert.match(fresh, /&quot;kind&quot;:&quot;date&quot;/u);
  const pulse = await (await get(sofia, "/chest/new?kind=survey&preset=pulse")).text();
  assert.match(pulse, /&quot;repeat&quot;:&quot;week&quot;/u, "the pulse, ready to send");
  assert.doesNotMatch(await (await get(hugo, "/chest/new?kind=survey&preset=pulse")).text(), /&quot;repeat&quot;:&quot;week&quot;/u, "a member gets a plain survey");
  assert.match(await (await get(camille, "/chest/polls/5/edit")).text(), /Summer offsite/u);
  assert.equal((await get(sofia, "/chest/polls/5/edit")).status, 404, "a draft is its organiser's alone");
});

test("actions from an island: a poll written, sent, answered; refusals are codes in the reader's words", async () => {
  const sent = await call(sofia, "savePoll", { input: { kind: "choice", title: "Coffee or tea?", options: ["Coffee", "Tea"], open: true } });
  assert.equal(sent.status, 200);
  const { ok, value } = await sent.json();
  assert.equal(ok, true);
  assert.equal(value.status, "open");
  const page = await (await get(hugo, `/chest/polls/${value.id}`)).text();
  const question = /&quot;id&quot;:&quot;(\d+)&quot;,&quot;kind&quot;:&quot;choice&quot;/u.exec(page)[1];
  const option = new RegExp(`&quot;options&quot;:\\[\\{&quot;id&quot;:&quot;(\\d+)&quot;,&quot;label&quot;:&quot;Coffee`, "u").exec(page)[1];
  const answered = await (await call(hugo, "answerPoll", { pollId: value.id, answer: { [question]: { options: [option] } } })).json();
  assert.deepEqual(answered, { ok: true, value: { first: true } });
  assert.ok(chest.notifications.some(n => n.key === `poll:${value.id}:ask` && n.member === ines.id && /demande/u.test(n.translations?.fr?.title ?? "")), "Inès told in French");
  // Refusals: a code, the reader's words, the right status.
  const empty = await call(ines, "savePoll", { input: { kind: "choice", title: "  ", options: ["A", "B"] } });
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { ok: false, error: "empty", message: "Écrivez quelque chose d’abord." });
  const notMine = await call(hugo, "closeNow", { pollId: value.id });
  assert.equal(notMine.status, 403);
  assert.equal((await notMine.json()).message, "Your role does not allow this.");
  assert.equal((await call(hugo, "savePoll", { input: "{\"kind\":\"choice\"}" })).status, 400, "a structured value is never text");
  assert.equal((await call(hugo, "noSuchAction", {})).status, 404);
  assert.equal((await call(hugo, "answerGuest", {})).status, 404, "a public action is not a members' one");
  assert.equal((await call(nora, "savePoll", { input: { kind: "choice", title: "Mine?", options: ["A", "B"], open: true } })).status, 403, "no role, no poll");
});

test("cross-site requests are refused, on both parts", async () => {
  assert.equal((await call(sofia, "closeNow", { pollId: "1" }, { "sec-fetch-site": "cross-site" })).status, 403);
  const noHeader = withMember(new Request(url("/chest/actions/closeNow"), { method: "POST", body: JSON.stringify({ pollId: "1" }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), sofia);
  assert.equal((await app.fetch(noHeader)).status, 403, "JSON without the island's header");
  assert.equal((await form(null, "/actions/answerGuest", { link: "x" }, "/p/x", { "sec-fetch-site": "cross-site" })).status, 403);
  const [{ status }] = await database.sql`select status from polls where id = 1`;
  assert.equal(status, "open");
});

test("the guest page: a visitor's words, no member, an answer by a form without script, kept by a cookie", async () => {
  const link = "maisonleroykickoffxyzabcde";
  const page = await get(null, `/p/${link}`, { "accept-language": "fr-FR, en;q=0.5" });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-security-policy"), policy);
  const html = await page.text();
  clean(html);
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /href="\/look\.css\?v=/u);
  assert.match(html, /Kick-off/u);
  assert.match(html, /data-island="GuestForm"/u);
  assert.doesNotMatch(html, /Claire Leroy|Marc Petit/u, "never the other answers");
  // The form's token for answerGuest, in its <Honeypot /> (no script needed).
  const token = /data-action="answerGuest"[^>]*value="([^"]+)"/u.exec(html)[1];
  const dates = [...html.matchAll(/&quot;id&quot;:&quot;(\d+)&quot;,&quot;month&quot;/gu)].map(m => m[1]);
  assert.ok(dates.length >= 2);
  // A robot fills the field people never see: answered as if done, nothing kept.
  const robot = await form(null, `/p/${link}/actions/answerGuest`, { link, chest_form: token, website: "spam.test", name: "Bot", [`d${dates[0]}`]: "2" }, `/p/${link}`);
  assert.equal(robot.status, 303);
  assert.doesNotMatch(robot.headers.get("location"), /sent=|error=/u);
  assert.equal((await database.sql`select count(*)::int from participants where guest_name = 'Bot'`)[0].count, 0);
  // A form without the page's token is refused.
  const forged = await form(null, `/p/${link}/actions/answerGuest`, { link, chest_form: "1.2.3", name: "Jean Martin", [`d${dates[0]}`]: "2" }, `/p/${link}`);
  assert.match(forged.headers.get("location"), /\?error=expired$/u);
  // A person, a few seconds later: answered, a cookie for this poll's page only.
  await new Promise(r => setTimeout(r, 2100));
  const sent = await form(null, `/p/${link}/actions/answerGuest`, { link, chest_form: token, name: "Jean Martin", email: "", [`d${dates[0]}`]: "2", [`d${dates[1]}`]: "1" }, `/p/${link}`, { "chest-visitor-address": "203.0.113.7" });
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.get("location"), `/p/${link}?sent=1`);
  const cookie = sent.headers.get("set-cookie");
  assert.match(cookie, /^guest_11=[^;]+; Max-Age=15552000; Path=\/p\/maisonleroykickoffxyzabcde; HttpOnly; Secure; SameSite=Lax$/u);
  const back = await (await get(null, `/p/${link}?sent=1`, { cookie: cookie.split(";")[0] })).text();
  assert.match(back, /Jean Martin/u, "their own answer, from this browser");
  // Changed from the same browser: the cookie reaches the action under the
  // page's path, the answer is the same guest's, updated.
  const token2 = /data-action="answerGuest"[^>]*value="([^"]+)"/u.exec(back)[1];
  // A token serves once.
  const reused = await form(null, `/p/${link}/actions/answerGuest`, { link, poll: "11", chest_form: token, name: "Jean Martin", [`d${dates[0]}`]: "0" }, `/p/${link}`, { cookie: cookie.split(";")[0] });
  assert.match(reused.headers.get("location"), /\?error=expired$/u);
  await new Promise(r => setTimeout(r, 2100));
  const again = await form(null, `/p/${link}/actions/answerGuest`, { link, poll: "11", chest_form: token2, name: "Jean Martin", email: "", [`d${dates[0]}`]: "0", [`d${dates[1]}`]: "2" }, `/p/${link}`, { cookie: cookie.split(";")[0] });
  assert.equal(again.headers.get("location"), `/p/${link}?sent=2`);
  const [{ count }] = await database.sql`select count(*)::int from participants where poll_id = 11 and guest_name = 'Jean Martin'`;
  assert.equal(count, 1, "one guest, not two");
  const names = await (await get(sofia, "/chest/polls/11")).text();
  assert.match(names, /Jean Martin/u);
  assert.equal((await get(null, "/p/nolinkatallnolinkatallxyza")).status, 404);
  const gone = await (await get(null, "/p/nolinkatallnolinkatallxyza")).text();
  assert.match(gone, /This link does not open a poll/u);
  assert.match(gone, /class="guest-top"[\s\S]*Français/u, "the public frame: the brand and the language switch");
  // The guest link is a secret: the request log names the route, never the link.
  const lines = [];
  const write = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await get(null, `/p/${link}`);
    await get(null, "/p/nolinkatallnolinkatallxyza");
  } finally {
    console.log = write;
  }
  assert.ok(lines.some(l => /^info request method=GET route=\/p\/:link status=200/u.test(l)), lines.join("\n"));
  assert.ok(lines.every(l => !l.includes(link) && !l.includes("nolinkatall")), lines.join("\n"));
});

test("downloads: the answers as CSV for those who manage the poll, the chosen date as .ics", async () => {
  const csv = await get(sofia, "/chest/polls/1/export");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.headers.get("content-disposition"), /^attachment; filename="[\w-]+-1\.csv"$/u);
  const bytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a byte-order mark: accents open right in a spreadsheet");
  assert.match(new TextDecoder().decode(bytes), /^Person,Where shall we have lunch on Friday\?\r\n/u);
  assert.equal((await get(hugo, "/chest/polls/1/export")).status, 403);
  const ics = await get(tom, "/chest/polls/2/calendar");
  assert.equal(ics.status, 200);
  const text = await ics.text();
  assert.match(text, /^BEGIN:VCALENDAR\r\n/u);
  assert.match(text, /URL:https:\/\/polls-chest\.chest\.test\/chest\/polls\/2\r\n/u);
  assert.equal((await get(tom, "/chest/polls/1/calendar")).status, 404, "no date chosen");
});

test("a form without script: posted, then back to its page", async () => {
  const refused = await form(lea, "/chest/actions/postComment", { pollId: "1", body: "" }, "/chest/polls/1");
  assert.equal(refused.status, 303);
  assert.equal(refused.headers.get("location"), "/chest/polls/1?error=empty");
  assert.match(await (await get(lea, "/chest/polls/1?error=empty")).text(), /role="alert">Écrivez quelque chose d’abord\./u);
});

test("the public root, the language switch, the error pages", async () => {
  const root = await get(null, "/", { "accept-language": "en" });
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Polls lives in your Chest/u);
  const lang = await get(null, "/lang/fr?back=/p/abc");
  assert.equal(lang.headers.get("location"), "/p/abc");
  assert.match(lang.headers.get("set-cookie"), /^lang=fr;/u);
  assert.equal((await get(null, "/lang/fr?back=//evil.test")).headers.get("location"), "/");
  assert.equal((await get(null, "/nothing")).status, 404);
  assert.equal((await get(null, "/assets/nothing.js")).status, 404);
  // The browser's files exist once npm run build made dist/client.
  const icon = await get(null, "/assets/icon.svg?v=1");
  if (existsSync("dist/client/assets/icon.svg")) {
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get("cache-control"), "public, max-age=31536000, immutable");
  } else assert.equal(icon.status, 404);
});

test("the Chest's events and schedule runs, signed, each handled once", async () => {
  const to = request => app.fetch(request);
  // A draft of someone who leaves goes; the delivery made again does nothing.
  const left = { type: "member.removed", id: "evt_" + "d".repeat(26), data: { id: camille.id } };
  assert.equal(await chest.emit(left, to), 204);
  assert.equal(await chest.emit(left, to), 204);
  assert.equal((await database.sql`select 1 from polls where id = 5`).length, 0);
  // The pass: a poll past its closing time closes.
  await database.sql`update polls set closes_at = now() - interval '1 minute' where id = 4`;
  assert.equal(await chest.run("pass", to), 204);
  const [{ status }] = await database.sql`select status from polls where id = 4`;
  assert.equal(status, "closed");
  assert.equal(await chest.run("nothing", to), 404);
  assert.equal((await app.fetch(new Request(url("/chest-schedules"), { method: "POST", body: "{}" }))).status, 401, "unsigned");
});

test("how guests learn the chosen date, said to the organiser and to the guest: by email, or on the link's page when the Chest cannot send", async () => {
  const link = "maisonleroykickoffxyzabcde";
  const on = await (await get(sofia, "/chest/polls/11")).text();
  assert.match(on, /data-island="GuestsCard"[^>]*&quot;mail&quot;:&quot;on&quot;/u);
  assert.match(await (await get(null, `/p/${link}`)).text(), /id="guest-email"|&quot;mailOn&quot;:true/u, "the form asks an email");
  chest.delivery.mail = "not_connected";
  try {
    const off = await (await get(sofia, "/chest/polls/11")).text();
    assert.match(off, /data-island="GuestsCard"[^>]*&quot;mail&quot;:&quot;off&quot;/u);
    assert.match(off, /Guests are not emailed/u);
    const guest = await (await get(null, `/p/${link}`)).text();
    assert.match(guest, /&quot;mailOn&quot;:false/u, "no email asked");
    assert.match(guest, /Open this link again to see the date chosen/u);
  } finally {
    chest.delivery.mail = "ready";
  }
});
