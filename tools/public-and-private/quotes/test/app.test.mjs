import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { formToken } from "@argentic/chest-app";
import { atLeast, checkPage, settled, testDatabase } from "@argentic/chest-app/testing";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest on the team host, visitors
// on the public host, a real PostgreSQL (TEST_DATABASE_URL, else PGlite)
// with the sample company of seed/sample.sql. The rules are tested on their
// own in the other files; here, what the server adds: routes, policy,
// look, actions (from an island, from a form), the public page and its
// bounded answer, files, the Chest's signed calls. Every page fetched is
// checked for what the policy would block (checkPage).
atLeast(11);
let chest, database, app;
before(async () => {
  chest = await fakeChest({ tool: "quotes", network: {}, members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier-martin.test" }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "fr" } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  ({ app } = await import("../dist/test/app.js"));
});
after(async () => {
  await settled();
  await database.close();
  await chest.close();
  forgetTheme();
});

const team = "https://quotes-chest.chest.test";
const publicHost = "https://quotes.chest.test";
const secret = "SampleAnswerLinkQuoteD0006Roux01";
const get = async (who, path, headers = {}) => {
  const response = await app.fetch(who ? withMember(new Request(team + path, { headers }), who) : new Request(publicHost + path, { headers }));
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
};
// An action as call() sends it from an island of the page.
const call = (who, name, input, headers = {}) => {
  const request = new Request(`${who ? team + "/chest" : publicHost}/actions/${name}`, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } });
  return app.fetch(who ? withMember(request, who) : request);
};
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const idOf = async (where) => String((await database.sql.unsafe(`select id from documents where ${where} order by id limit 1`))[0].id);

test("the desk: the member's language, the strict policy, the look as a stylesheet, nothing inline; 401 without the Chest", async () => {
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /Bureau/u);
  assert.match(html, /data-island="MoreMenu"/u);
  assert.equal((await app.fetch(new Request(team + "/chest"))).status, 401);
});

test("the look: Letterpress by default, its fonts under /assets/; the client's page wears the company's brand or Quotes' own", async () => {
  const html = await (await get(sofia, "/chest")).text();
  const v = /look\.css\?v=([\w-]{16})/u.exec(html)[1];
  const sheet = await get(sofia, `/chest/look.css?v=${v}`);
  assert.equal(sheet.status, 200);
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#8a1f30/u);
  assert.match(css, /url\(\/assets\/fonts\/libre-caslon-text-latin-400-normal\.woff2\)/u);
  assert.equal((await app.fetch(new Request(team + "/assets/fonts/libre-caslon-text-latin-400-normal.woff2"))).status, 200);
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  const page = await (await get(null, `/q/${secret}`)).text();
  assert.match(page, new RegExp(`href="/look\\.css\\?v=${v}"`, "u"), "the public page keeps Quotes' own look");
  chest.theme.all = null;
  forgetTheme();
});

test("every page of the team's part renders, for each role; one without a role is told why", async () => {
  const doc = await idOf("type = 'invoice' and status = 'final'");
  const draft = await idOf("type = 'quote' and status = 'draft'");
  const [{ id: clientId }] = await database.sql`select id::text from clients order by id limit 1`;
  for (const who of [camille, sofia, ines, lea]) {
    for (const path of ["/chest", "/chest/quotes", "/chest/quotes?state=sent&q=a", "/chest/invoices", "/chest/invoices?state=overdue", `/chest/documents/${doc}`, `/chest/documents/${draft}`, "/chest/clients", `/chest/clients/${clientId}`, "/chest/clients?archived=1", "/chest/catalogue", "/chest/export", "/chest/import?kind=items", "/chest/bank", "/chest/settings"]) {
      const response = await get(who, path);
      assert.equal(response.status, 200, `${who.firstName} ${path}`);
    }
  }
  const invoices = await (await get(sofia, "/chest/invoices")).text();
  assert.match(invoices, /data-island="DocTable"/u);
  assert.match(invoices, /Invoices<\/span><span class="ck-count">1</u, "the overdue count on the Invoices tab");
  const paper = await (await get(hugo, `/chest/documents/${draft}`)).text();
  assert.match(paper, /id="island-doc-/u, "the document's island, under its own id");
  assert.match(await (await get(nora, "/chest")).text(), /can’t use this tool yet|ne pouvez pas encore/u);
  assert.equal((await get(camille, "/chest/documents/999999")).status, 404);
  assert.equal((await get(camille, "/chest/documents/abc")).status, 404);
  assert.match(await (await get(camille, "/chest/nothing")).text(), /Rien ici/u);
});

test("actions from an island: a quote made, written, refused in the reader's words; a members' action is not a public one", async () => {
  const made = await call(hugo, "createDocument", { type: "quote" });
  assert.equal(made.status, 200);
  const { value } = await made.json();
  assert.match(value.id, /^\d+$/u);
  const saved = await (await call(hugo, "saveDraft", { id: value.id, draft: { title: "Site", lines: [{ kind: "line", description: "Design", quantity: 2500, unitPrice: 65000, discount: 0, vatRate: 2000 }] } })).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.value.gross, 195000, "2.5 × 650.00 = 1,625.00 + 20 % = 1,950.00");
  const refused = await call(ines, "saveDraft", { id: value.id, draft: { lines: [{ kind: "line", description: "x", quantity: -1 }] } });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /quantité/u, "in French, for Inès");
  assert.equal((await call(lea, "createDocument", { type: "quote" })).status, 403, "a viewer writes nothing");
  assert.equal((await call(hugo, "finalise", { id: value.id })).status, 403, "sales never finalise");
  assert.equal((await call(hugo, "noSuchAction", {})).status, 404);
  assert.equal((await call(null, "createDocument", { type: "quote" })).status, 404, "not on the public host");
  assert.equal((await call(hugo, "createDocument", { type: "quote" }, { "sec-fetch-site": "cross-site" })).status, 403);
});

test("finalising: the next number, the PDF of record kept after the answer, billing's badge", async () => {
  const draft = await idOf("type = 'invoice' and status = 'draft'");
  const done = await (await call(sofia, "finalise", { id: draft })).json();
  assert.equal(done.ok, true);
  assert.match(done.value.number, /^F-\d{4}-\d{4}$/u);
  await settled();
  const [row] = await database.sql`select pdf_object, pdf_format from documents where id = ${draft}`;
  assert.ok(row.pdf_object, "kept in the Chest's files");
  assert.equal(row.pdf_format, "factur-x");
});

test("the team's files: a PDF inline or saved, the accountant's export, an unknown list is a page in the reader's words", async () => {
  const doc = await idOf("type = 'invoice' and status = 'final'");
  const inline = await get(sofia, `/chest/documents/${doc}/pdf`);
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get("content-type"), "application/pdf");
  assert.match(inline.headers.get("content-disposition"), /^inline; filename=".*F-\d{4}-\d{4}\.pdf"/u);
  assert.equal(Buffer.from(await inline.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  assert.match((await get(sofia, `/chest/documents/${doc}/pdf?download`)).headers.get("content-disposition"), /^attachment;/u);
  const year = new Date().getFullYear();
  const csv = await get(lea, `/chest/export/csv?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /^attachment; filename=".+\.csv"/u);
  assert.match(await csv.text(), /F-\d{4}-\d{4}/u);
  const zip = await get(lea, `/chest/export/zip?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0, 2).toString(), "PK");
  const refused = await get(hugo, `/chest/export/csv?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(refused.status, 403, "sales do not export");
  assert.match(await refused.text(), /Not allowed/u);
  assert.equal((await get(lea, "/chest/export/lists/nothing")).status, 404);
  assert.equal((await get(lea, `/chest/export/csv?from=nope&to=${year}-12-31`)).status, 400);
});

test("the public part: the root says where to go; a quote's page in the visitor's language, with its form token; a wrong link shows nothing", async () => {
  const home = await get(null, "/", { "accept-language": "fr-FR" });
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("content-security-policy"), policy);
  assert.match(await home.text(), /Ouvrez le lien de votre e-mail/u);
  const page = await get(null, `/q/${secret}`, { "accept-language": "en-GB" });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /data-island="AnswerForm"/u);
  assert.match(html, /<meta name="chest-form" content="[^"]+"/u);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\/><meta name="description"/u);
  assert.match(html, /<meta name="referrer" content="same-origin"/u);
  assert.match(html, /Atelier Martin/u, "the company, never the Chest");
  assert.doesNotMatch(html, /Camille|Inès|Sofia/u, "no member's name on a public page");
  const wrong = await get(null, "/q/NotTheSecretNotTheSecretNotTheX", { "accept-language": "en" });
  assert.match(await wrong.text(), /This link does not work/u);
  assert.equal((await get(null, "/chest")).status, 401, "the team's part is the team's");
});

test("the quote's PDF for the link's holder: bounded, kept by its fingerprint, the same bytes the page names", async () => {
  const pdf = await get(null, `/q/${secret}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("cache-control"), "private, no-store");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const [link] = await database.sql`select pdf_sha256 from quote_links where secret = ${secret}`;
  const { createHash } = await import("node:crypto");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), link.pdf_sha256);
  assert.equal((await get(null, `/q/${secret}/terms`)).status, 404, "no terms: nothing");
  assert.equal((await get(null, "/q/NotTheSecretNotTheSecretNotTheX/pdf")).status, 404);
});

test("the client answers: refused without a fresh form token, refused when the quote changed, accepted with Bon pour accord", async () => {
  const html = await (await get(null, `/q/${secret}`)).text();
  const shown = /&quot;shown&quot;:&quot;([0-9a-f]{64})&quot;/u.exec(html)[1];
  const answer = (input, token = formToken(Date.now() - 10_000)) => call(null, "answerQuote", { secret, answer: "accepted", name: "Jeanne Roux", agree: true, reason: "", shown, terms: "", chest_form: token, ...input });
  assert.equal((await (await answer({}, "nope")).json()).error, "expired");
  assert.equal((await (await answer({ shown: "0".repeat(64) })).json()).error, "changed");
  assert.equal((await (await answer({ agree: false })).json()).error, "must_agree");
  const done = await answer({});
  assert.equal(done.status, 200);
  const outcome = await done.json();
  assert.equal(outcome.ok, true);
  assert.equal(outcome.redirect, `/q/${secret}?answered=1`);
  const [quote] = await database.sql`select d.status, a.name, a.pdf_sha256 from documents d join quote_answers a on a.document_id = d.id join quote_links l on l.document_id = d.id where l.secret = ${secret}`;
  assert.deepEqual({ ...quote }, { status: "accepted", name: "Jeanne Roux", pdf_sha256: shown });
  assert.equal((await (await answer({})).json()).error, "answered");
  await settled();
  assert.ok(chest.notifications.some(n => /Jeanne Roux/u.test(n.title)), "the author hears it in the bell");
});

test("a plain form without JavaScript: the answer's page, or back with the refusal", async () => {
  const request = new Request(publicHost + "/actions/answerQuote", { method: "POST", body: new URLSearchParams({ secret, answer: "accepted", name: "J", agree: "on", shown: "0".repeat(64), terms: "", chest_form: formToken(Date.now() - 10_000) }), headers: { "sec-fetch-site": "same-origin", referer: `${publicHost}/q/${secret}`, host: "quotes.chest.test" } });
  const back = await app.fetch(request);
  assert.equal(back.status, 303);
  assert.match(back.headers.get("location"), new RegExp(`^/q/${secret}\\?error=`, "u"));
});

test("the Chest's events and schedules, signed, each delivered at least once", async () => {
  const to = request => app.fetch(request);
  const erased = { type: "member.erased", id: "evt_" + "q".repeat(26), data: { id: hugo.id, erasure: "era_" + "q".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(erased, to), 204);
  assert.equal(await chest.emit(erased, to), 204);
  assert.deepEqual(chest.acknowledged, [erased.data.erasure]);
  const [{ n }] = await database.sql`select count(*)::int as n from documents where created_by = ${hugo.id}`;
  assert.equal(n, 0);
  assert.equal(await chest.run("badges", to), 204);
  assert.equal(await chest.run("followup", to), 204);
  assert.equal(await chest.run("archive", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  assert.equal((await app.fetch(new Request(team + "/chest-schedules", { method: "POST", body: "{}" }))).status, 401, "unsigned");
});
