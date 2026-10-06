import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage, settled } from "@argentic/chest-app/testing";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";

atLeast(11);

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL (PGlite,
// or TEST_DATABASE_URL), the sample client book loaded. The services have
// their own tests; these check what the server adds: routes, pages,
// islands, actions at their boundary, downloads, the look, the policy, the
// Chest's own deliveries — and that a big book still renders in time.
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  chest = await fakeChest({ network: {}, tool: "crm", members: everyone, capabilities: ["database", "files", "members", "notifications"], chest: { publicUrl: null } });
  database = await testDatabase();
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await database.close();
  await chest.close();
});

const url = (path: string) => `https://crm-chest.chest.test${path}`;
const get = async (who: FakeMember | null, path: string, headers: Record<string, string> = {}) => {
  const response = await app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
};
// An action as call() sends it from an island.
async function call(who: FakeMember, name: string, input: unknown) {
  const response = await app.fetch(withMember(new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const idOf = async (table: string, column: string, value: string) => String((await database.sql.unsafe(`select id from ${table} where ${column} = $1`, [value]))[0]!["id"]);

test("a member's page: their language, the policy, no inline script or style, the look as a stylesheet", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Ma journée/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look.css\?v=[\w-]+"\/>/u);
  assert.match(html, /<link rel="icon" href="\/assets\/icon.svg"/u);
  assert.doesNotMatch(html, /\sstyle="/u);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u);
  assert.doesNotMatch(html, /<style/u);
  // Each island is its own root, with its own prefix for the ids it makes.
  const prefixes = [...html.matchAll(/data-prefix="([^"]+)"/gu)].map(m => m[1]);
  assert.ok(prefixes.length >= 3);
  assert.equal(new Set(prefixes).size, prefixes.length);
  // The look: the identity's fonts under /assets/ (a private tool's files
  // load nowhere else on a Chest).
  const look = await get(camille, "/chest/look.css");
  assert.equal(look.status, 200);
  assert.match(await look.text(), /url\(\/assets\/fonts\/ibm-plex-sans-latin-wght-normal\.woff2\)/u);
});

test("every page answers, for each role; a member without a role is told why", async () => {
  const deal = await idOf("deals", "title", "Head office fit-out, 40 desks");
  const company = await idOf("companies", "name", "Boulangeries Durand");
  const person = await idOf("contacts", "name", "Claire Durand");
  const pages = ["/chest", "/chest/deals", "/chest/deals?view=list", "/chest/deals?view=list&status=any&owner=me", `/chest/deals/${deal}`, "/chest/companies", "/chest/companies?sort=recent", `/chest/companies/${company}`, "/chest/contacts", "/chest/contacts?stale=1", `/chest/contacts/${person}`, "/chest/team", "/chest/team?week=2", "/chest/search?q=durand", "/chest/search", "/chest/import", "/chest/settings", "/chest/settings/fields", "/chest/settings/forms"];
  for (const who of [camille, hugo, lea]) {
    for (const path of pages) assert.equal((await get(who, path)).status, 200, `${who.firstName} ${path}`);
  }
  const html = await (await get(hugo, `/chest/deals/${deal}`)).text();
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /Head office fit-out, 40 desks/u);
  // Its islands carry the deal in their ids: another deal opened in place
  // starts them afresh.
  assert.match(html, new RegExp(`id="island-steps-deal-${deal}"`, "u"));
  // A viewer's home is the team's pipeline.
  assert.match(await (await get(lea, "/chest")).text(), /Toutes les affaires en cours, étape par étape/u);
  const none = await (await get(nora, "/chest")).text();
  assert.match(none, /You can’t use Clients yet/u);
  assert.doesNotMatch(none, /data-island="HeaderTools"/u);
  assert.equal((await get(camille, "/chest/deals/999999")).status, 404);
  assert.equal((await get(camille, "/chest/deals/abc")).status, 404);
});

test("the board: a column per stage with its count and total, each deal's card written by the server", async () => {
  const html = await (await get(hugo, "/chest/deals")).text();
  const props = JSON.parse(decode(/data-island="DealBoard"[^>]*data-props="([^"]*)"/u.exec(html)![1]!)) as { stages: { name: string; total: string }[]; deals: { title: string; valueText: string; state: string }[] };
  assert.deepEqual(props.stages.map(s => s.name), ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
  assert.ok(props.deals.some(d => d.title === "Head office fit-out, 40 desks" && d.valueText === "€48,500"));
  assert.ok(props.stages.every(s => s.total.startsWith("€")));
  // Only the words the board needs travel with it.
  assert.ok(!("importer" in (JSON.parse(decode(/data-island="DealBoard"[^>]*data-props="([^"]*)"/u.exec(html)![1]!)).t as object)));
});

test("a deal: its amount as people write it, an ambiguous one asked again, a move into Won tells the bell nothing it should not", async () => {
  const created = await call(hugo, "addDeal", { title: "Printers for the annex", value: "12 500,50", owner: hugo.id });
  assert.equal(created.ok, true);
  const [row] = await database.sql`select value_cents, currency from deals where id = ${created.value.id}`;
  assert.deepEqual([Number(row!["value_cents"]), row!["currency"]], [1250050, "EUR"]);
  const ambiguous = await call(hugo, "addDeal", { title: "Ambiguous", value: "1,250" });
  assert.deepEqual([ambiguous.status, ambiguous.error, ambiguous.message], [400, "amount_ambiguous", "Is it thousands or cents? Write 1250 or 1.25."]);
  const french = await call(camille, "addDeal", { title: "Ambigu", value: "1.234" });
  assert.equal(french.message, "Des milliers ou des centimes\u202f? Écrivez 1250 ou 1,25.");
  assert.equal((await call(hugo, "addDeal", { title: "Negative", value: "-5" })).error, "invalid");
  assert.equal((await call(hugo, "addDeal", { title: "", value: "5" })).error, "empty");
  // A viewer changes nothing; the refusal is in their words.
  const viewer = await call(lea, "addDeal", { title: "Not mine", value: "5" });
  assert.deepEqual([viewer.status, viewer.error, viewer.message], [403, "forbidden", "Votre rôle ne le permet pas."]);
  const won = await idOf("stages", "kind", "won");
  const moved = await call(hugo, "moveDeal", { id: created.value.id, stage: won, reason: "Best price" });
  assert.equal(moved.ok, true);
  const [after] = await database.sql`select reason, closed_at from deals where id = ${created.value.id}`;
  assert.equal(after!["reason"], "Best price");
  assert.ok(after!["closed_at"] instanceof Date);
  // Clearing a detail: "" is sent, and kept (never read as "unchanged").
  const company = await call(hugo, "addCompany", { name: "Clearable SARL", website: "clearable.fr" });
  assert.equal((await call(hugo, "updateCompany", { id: company.value.id, website: "" })).ok, true);
  assert.equal((await database.sql`select website from companies where id = ${company.value.id}`)[0]!["website"], "");
});

test("two deals dropped into one stage at once each get a place of their own", async () => {
  const qualified = await idOf("stages", "key", "qualified");
  const a = (await call(camille, "addDeal", { title: "Race A" })).value.id as string;
  const b = (await call(camille, "addDeal", { title: "Race B" })).value.id as string;
  const [first] = await database.sql`select id from deals where stage_id = ${qualified} order by position limit 1`;
  // Both after the same neighbour, sent together (another member, another tab).
  const answers = await Promise.all([a, b].map(id => call(camille, "moveDeal", { id, stage: qualified, after: String(first!["id"]) })));
  assert.ok(answers.every(r => r.ok));
  const rows = await database.sql`select position from deals where stage_id = ${qualified}`;
  assert.equal(new Set(rows.map(r => r["position"])).size, rows.length, "no two deals share a position");
});

test("lists as files: written as they are read, formulas defused, the reader's words; the whole book for a manager", async () => {
  await call(hugo, "addCompany", { name: "=HYPERLINK(\"http://x\")", website: "" });
  const csv = await get(lea, "/chest/export/companies?q=HYPERLINK");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.headers.get("content-disposition") ?? "", /^attachment; filename="companies-\d{4}-\d{2}-\d{2}\.csv"/u);
  assert.equal(csv.headers.get("cache-control"), "no-store");
  const raw = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf], "a byte-order mark: Excel reads it as UTF-8");
  const text = new TextDecoder().decode(raw);
  assert.match(text, /^Nom,Site web,/u, "the French reader's headers");
  assert.match(text, /Montant en cours \(EUR\)/u, "the company's currency");
  assert.match(text, /"'=HYPERLINK\(""http:\/\/x""\)"/u);
  const deals = await (await get(hugo, "/chest/export/deals?status=any")).text();
  assert.ok(deals.split("\r\n").length > 15);
  const vcf = await get(hugo, "/chest/export/vcf");
  assert.equal(vcf.headers.get("content-type"), "text/vcard; charset=utf-8");
  assert.match(await vcf.text(), /BEGIN:VCARD\r\nVERSION:4.0/u);
  // The whole book: a manager only (a page in the reader's words otherwise).
  const refused = await get(hugo, "/chest/export/all");
  assert.equal(refused.status, 403);
  assert.match(refused.headers.get("content-type") ?? "", /^text\/html/u);
  const zip = await get(camille, "/chest/export/all");
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.equal(new DataView((await zip.arrayBuffer())).getUint32(0, true), 0x04034b50);
  assert.equal((await get(camille, "/chest/export/nothing")).status, 404);
  // One person: their vCard, and everything held about them (GDPR).
  const person = await idOf("contacts", "name", "Claire Durand");
  const card = await get(hugo, `/chest/contacts/${person}/vcard`);
  assert.match(card.headers.get("content-disposition") ?? "", /Claire-Durand\.vcf/u);
  const data = await get(hugo, `/chest/contacts/${person}/data`);
  assert.equal((await data.json() as { format: string }).format, "chest-clients-contact/1");
});

test("a file on a record: the Chest holds the bytes, the tool records them, a fresh link opens them", async () => {
  const deal = await idOf("deals", "title", "Head office fit-out, 40 desks");
  const grant = await call(ines, "uploadFile", { deal, size: 15 });
  assert.equal(grant.ok, true);
  const sent = await chest.upload(grant.value.url, "%PDF-1.4 signed", "application/pdf");
  const { name } = await sent.json() as { name: string };
  assert.equal((await call(ines, "attachFile", { deal, name: "deals/999/aaaaaaaaaaaaaaaaaaaa.pdf", fileName: "x.pdf" })).error, "file_missing");
  const saved = await call(ines, "attachFile", { deal, name, fileName: "Devis signé.pdf" });
  assert.equal(saved.ok, true);
  assert.equal((await call(lea, "uploadFile", { deal, size: 15 })).error, "forbidden");
  const open = await get(lea, `/chest/files/${saved.value.id}`);
  assert.equal(open.status, 303);
  assert.ok(open.headers.get("location"));
  assert.match(await (await get(lea, `/chest/deals/${deal}`)).text(), /Devis signé\.pdf/u);
});

test("the morning run and the deliveries of other tools come through the Chest's own routes", async () => {
  assert.equal(await chest.run("morning", request => app.fetch(request)), 204);
  // A form of Forms filled in, delivered twice (at least once): one contact.
  const data = { v: 1, form: { id: "5", title: "Contact us" }, answer: { id: "k3answerapp00001", at: new Date().toISOString(), language: "en", path: "/chest/forms/5/answers/k3answerapp00001" }, contact: { name: "Nina Roux", email: "nina@example.org", phone: null, company: "Roux Studio" }, message: "A quote for 4 desks?", member: null };
  const status = await chest.deliver({ type: "forms.contact", source: "forms", data }, request => app.fetch(request));
  assert.equal(status, 204);
  assert.equal(await chest.deliver({ type: "forms.contact", source: "forms", data }, request => app.fetch(request)), 204);
  await settled();
  assert.equal((await database.sql`select count(*)::int as n from contacts where email = 'nina@example.org'`)[0]!["n"], 1);
  assert.equal((await app.fetch(new Request(url("/chest-schedules"), { method: "POST", body: "{}" }))).status, 401);
});

test("an action a page answers: refused without the Chest's member, or from another site", async () => {
  const anonymous = await app.fetch(new Request(url("/chest/actions/addDeal"), { method: "POST", body: "{}", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }));
  assert.equal(anonymous.status, 401);
  const cross = await app.fetch(withMember(new Request(url("/chest/actions/addDeal"), { method: "POST", body: JSON.stringify({ title: "x" }), headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" } }), hugo));
  assert.equal(cross.status, 403);
  assert.equal((await database.sql`select count(*)::int as n from deals where title = 'x'`)[0]!["n"], 0);
});

test("a big client book still renders in time: 5,000 contacts, 500 deals", async () => {
  const lead = await idOf("stages", "key", "lead");
  await database.sql`insert into contacts (name, email, owner, created_by) select 'Scale person ' || g, 'p' || g || '@scale.test', ${hugo.id}, ${hugo.id} from generate_series(1, 5000) g`;
  await database.sql`insert into deals (title, value_cents, stage_id, position, owner, created_by) select 'Scale deal ' || g, g * 100, ${lead}, 'n' || lpad(g::text, 5, '0'), ${hugo.id}, ${hugo.id} from generate_series(1, 500) g`;
  for (const path of ["/chest/deals", "/chest/contacts", "/chest/contacts?page=40", "/chest/deals?view=list", "/chest", "/chest/team"]) {
    const started = performance.now();
    const response = await get(hugo, path);
    const html = await response.text();
    const took = performance.now() - started;
    assert.equal(response.status, 200, path);
    assert.ok(took < 8000, `${path}: ${Math.round(took)} ms`);
    // A list page shows one page (100 people), never the whole book.
    if (path.startsWith("/chest/contacts")) assert.ok((html.match(/id="contact-\d+"/gu) ?? []).length <= 100, path);
    assert.ok(html.length < 1_500_000, `${path}: ${html.length} bytes`);
  }
  const csv = await (await get(hugo, "/chest/export/contacts")).text();
  assert.ok(csv.split("\r\n").length > 5000);
});

test("the static files: under /assets/ only, cached", async () => {
  const icon = await get(null, "/assets/icon.svg");
  assert.equal(icon.status, 200);
  assert.equal((await get(null, "/assets/fonts/ibm-plex-sans-latin-wght-normal.woff2")).status, 200);
  assert.equal((await get(null, "/fonts/ibm-plex-sans-latin-wght-normal.woff2")).status, 404);
  assert.equal((await get(null, "/")).status, 200);
});

function decode(attribute: string): string {
  return attribute.replace(/&quot;/gu, "\"").replace(/&#x27;|&#39;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
}
