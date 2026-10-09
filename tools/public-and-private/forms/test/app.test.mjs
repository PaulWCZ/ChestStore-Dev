import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { formToken, solveWork } from "@argentic/chest-app";
import { atLeast, checkPage, settled, testDatabase } from "@argentic/chest-app/testing";
import { camille, everyone, hugo, ines, lea, nora, tom } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, visitors on the public
// host, a real PostgreSQL (TEST_DATABASE_URL, or PGlite) with the sample
// forms of seed/sample.sql. The rules are tested on their own in the other
// files; here, what the server adds: routes, policy, look, pages and their
// islands, actions from an island and from a plain form, the public part
// and its bounds, downloads, the Chest's signed deliveries. Every page is
// checked for what the policy would block (checkPage).
atLeast(16);
let chest, database, app;
const log = console.log;
before(async () => {
  chest = await fakeChest({
    tool: "forms",
    network: {},
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail"],
    storage: { publicUploads: true, publicFiles: true },
    mail: { domain: "atelier.test" },
    emits: ["forms.answered", "forms.contact", "forms.request"],
    chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en" },
  });
  database = await testDatabase({ migrations: join(import.meta.dirname, "..", "migrations") });
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
  console.log = () => {};
});
after(async () => {
  console.log = log;
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://forms-chest.chest.test";
const visitor = "https://forms.chest.test";
const send = async request => {
  const response = await app.fetch(request);
  // The work an answer left to do (after()) done before the next request.
  await settled();
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
};
const get = (who, path, headers = {}) => send(who ? withMember(new Request(team + path, { headers }), who) : new Request((path.startsWith("/chest") ? team : visitor) + path, { headers }));
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const proven = input.chest_form && input.chest_form.includes(".answerPublic.") && input.chest_work === undefined ? { ...input, chest_work: solveWork(input.chest_form) } : input;
  const request = new Request(`${who ? team + "/chest" : visitor}/actions/${name}`, { method: "POST", body: JSON.stringify(proven), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return send(who ? withMember(request, who) : request);
};
// A form posted without JavaScript.
const form = (who, path, fields, from) => {
  const request = new Request(team + path, { method: "POST", body: new URLSearchParams(fields), headers: { "sec-fetch-site": "same-origin", referer: team + from, host: new URL(team).host } });
  return send(withMember(request, who));
};
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// A public page's single-use token, shown long enough ago that a person
// could have written the form.
// answerPublic asks a proof of work (bound.work: 14 bits): call() finds it
// as the browser does.
const token = (action, age = 10_000) => formToken(action, Date.now() - age, action === "answerPublic" ? 14 : 0);
const islandProps = (html, name) => {
  const m = new RegExp(`data-island="${name}"[^>]*data-props="([^"]*)"`, "u").exec(html);
  return m ? JSON.parse(m[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">")) : null;
};

test("home: the member's language, the policy, the look as a stylesheet, their forms; a member without a role sees why", async () => {
  const response = await get(ines, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"/u);
  assert.match(html, /<link rel="icon" href="\/assets\/icon\.svg"/u);
  assert.match(html, /Comment s’est passée votre expérience/u, "a bilingual form in the reader's language");
  assert.match(html, /data-look="own"/u);
  assert.match(html, /data-island="Search"/u);
  assert.equal((await get(null, "/chest")).status, 401);
  const sheet = await (await get(ines, "/chest/look.css")).text();
  assert.match(sheet, /--accent:\s*#b0124f/u, "Forms' own identity: Invitation");
  const none = await (await get(nora, "/chest")).text();
  assert.match(none, /ck-no-access/u);
  assert.doesNotMatch(none, /How did we do/u);
});

test("a page left open: read again with nothing new, it is a 304", async () => {
  const first = await get(ines, "/chest");
  const version = /<meta name="chest-version" content="([^"]+)"/u.exec(await first.text())?.[1];
  assert.ok(version);
  assert.equal((await get(ines, "/chest", { "x-tool-version": version })).status, 304);
  // A new answer to one of her forms: the page again.
  await database.sql`update forms set answer_count = answer_count + 1 where id = 1`;
  assert.equal((await get(ines, "/chest", { "x-tool-version": version })).status, 200);
});

test("a form's tabs: the builder and its preview, share, settings, answers, summary; a viewer reads, a stranger finds nothing", async () => {
  for (const tab of ["", "/share", "/settings", "/answers", "/summary"]) {
    const response = await get(ines, `/chest/forms/1${tab}`);
    assert.equal(response.status, 200, tab);
    const html = await response.text();
    assert.match(html, /data-island="FormTitle"/u, tab);
    assert.match(html, /aria-current="page"/u, tab);
  }
  const builder = await (await get(ines, "/chest/forms/1")).text();
  const props = islandProps(builder, "Builder");
  assert.equal(props.canEdit, true);
  assert.equal(props.link, "https://forms.chest.test/k7m2fq9d");
  // Hugo may read the answers of form 1, not change it.
  assert.equal(islandProps(await (await get(hugo, "/chest/forms/1")).text(), "Builder").canEdit, false);
  assert.equal((await get(hugo, "/chest/forms/1/settings")).status, 403);
  assert.equal((await get(tom, "/chest/forms/1")).status, 404);
  assert.equal((await get(ines, "/chest/forms/9999")).status, 404);
});

test("the summary is drawn without a style attribute: bars are SVG, a matrix's cells a class of their share", async () => {
  const html = await (await get(ines, "/chest/forms/1/summary")).text();
  assert.match(html, /<svg class="bar-track"[^>]*><rect class="bar-fill"[^>]*width="[\d.]+%"/u);
  assert.match(html, /class="nps-split"/u);
  assert.doesNotMatch(html, /\sstyle="/u);
});

test("the builder saves from its island, a stale revision is a conflict, a cross-site save is refused", async () => {
  const builder = islandProps(await (await get(ines, "/chest/forms/5")).text(), "Builder");
  const draft = { ...builder.draft, title: "Renamed by the test" };
  const saved = await call(ines, "saveDraft", { id: "5", text: JSON.stringify(draft), revision: builder.revision });
  assert.equal(saved.status, 200);
  const { value } = await saved.json();
  assert.equal(value.revision, builder.revision + 1);
  const stale = await call(ines, "saveDraft", { id: "5", text: JSON.stringify(draft), revision: builder.revision });
  assert.equal((await stale.json()).error, "conflict");
  assert.equal((await call(ines, "saveDraft", { id: "5", text: JSON.stringify(draft), revision: value.revision }, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await call(hugo, "saveDraft", { id: "5", text: JSON.stringify(draft), revision: value.revision })).status, 404);
  assert.equal((await database.sql`select draft->>'title' as title from forms where id = 5`)[0].title, "Renamed by the test");
});

test("a public form: the visitor's page in the form's language, the runner, a form token, the brand's frame", async () => {
  const response = await get(null, "/k7m2fq9d", { "accept-language": "fr-FR,fr;q=0.9" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /data-action="answerPublic" name="chest_form" value="[\w.-]+"/u);
  assert.match(html, /<link rel="stylesheet" href="\/look\.css\?v=/u);
  assert.match(html, /Atelier Martin/u);
  const props = islandProps(html, "Runner");
  assert.equal(props.mode, "public");
  assert.match(props.definition.title, /^Comment s’est passée votre expérience/u);
  assert.equal((await get(null, "/zzzzzzzz")).status, 404);
  assert.equal((await get(null, "/c2n6yd8u")).status, 404, "a draft is nothing");
  assert.match(await (await get(null, "/s8f4ku7m")).text(), /no longer|n’accepte plus|plus de réponses/u, "a closed form says so");
  assert.equal((await get(null, "/t9r3hw6b")).status, 404, "a team form is not public");
});

test("answering a public form: the token required, the answers checked first, a robot answered done and nothing kept", async () => {
  const { sql } = database;
  const count = async () => (await sql`select count(*)::int as n from answers where form_id = 1`)[0].n;
  const before = await count();
  const input = { slug: "k7m2fq9d", version: 1, answers: { q1xxxxxx: 4, q2xxxxxx: 9 } };
  assert.equal((await (await call(null, "answerPublic", input)).json()).error, "expired");
  const wrong = await call(null, "answerPublic", { ...input, answers: { q1xxxxxx: 9 }, chest_form: token("answerPublic") });
  assert.equal((await wrong.json()).error, "answers");
  const sent = await call(null, "answerPublic", { ...input, chest_form: token("answerPublic") });
  assert.equal(sent.status, 200);
  const body = await sent.json();
  assert.deepEqual(body.value, { copy: false });
  assert.ok(body.form, "the next token comes with the answer");
  assert.equal(await count(), before + 1);
  const robot = await call(null, "answerPublic", { ...input, website: "http://spam.example", chest_form: token("answerPublic") });
  assert.equal((await robot.json()).ok, true);
  assert.equal(await count(), before + 1, "nothing kept");
  // A token serves once.
  const once = token("answerPublic");
  await call(null, "answerPublic", { ...input, chest_form: once });
  assert.equal((await (await call(null, "answerPublic", { ...input, chest_form: once })).json()).error, "expired");
  // A closed form, a team form: refused.
  assert.equal((await (await call(null, "answerPublic", { slug: "s8f4ku7m", version: 1, answers: {}, chest_form: token("answerPublic") })).json()).error, "closed");
  assert.equal((await (await call(null, "answerPublic", { slug: "t9r3hw6b", version: 1, answers: {}, chest_form: token("answerPublic") })).json()).error, "not_found");
});

test("a public form whose answers go further (a copy by email, a web address) spends its own, tighter budget a day; past it, refused, and the plain budget is untouched", async () => {
  const { sql } = database;
  await sql`update forms set send_copy = true where id = 1`;
  const hooks = (await sql`select id from form_hooks where form_id = 1 and disabled_at is null`).map(r => r.id);
  // The package's counter of this form in the "reaching" budget, one short of the day's.
  const subject = "s:" + createHash("sha256").update("1").digest("base64url").slice(0, 22);
  await sql`insert into chest_bounds (scope, visitor, day, count) values ('answerPublic:reaching', ${subject}, current_date, 199)
    on conflict (scope, visitor, day) do update set count = 199`;
  const input = { slug: "k7m2fq9d", version: 1, answers: { q1xxxxxx: 4, q2xxxxxx: 9 } };
  const last = await (await call(null, "answerPublic", { ...input, chest_form: token("answerPublic") })).json();
  assert.equal(last.ok, true, JSON.stringify(last));
  assert.equal((await (await call(null, "answerPublic", { ...input, chest_form: token("answerPublic") })).json()).error, "limit", "the 201st: refused");
  // Copies off, its web address stopped: the form spends the plain budget again.
  await sql`update forms set send_copy = false where id = 1`;
  await sql`update form_hooks set disabled_at = now() where id = any(${hooks})`;
  const plain = await (await call(null, "answerPublic", { ...input, chest_form: token("answerPublic") })).json();
  assert.equal(plain.ok, true, JSON.stringify(plain));
  await sql`update form_hooks set disabled_at = null where id = any(${hooks})`;
});

test("a visitor's file: an upload path on the host they are on, for a file question of an open public form", async () => {
  const builder = islandProps(await (await get(ines, "/chest/forms/5")).text(), "Builder");
  const draft = structuredClone(builder.draft);
  draft.pages[0].questions.push({ id: "qfilexxx", kind: "file", title: "Your CV", help: "", required: false, accept: "documents" });
  await call(ines, "saveDraft", { id: "5", text: JSON.stringify(draft), revision: builder.revision });
  const published = await call(ines, "publishForm", { id: "5" });
  assert.equal(published.status, 200, await published.clone().text());
  const grant = await call(null, "visitorUpload", { slug: "c2n6yd8u", question: "qfilexxx", type: "application/pdf", size: 1000, chest_form: token("visitorUpload") });
  const { value } = await grant.json();
  assert.match(value.url, /^\/_chest\/upload\//u, "a path: the visitor's own host");
  const refused = await call(null, "visitorUpload", { slug: "c2n6yd8u", question: "qfilexxx", type: "image/svg+xml", size: 10, chest_form: token("visitorUpload") });
  assert.equal((await refused.json()).error, "file_invalid");
});

test("the answers: the table's island, a filter in the address, an answer's page and its follow-up; downloads stream", async () => {
  const page = await (await get(ines, "/chest/forms/1/answers?status=new")).text();
  const table = islandProps(page, "AnswersTable");
  assert.ok(table.rows.length > 0 && table.rows.length <= 50);
  assert.ok(islandProps(page, "AnswersFilters"));
  const one = await get(ines, `/chest/forms/1/answers/${table.rows[0].id}?status=new`);
  assert.equal(one.status, 200);
  assert.match(await one.text(), /data-island="FollowUp"/u);
  const followed = await call(ines, "followAnswer", { id: "1", answer: table.rows[0].id, status: "doing", note: "Called back" });
  assert.equal(followed.status, 200);
  const csv = await get(ines, "/chest/forms/1/export");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /attachment; filename="How-did-we-do.csv"/u);
  const text = await csv.text();
  assert.ok(text.split("\r\n").length > 20);
  assert.match(text, /En cours;Called back/u, "French: the separator and the follow-up");
  const zip = await get(ines, "/chest/forms/1/archive");
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.ok((await zip.arrayBuffer()).byteLength > 1000);
  assert.equal((await get(tom, "/chest/forms/1/export")).status, 404);
});

test("an anonymous form: no table, no row, its texts shuffled; its CSV the summary", async () => {
  const page = await get(camille, "/chest/forms/4/answers");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.doesNotMatch(html, /data-island="AnswersTable"/u);
  assert.match(html, /class="summary-list"|Pas encore assez|Not enough answers/u);
  assert.equal((await get(camille, "/chest/forms/4/archive")).status, 400);
});

test("a team form, answered in the Chest: the respondent's frame without the tool's bar; answered once", async () => {
  const page = await get(hugo, "/chest/f/t9r3hw6b");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.doesNotMatch(html, /ck-shell/u);
  const props = islandProps(html, "Runner");
  assert.equal(props.mode, "team");
  const required = props.definition.pages.flatMap(p => p.questions).filter(q => q.required);
  const answers = Object.fromEntries(required.map(q => [q.id, q.kind === "short" || q.kind === "long" ? "Yes" : q.kind === "yesno" ? true : q.kind === "rating" ? 3 : q.kind === "scale" ? 5 : q.options ? { ids: [q.options[0].id] } : "x"]));
  const sent = await call(hugo, "answerTeam", { slug: "t9r3hw6b", version: props.version, answers });
  assert.equal(sent.status, 200, await sent.clone().text());
  assert.equal((await get(nora, "/chest/f/t9r3hw6b")).status, 200, "no role: the layout says why");
  assert.equal((await get(hugo, "/chest/f/k7m2fq9d")).status, 404, "a public form is not a team form");
});

test("plain forms work without JavaScript: a deleted form brought back from the trash opens", async () => {
  await call(ines, "deleteForm", { id: "6" });
  const trash = await (await get(ines, "/chest/trash")).text();
  assert.match(trash, /action="\/chest\/actions\/restoreForm"/u);
  const back = await form(ines, "/chest/actions/restoreForm", { id: "6", open: "1" }, "/chest/trash");
  assert.equal(back.status, 303);
  assert.equal(back.headers.get("location"), "/chest/forms/6");
});

test("the websites a manager allows may frame the public forms; the team's pages never", async () => {
  assert.equal((await call(camille, "saveEmbedSites", { sites: "https://www.atelier-martin.fr" })).status, 200);
  assert.match((await get(null, "/k7m2fq9d")).headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/www\.atelier-martin\.fr/u);
  assert.match((await get(ines, "/chest")).headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  assert.equal((await call(ines, "saveEmbedSites", { sites: "" })).status, 403);
  await call(camille, "saveEmbedSites", { sites: "" });
});

test("the Chest's schedules: the bell tells what waited, the night's cleanup runs; an unknown run is 404", async () => {
  await database.sql`update forms set bell_pending = true, bell_at = now() - interval '1 hour' where id = 1`;
  const at = new Date();
  assert.equal(await chest.run("bell", request => app.fetch(request), { scheduledAt: at.toISOString() }), 204);
  assert.ok(chest.notifications.some(n => n.key === "answers:1"));
  assert.equal(await chest.run("cleanup", request => app.fetch(request)), 204);
  assert.equal(await chest.run("nothing", request => app.fetch(request)), 404);
});

test("a member erased: their answers to team forms go, then the Chest is told", async () => {
  const status = await chest.emit({ type: "member.erased", data: { id: lea.id, erasure: "era_" + "l".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } }, request => app.fetch(request));
  assert.equal(status, 204);
  assert.equal((await database.sql`select count(*)::int as n from answers where respondent = ${lea.id}`)[0].n, 0);
});

test("the public host's root says forms are opened by their link; its language switch goes back where it was", async () => {
  const html = await (await get(null, "/", { "accept-language": "en" })).text();
  assert.match(html, /Open a form with the link you were given/u);
  const switched = await get(null, "/lang/fr?back=/k7m2fq9d");
  assert.equal(switched.headers.get("location"), "/k7m2fq9d");
});

test("the request log names routes, never the forms' addresses", async () => {
  const lines = [];
  console.log = (...line) => { lines.push(line.join(" ")); };
  await get(null, "/k7m2fq9d");
  console.log = () => {};
  assert.ok(lines.some(l => l.includes("/:slug")), lines.join("\n"));
  assert.ok(!lines.some(l => l.includes("k7m2fq9d")));
});
