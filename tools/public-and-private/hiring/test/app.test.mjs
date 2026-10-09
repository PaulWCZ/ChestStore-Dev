import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { formToken, solveWork } from "@argentic/chest-app";
import { atLeast, checkPage, settled, testDatabase } from "@argentic/chest-app/testing";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, visitors on the public
// host, a real PostgreSQL (TEST_DATABASE_URL, or PGlite) with the sample
// of seed/sample.sql. The rules are tested on their own in the other
// files; here, what the server adds: routes, policy, looks, roles, the
// public part's bounds, files, page versions, the Chest's deliveries.
atLeast(20);
const id = name => "mbr_" + name + "a".repeat(26 - name.length);
const person = (key, firstName, lastName, role, extra = {}) => ({ id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], language: "en", ...extra });
const camille = person("camille", "Camille", "Martin", "recruiter", { language: "fr" });
const sofia = person("sofia", "Sofia", "Rossi", "recruiter");
const ines = person("ines", "Inès", "Moreau", "interviewer", { language: "fr" });
const hugo = person("hugo", "Hugo", "Bernard", "interviewer");
const lea = person("lea", "Léa", "Dubois", "interviewer", { language: "fr" });
const nora = person("nora", "Nora", "Petit", null);

let chest, database, app;
before(async () => {
  chest = await fakeChest({
    tool: "hiring", network: {}, members: [camille, sofia, ines, hugo, lea, nora],
    capabilities: ["members", "files", "notifications", "mail", "calendar"],
    mail: { domain: "atelier.test" },
    storage: { publicUploads: true, publicFiles: true },
    chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en", publicUrl: "https://careers.atelier-martin.fr" },
  });
  database = await testDatabase({ extensions: ["pg_trgm", "unaccent", "btree_gist"] });
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://hiring-chest.chest.test";
const visitor = "https://hiring.chest.test";
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// A page as a browser receives it, checked for what the policy would
// block — but the job's JSON-LD, a data block for search engines a
// browser never runs (checked on its own below).
const checked = html => checkPage(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/u, ""));
const send = async request => {
  const response = await app.fetch(request);
  await settled();
  if (response.headers.get("content-type")?.startsWith("text/html")) checked(await response.clone().text());
  return response;
};
const get = (who, path, headers = {}) => send(who ? withMember(new Request(team + path, { headers }), who) : new Request((path.startsWith("/chest") ? team : visitor) + path, { headers }));
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(`${who ? team + "/chest" : visitor}/actions/${name}`, { method: "POST", body: JSON.stringify(proven(input)), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return send(who ? withMember(request, who) : request);
};
// A form posted without JavaScript.
const form = (who, path, fields, from, headers = {}) => {
  const base = who ? team : visitor;
  const request = new Request(base + path, { method: "POST", body: new URLSearchParams(proven(fields)), headers: { "sec-fetch-site": "same-origin", referer: base + from, host: new URL(base).host, ...headers } });
  return send(who ? withMember(request, who) : request);
};
// The single-use token a public page carries, shown long enough ago that
// a person could have written the form.
// apply asks a proof of work (bound.work: 14 bits): call() and form() find
// it as the browser does.
const token = (action, age = 10_000) => formToken(action, Date.now() - age, action === "apply" ? 14 : 0);
const proven = input => (input.chest_form && input.chest_form.includes(".apply.") && input.chest_work === undefined ? { ...input, chest_work: solveWork(input.chest_form) } : input);
const browser = response => /chest_v=[\w-]+/u.exec(response.headers.get("set-cookie") ?? "")?.[0];

test("the careers page: indexed, in the visitor's language, the company's look as a stylesheet, the open jobs", async () => {
  const response = await get(null, "/", { "accept-language": "fr-FR,fr;q=0.9" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<meta name="robots" content="index, follow"\/>/u);
  assert.match(html, /<link rel="stylesheet" href="\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /Senior furniture designer/u);
  assert.doesNotMatch(html, /Summer workshop intern/u, "a closed job is not listed");
  assert.equal(response.headers.get("x-robots-tag"), null);
  const look = await get(null, "/look.css");
  assert.match(await look.text(), /--accent:/u);
  assert.match(look.headers.get("etag") ?? "", /^"/u);
});

test("a job's page: its JSON-LD for Google for Jobs, data only, escaped; its canonical address on the company's domain", async () => {
  const html = await (await get(null, "/senior-furniture-designer")).text();
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/u.exec(html);
  assert.ok(ld, "the structured data is in the page");
  const posting = JSON.parse(ld[1]);
  assert.equal(posting["@type"], "JobPosting");
  assert.equal(posting.url ?? `${posting.hiringOrganization ? "" : ""}https://careers.atelier-martin.fr/senior-furniture-designer`, "https://careers.atelier-martin.fr/senior-furniture-designer");
  assert.doesNotMatch(ld[1], /<\//u, "nothing can close the script");
  assert.match(html, /<link rel="canonical" href="https:\/\/careers\.atelier-martin\.fr\/senior-furniture-designer"\/>/u);
  assert.equal((await get(null, "/summer-workshop-intern")).status, 200, "a closed job's page says it is closed");
  assert.doesNotMatch(await (await get(null, "/summer-workshop-intern")).text(), /application\/ld\+json/u);
  const missing = await get(null, "/no-such-job");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /The job may have been filled/u);
});

test("the feeds and robots name the company's own domain; the team's part and the links are never indexed", async () => {
  assert.match(await (await get(null, "/robots.txt")).text(), /Sitemap: https:\/\/careers\.atelier-martin\.fr\/sitemap\.xml/u);
  assert.match(await (await get(null, "/sitemap.xml")).text(), /<loc>https:\/\/careers\.atelier-martin\.fr\/senior-furniture-designer<\/loc>/u);
  assert.match(await (await get(null, "/jobs.xml")).text(), /Senior furniture designer/u);
  assert.match(await (await get(null, "/feed.xml")).text(), /<rss/u);
  const page = await get(camille, "/chest");
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("the application form: a robot's field, a single-use token, no index", async () => {
  const response = await get(null, "/senior-furniture-designer/apply");
  const html = await response.text();
  assert.match(html, /data-action="apply" name="chest_form" value="[\w.-]+"/u);
  assert.match(html, /name="website"/u);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/u);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

const applying = (extra = {}) => ({ slug: "senior-furniture-designer", name: "Zoé Martin", email: "zoe@example.com", phone: "", link: "", coverLetter: "Hello", lang: "fr", chest_form: token("apply"), ...extra });

test("applying: refused without a token, a CV or a link; then a thank-you page with nothing of the candidate", async () => {
  const expired = await call(null, "apply", applying({ chest_form: "x" }));
  assert.equal((await expired.json()).error, "expired");
  const missing = await call(null, "apply", applying());
  assert.equal((await missing.json()).error, "cv_missing");
  const done = await call(null, "apply", applying({ link: "zoe.design", chest_form: token("apply") }));
  const answer = await done.json();
  assert.equal(answer.ok, true);
  assert.match(answer.redirect, /^\/senior-furniture-designer\/thanks(\?mailed=1)?$/u);
  const [row] = await database.sql`select name, language, link, source from candidates where email = 'zoe@example.com'`;
  assert.deepEqual({ ...row }, { name: "Zoé Martin", language: "fr", link: "https://zoe.design/", source: "careers" });
  assert.match(await (await get(null, answer.redirect)).text(), /Thank you!/u);
  // A robot that fills the field people never see: "done", nothing written.
  const robot = await call(null, "apply", applying({ email: "robot@example.com", link: "x.example", website: "spam", chest_form: token("apply") }));
  assert.equal((await robot.json()).ok, true);
  assert.equal((await database.sql`select 1 from candidates where email = 'robot@example.com'`).length, 0);
});

test("a stranger's applications never flood an inbox: three confirmations an hour to one address; the applications are still filed", async () => {
  const before = chest.outbox.filter(m => m.to.includes("target@example.com")).length;
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push(await (await call(null, "apply", applying({ email: "target@example.com", link: `t${i}.example`, chest_form: token("apply") }))).json());
  assert.ok(answers.every(a => a.ok));
  assert.equal((await database.sql`select count(*)::int as n from candidates where email = 'target@example.com'`)[0].n, 5, "every application filed");
  assert.equal(chest.outbox.filter(m => m.to.includes("target@example.com")).length - before, 3, "three emails at most this hour");
  assert.deepEqual(answers.map(a => a.redirect.endsWith("?mailed=1")), [true, true, true, false, false], "past them, no email is promised");
});

test("a visitor's CV: a path on the page's own host, a claim, checked and kept with the application", async () => {
  const grant = await call(null, "publicCvUpload", { slug: "senior-furniture-designer", type: "application/pdf", size: 15, chest_form: token("publicCvUpload") });
  const { value } = await grant.json();
  assert.match(value.url, /^\/_chest\/upload\/[^/]+$/u, "a path: the company's own domain works too");
  const put = await chest.upload(value.url, "%PDF-1.4\n%%EOF\n", "application/pdf");
  const { claim } = await put.json();
  const done = await (await call(null, "apply", applying({ email: "cv@example.com", cv: claim, cvName: "My CV.pdf", chest_form: token("apply") }))).json();
  assert.equal(done.ok, true);
  const [row] = await database.sql`select cv_object, cv_name from candidates where email = 'cv@example.com'`;
  assert.match(row.cv_object, /^cv\/[0-9a-f]{20}\.pdf$/u);
  assert.equal(row.cv_name, "My CV.pdf");
  // The claim served once.
  const again = await (await call(null, "apply", applying({ email: "cv2@example.com", cv: claim, chest_form: token("apply") }))).json();
  assert.equal(again.error, "cv_missing");
  // A closed job takes no CV.
  const closed = await call(null, "publicCvUpload", { slug: "summer-workshop-intern", type: "application/pdf", size: 15, chest_form: token("publicCvUpload") });
  assert.equal((await closed.json()).error, "closed");
});

test("applications are bounded per browser when the Chest names no visitor: a cookie, never one shared bucket", async () => {
  const first = await call(null, "apply", applying({ email: "b0@example.com", link: "b.example", chest_form: token("apply") }));
  const cookie = browser(first);
  assert.ok(cookie, "the browser gets its own key");
  let refused = null;
  for (let i = 1; i < 25 && !refused; i++) {
    const r = await call(null, "apply", applying({ email: `b${i}@example.com`, link: "b.example", chest_form: token("apply") }), { cookie });
    if (r.status === 429) refused = r;
  }
  assert.ok(refused, "past twenty a day, limit");
  assert.equal((await refused.json()).error, "limit");
  // Another browser still applies.
  assert.equal((await (await call(null, "apply", applying({ email: "other@example.com", link: "b.example", chest_form: token("apply") }))).json()).ok, true);
});

test("a flood of applications without cookies closes that job's form for the day, never the others'; the page says so plainly", async () => {
  const today = async slug => (await database.sql`select count(*)::int as n from candidates c join jobs j on j.id = c.job_id where j.slug = ${slug} and c.source = 'careers' and c.created_at::date = current_date`)[0].n;
  let refused = null, sent = 0;
  for (let i = 0; i < 80 && !refused; i++) {
    // A robot that never keeps a cookie: a new visitor each time.
    const r = await call(null, "apply", applying({ email: `flood${i}@example.com`, link: "flood.example", chest_form: token("apply") }));
    if (r.status === 429) refused = r; else sent++;
  }
  assert.ok(refused, "the job's day is bounded");
  assert.equal((await refused.json()).error, "limit");
  assert.ok(sent > 0 && (await today("senior-furniture-designer")) <= 60 + 5, "at most sixty a day for one job (and the seed's)");
  // Another job of the company still takes applications.
  const other = await (await call(null, "apply", applying({ slug: "office-manager", email: "real@example.com", link: "real.example", chest_form: token("apply") }))).json();
  assert.equal(other.ok, true, JSON.stringify(other));
  // And a CV can still be sent for it.
  assert.equal((await (await call(null, "publicCvUpload", { slug: "office-manager", type: "application/pdf", size: 15, chest_form: token("publicCvUpload") })).json()).ok, true);
  // The form says it in plain words, with the company's website.
  const page = await (await get(null, "/senior-furniture-designer/apply")).text();
  assert.match(page, /This job has received all the applications it can take today\. Try again tomorrow, or contact the company: https:\/\/atelier-martin\.example\//u);
});

test("guessed interview links never close a real one: a secret that names nothing spends its own budget, no refusal", async () => {
  for (let i = 0; i < 40; i++) {
    const r = await (await call(null, "chooseTime", { token: String(i).padStart(43, "x"), slot: "2026-01-01 10:00", chest_form: token("chooseTime") })).json();
    if (i < 30) assert.deepEqual([r.ok, r.value], [true, { gone: true }]);
  }
  const refused = async () => (await database.sql`select coalesce(sum(count), 0)::int as n from chest_bounds where scope = 'chooseTime:refused' and day = current_date`)[0].n;
  const before = await refused();
  for (let i = 0; i < 5; i++) await call(null, "chooseTime", { token: "y".repeat(43), slot: "2026-01-01 10:00", chest_form: token("chooseTime") });
  assert.equal(await refused(), before, "a guessed secret is no refusal: the package's ceiling is never spent on it");
  const sent = await (await call(sofia, "sendInterviewLink", { id: "8", link: { people: [hugo.id], minutes: 30, firstDay: day(2), lastDay: day(12), dayStart: 540, dayEnd: 1080, place: "", note: "", skipLunch: false } })).json();
  const path = new URL(sent.value.link).pathname;
  const slot = /name="slot" value="([^"]+)"/u.exec(await (await get(null, path)).text())?.[1];
  assert.equal((await (await call(null, "chooseTime", { token: path.split("/").pop(), slot, chest_form: token("chooseTime") })).json()).ok, true, "the real link still books");
});

test("the team's pages: the member's language, the policy, the look; no role, no tool; an interviewer sees only their jobs", async () => {
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /Senior furniture designer/u);
  assert.match(await (await get(nora, "/chest")).text(), /You can’t use this tool yet/u);
  assert.equal((await get(null, "/chest")).status, 401);
  assert.equal((await get(ines, "/chest/jobs/1")).status, 200);
  assert.equal((await get(lea, "/chest/jobs/1")).status, 404, "a job they are not on does not exist for them");
  assert.equal((await get(ines, "/chest/settings")).status, 404);
  assert.equal((await get(ines, "/chest/jobs/1/edit")).status, 404);
  for (const path of ["/chest/search?q=lu", "/chest/pool", "/chest/reports", "/chest/reports?job=1", "/chest/settings", "/chest/jobs/new", "/chest/jobs/new?template=sales", "/chest/jobs/1/edit", "/chest/jobs/1/settings", "/chest/jobs/1/add", "/chest/jobs/1/import", "/chest/candidates/1", "/chest/candidates/7"]) {
    assert.equal((await get(sofia, path)).status, 200, path);
  }
  assert.equal((await get(ines, "/chest/candidates/7")).status, 200);
});

test("a board shows each stage's first cards and how many there are: two thousand candidates, a bounded page", async () => {
  await database.sql`insert into candidates (job_id, stage_id, name, email, source, language) select 1, 1, 'Many ' || g, 'many' || g || '@example.com', 'careers', 'en' from generate_series(1, 2000) g`;
  const response = await get(sofia, "/chest/jobs/1");
  const html = await response.text();
  assert.ok(html.length < 400_000, `the page stays small (${html.length} bytes)`);
  assert.match(html, /Show [12],\d{3} more/u);
  const props = /data-island="BoardView"[^>]*data-props="([^"]*)"/u.exec(html);
  assert.ok(props && props[1].length < 256 * 1024, "the board's props are bounded");
  const more = await (await get(sofia, "/chest/jobs/1?more=1")).text();
  assert.match(more, /Show 1,[5-7]\d\d more/u);
  assert.equal((await get(sofia, "/chest/jobs/1?rejected=1")).status, 200);
  await database.sql`delete from candidates where email like 'many%@example.com'`;
});

test("a refresh that has the page's version gets a 304: nothing rendered", async () => {
  const first = await get(sofia, "/chest/jobs/2");
  const version = /<meta name="chest-version" content="([^"]+)"\/>/u.exec(await first.text())?.[1];
  assert.ok(version);
  const again = await app.fetch(withMember(new Request(team + "/chest/jobs/2", { headers: { "x-tool-version": version } }), sofia));
  assert.equal(again.status, 304);
  await call(sofia, "moveCandidate", { id: "9", stage: "8" });
  const changed = await app.fetch(withMember(new Request(team + "/chest/jobs/2", { headers: { "x-tool-version": version } }), sofia));
  assert.equal(changed.status, 200, "a move changes the board's version");
});

test("moves and rejections: a recruiter's only, rights checked before anything is written; cross-site refused", async () => {
  const refused = await call(ines, "moveCandidate", { id: "1", stage: "4" });
  assert.equal(refused.status, 403);
  assert.equal((await call(sofia, "moveCandidate", { id: "1", stage: "4" }, { "sec-fetch-site": "cross-site" })).status, 403);
  const moved = await (await call(sofia, "moveCandidate", { id: "1", stage: "4" })).json();
  assert.deepEqual(moved, { ok: true, value: { from: "3", hired: false } });
  assert.equal((await call(sofia, "moveCandidate", { id: "1", stage: "17" })).status, 400, "a stage of another job");
  const rejected = await (await call(sofia, "rejectCandidate", { id: "4", reason: "skills", note: "", send: true, text: "Sorry, Jonas." })).json();
  assert.equal(rejected.value.delivery, "waiting");
  const back = await (await call(sofia, "undoReject", { ids: ["4"], since: rejected.value.at })).json();
  assert.deepEqual(back.value, { left: 0 });
  const [m] = await database.sql`select status from messages where candidate_id = 4 and kind = 'rejection' order by id desc limit 1`;
  assert.equal(m.status, "cancelled", "Undo keeps the email from leaving");
});

test("a CV is served to the job's people only; an email's files to recruiters only", async () => {
  chest.files.set("cv/0123456789abcdef0123.pdf", { data: new TextEncoder().encode("%PDF-1.4\n%%EOF\n"), type: "application/pdf", updated: new Date().toISOString() });
  await database.sql`update candidates set cv_object = 'cv/0123456789abcdef0123.pdf', cv_name = 'Lucie.pdf', cv_type = 'application/pdf', cv_size = 15 where id = 1`;
  const cv = await get(ines, "/chest/candidates/1/cv");
  assert.equal(cv.status, 200);
  assert.equal(cv.headers.get("content-security-policy"), "sandbox; default-src 'none'; frame-ancestors 'self'");
  assert.equal(await cv.text(), "%PDF-1.4\n%%EOF\n");
  assert.equal((await get(lea, "/chest/candidates/1/cv")).status, 404);
  const [m] = await database.sql`insert into messages (candidate_id, direction, kind, subject, body, status, attachments) values (1, 'out', 'message', 'CV', 'here', 'sent', ${database.sql.json([{ file: "cv/0123456789abcdef0123.pdf", name: "x.pdf", type: "application/pdf", size: 15 }])}) returning id`;
  assert.equal((await get(ines, `/chest/messages/${m.id}/files/0`)).status, 403);
  assert.equal((await get(sofia, `/chest/messages/${m.id}/files/0`)).status, 200);
  const page = await (await get(sofia, "/chest/candidates/1")).text();
  assert.match(page, /href="\/chest\/candidates\/1\/cv\?download" download=""/u, "a download link carries download: fetched once");
});

test("exports: a job's CSV with formulas defused, a candidate's own data, everything — recruiters only", async () => {
  await database.sql`update candidates set name = '=HYPERLINK("x")' where id = 2`;
  const csv = await get(sofia, "/chest/jobs/1/export");
  assert.match(csv.headers.get("content-disposition"), /^attachment;/u);
  assert.match(await csv.text(), /"'=HYPERLINK\(""x""\)"/u);
  assert.equal((await get(ines, "/chest/jobs/1/export")).status, 403);
  const data = await get(sofia, "/chest/candidates/1/data");
  assert.equal(data.headers.get("content-type"), "application/zip");
  assert.equal((await get(ines, "/chest/candidates/1/data")).status, 403);
  const all = await get(sofia, "/chest/export");
  assert.equal(all.headers.get("content-type"), "application/zip");
  assert.ok((await all.arrayBuffer()).byteLength > 1000);
});

test("a candidate chooses their interview time from their link: no index, no cache, no referrer elsewhere; one booking", async () => {
  const sent = await (await call(sofia, "sendInterviewLink", { id: "7", link: { people: [hugo.id], minutes: 60, firstDay: day(2), lastDay: day(12), dayStart: 540, dayEnd: 1080, place: "Workshop", note: "", skipLunch: true } })).json();
  assert.equal(sent.ok, true);
  const path = new URL(sent.value.link).pathname;
  const page = await get(null, path + "?lang=fr");
  assert.equal(page.headers.get("referrer-policy"), "same-origin", "the secret never leaves for another site");
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await page.text();
  assert.match(html, /<html lang="fr">/u, "the language they applied in");
  const slot = /name="slot" value="([^"]+)"/u.exec(html)?.[1];
  assert.ok(slot, "free times are offered");
  const tokenOf = path.split("/").pop();
  const done = await (await call(null, "chooseTime", { token: tokenOf, slot, chest_form: token("chooseTime") })).json();
  assert.equal(done.ok, true);
  const again = await (await call(null, "chooseTime", { token: tokenOf, slot, chest_form: token("chooseTime") })).json();
  assert.equal(again.error, "gone");
  assert.deepEqual((await (await call(null, "chooseTime", { token: "x".repeat(43), slot, chest_form: token("chooseTime") })).json()).value, { gone: true });
});

test("a booked candidate may choose another time, or call the interview off, until it starts; the team hears it", async () => {
  const sent = await (await call(sofia, "sendInterviewLink", { id: "3", link: { people: [hugo.id], minutes: 60, firstDay: day(2), lastDay: day(12), dayStart: 540, dayEnd: 1080, place: "", note: "", skipLunch: true } })).json();
  const path = new URL(sent.value.link).pathname;
  const secret = path.split("/").pop();
  const slotOf = async () => /name="slot" value="([^"]+)"/u.exec(await (await get(null, path)).text())?.[1];
  const first = await slotOf();
  assert.equal((await (await call(null, "chooseTime", { token: secret, slot: first, chest_form: token("chooseTime") })).json()).ok, true);
  const booked = await (await get(null, path)).text();
  assert.match(booked, /Your interview is booked/u);
  assert.match(booked, /action="\/actions\/releaseTime"/u, "a plain form: no JavaScript needed");
  assert.match(booked, new RegExp(`href="${path}\\?off=1"`, "u"));
  // Another time: the interview is called off, the link opens again.
  const another = await form(null, "/actions/releaseTime", { token: secret, what: "another", chest_form: token("releaseTime") }, path);
  assert.equal(another.status, 303);
  assert.equal(another.headers.get("location"), path, "back to the link's page");
  const [first_] = await database.sql`select cancelled_at is not null as gone from interviews where candidate_id = 3 order by id desc limit 1`;
  assert.equal(first_.gone, true);
  assert.ok(chest.notifications.some(n => n.member === hugo.id && /gave back their interview time/u.test(n.title)), "Hugo hears it");
  const second = await slotOf();
  assert.ok(second, "times offered again");
  assert.equal((await (await call(null, "chooseTime", { token: secret, slot: second, chest_form: token("chooseTime") })).json()).ok, true);
  // Called off: asked once more, then done.
  assert.match(await (await get(null, path + "?off=1")).text(), /Call off your interview of/u);
  assert.equal((await form(null, "/actions/releaseTime", { token: secret, what: "off", chest_form: token("releaseTime") }, path + "?off=1")).status, 303);
  assert.match(await (await get(null, path)).text(), /Your interview is called off/u);
  assert.ok(chest.notifications.some(n => n.member === hugo.id && /called off their interview/u.test(n.title)));
  const kinds = (await database.sql`select kind from activity where candidate_id = 3 and kind like 'interview_%' order by id`).map(r => r.kind);
  assert.deepEqual(kinds.slice(-4), ["interview_chosen", "interview_rechosen", "interview_chosen", "interview_declined"]);
  // Nothing more to give back.
  assert.equal((await (await call(null, "releaseTime", { token: secret, what: "off", chest_form: token("releaseTime") })).json()).error, "gone");
});

test("a public form sent without JavaScript and refused: the refusal is said on the careers page", async () => {
  const refused = await form(null, "/actions/apply", { ...applying({ email: "nojs@example.com", slug: "office-manager" }), chest_form: token("apply") }, "/office-manager/apply");
  assert.equal(refused.status, 303);
  const back = refused.headers.get("location");
  assert.match(back, /^\/office-manager\/apply\?error=cv_missing/u);
  assert.match(await (await get(null, back)).text(), /class="notice notice-top" role="alert">Add your CV, or a link to it\./u);
});

test("the language switch, and back to a page of the careers site only", async () => {
  const lang = await get(null, "/lang/fr?back=/senior-furniture-designer");
  assert.match(lang.headers.get("set-cookie"), /^lang=fr;/u);
  assert.equal(lang.headers.get("location"), "/senior-furniture-designer");
  assert.equal((await get(null, "/lang/fr?back=//evil.example")).headers.get("location"), "/");
});

test("the Chest's deliveries: schedules, events — each at least once", async () => {
  const to = request => app.fetch(request);
  for (const name of ["cleanup", "outbox", "morning"]) assert.equal(await chest.run(name, to), 204, name);
  assert.equal(await chest.run("nothing", to), 404);
  const erased = { type: "member.erased", id: "evt_" + "c".repeat(26), data: { id: lea.id, erasure: "era_" + "b".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(erased, to), 204);
  assert.equal(await chest.emit(erased, to), 204);
  assert.deepEqual(chest.acknowledged, [erased.data.erasure]);
  assert.equal((await database.sql`select 1 from job_interviewers where member_id = ${lea.id}`).length, 0);
});

test("a form without JavaScript: posted, then back to its page; a refusal said there", async () => {
  const posted = await form(sofia, "/chest/actions/addNote", { id: "1", body: "Called her back." }, "/chest/candidates/1");
  assert.equal(posted.status, 303);
  assert.equal(posted.headers.get("location"), "/chest/candidates/1");
  const empty = await form(sofia, "/chest/actions/addNote", { id: "1", body: "" }, "/chest/candidates/1");
  assert.equal(empty.headers.get("location"), "/chest/candidates/1?error=empty");
  assert.match(await (await get(sofia, "/chest/candidates/1?error=empty")).text(), /role="alert">Please fill this in\./u);
});

// A day from today, "YYYY-MM-DD", in the Chest's zone (Paris).
function day(n) {
  const at = new Date(Date.now() + n * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(at);
}
