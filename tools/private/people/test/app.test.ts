import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { camille, everyone, hugo, ines, lea, nora, paul, tom } from "./support/members.ts";

atLeast(16);

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL
// (TEST_DATABASE_URL, or PGlite). The services have their own tests
// (test/*.test.ts); these check what the server adds: routes, pages,
// islands, actions, the look, the policy, downloads, the Chest's own
// deliveries. Every page fetched is checked for what the policy would
// block (checkPage).
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "people", members: everyone, capabilities: ["database", "files", "members", "members.email", "notifications"] });
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await chest.close();
  await database.close();
});

const url = (path: string) => `https://people-chest.chest.test${path}`;
async function get(who: FakeMember | null, path: string, headers: Record<string, string> = {}) {
  const response = await app.fetch(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
}
const page = async (who: FakeMember, path: string) => {
  const response = await get(who, path);
  return { status: response.status, html: await response.text() };
};
// An action as call() sends it from an island.
async function call(who: FakeMember, name: string, input: unknown, headers: Record<string, string> = {}) {
  const response = await app.fetch(withMember(new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// Work done after an answer (after(): the bell, the badges) has had its turn.
const settle = () => new Promise(resolve => setTimeout(resolve, 150));

test("a member's page: their language, the policy, no inline script or style, the look as a stylesheet", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Toute l’équipe · Équipe<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look.css\?v=[\w-]+"\/>/u);
  assert.match(html, /<link rel="icon" href="\/assets\/icon.svg"/u);
  assert.match(html, /<meta name="theme-color"/u);
  assert.doesNotMatch(html, /\sstyle="/u);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u);
  assert.doesNotMatch(html, /<style/u);
  // Each island is its own root, with its own prefix for the ids it makes.
  const prefixes = [...html.matchAll(/data-prefix="([^"]+)"/gu)].map(m => m[1]);
  assert.ok(prefixes.length >= 3);
  assert.equal(new Set(prefixes).size, prefixes.length);
  // The sections: HR sees the five; a member three.
  assert.match(html, /href="\/chest\/records"/u);
  const member = await page(hugo, "/chest");
  assert.match(member.html, /<html lang="en">/u);
  assert.doesNotMatch(member.html, /href="\/chest\/records"/u);
  assert.doesNotMatch(member.html, /href="\/chest\/checklists"/u);
});

test("the look: the company's choice as a stylesheet, its address the hash of its text; files under /assets/", async () => {
  const linkOf = async () => /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(await (await get(hugo, "/chest")).text())![1]!;
  const own = await linkOf();
  const sheet = await get(hugo, own);
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") ?? "", /^text\/css/u);
  assert.match(sheet.headers.get("cache-control") ?? "", /immutable/u);
  const css = await sheet.text();
  assert.match(css, /--accent:/u);
  assert.match(css, /\/assets\/fonts\/outfit-latin-wght-normal\.woff2/u);
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  const chosen = await linkOf();
  assert.notEqual(chosen, own);
  assert.doesNotMatch(await (await get(hugo, chosen)).text(), /outfit/u);
  chest.theme.all = { mode: "own" };
  assert.equal((await get(null, "/look.css")).status, 200);
  assert.equal((await get(null, "/assets/icon.svg")).status, 200);
  assert.equal((await get(null, "/assets/fonts/outfit-latin-wght-normal.woff2")).status, 200);
});

test("a member without a role sees why, and reads nothing", async () => {
  const { status, html } = await page(paul, "/chest");
  assert.equal(status, 200);
  assert.match(html, /You can’t use People yet/u);
  assert.doesNotMatch(html, /data-island="DirectoryView"/u);
  const refused = await call(paul, "saveProfile", { id: paul.id, own: { phone: "", pronouns: "", bio: "Hello", skills: [], birthday: null } });
  assert.equal(refused.ok, false);
});

test("a profile is saved from its form, then shown; the newcomer's 'fill in your profile' ticks itself", async () => {
  const saved = await call(hugo, "saveProfile", { id: hugo.id, own: { phone: "+33 6 12 34 56 78", pronouns: "he/him", bio: "Sales, the north.", skills: ["CRM", "Invoices"], birthday: { month: 3, day: 14 } } });
  assert.deepEqual([saved.status, saved.ok], [200, true]);
  const { html } = await page(hugo, `/chest/people/${hugo.id}`);
  assert.match(html, /Sales, the north\./u);
  assert.match(html, /href="tel:\+33612345678"/u);
  assert.match(html, /14 March/u);
  // Someone else's own part: refused, with the reader's words.
  const other = await call(hugo, "saveProfile", { id: ines.id, own: { phone: "", pronouns: "", bio: "x", skills: [], birthday: null } });
  assert.deepEqual([other.status, other.error, other.message], [403, "forbidden", "Your role does not allow this."]);
  // The edit page: one's own, or HR's; nobody else's.
  assert.equal((await page(hugo, `/chest/people/${hugo.id}/edit`)).status, 200);
  assert.equal((await page(hugo, `/chest/people/${ines.id}/edit`)).status, 404);
  assert.equal((await page(camille, `/chest/people/${ines.id}/edit`)).status, 200);
  assert.equal((await page(hugo, "/chest/people/nobody")).status, 404);
});

test("HR's job fields: a loop of managers is refused in plain words; the chart draws the tree", async () => {
  assert.equal((await call(camille, "saveProfile", { id: hugo.id, job: { title: "Sales lead", team: "Sales", office: "Lyon", managerId: lea.id, startDate: "2021-09-15" } })).ok, true);
  assert.equal((await call(camille, "saveCell", { member: lea.id, key: "team", value: "Sales" })).ok, true);
  const loop = await call(camille, "saveCell", { member: lea.id, key: "managerId", value: hugo.id });
  assert.equal(loop.error, "cycle");
  assert.match(loop.message ?? "", /boucle/u);
  // A member may not write job fields.
  assert.equal((await call(hugo, "saveCell", { member: hugo.id, key: "title", value: "Boss" })).error, "forbidden");
  const chart = await page(hugo, "/chest/chart");
  assert.equal(chart.status, 200);
  assert.match(chart.html, /data-island="OrgChart"/u);
  assert.match(chart.html, /Hugo Bernard/u);
  const table = await page(camille, "/chest/table");
  assert.match(table.html, /data-island="TableEditor"/u);
  assert.equal((await page(hugo, "/chest/table")).status, 404);
});

test("a checklist: templates from the examples, started for someone, ticked from My to-dos", async () => {
  const examples = await call(camille, "addExampleTemplates", {});
  assert.equal(examples.ok, true);
  assert.equal(examples.value.length, 2);
  const list = await page(camille, "/chest/checklists");
  assert.equal(list.status, 200);
  assert.match(list.html, /data-island="ArrivalForm"/u);
  const started = await call(camille, "startChecklist", { personId: nora.id, templateId: examples.value[0], anchor: "2026-10-12" });
  assert.equal(started.ok, true, started.message);
  await settle();
  const journey = await page(camille, `/chest/checklists/${started.value.id}`);
  assert.equal(journey.status, 200);
  assert.match(journey.html, /data-island="JourneyView"/u);
  assert.match(journey.html, /class="pct-0"/u);
  // Nora's own steps on her to-dos, in her language.
  const todo = await page(nora, "/chest/todo");
  assert.match(todo.html, /<html lang="fr">/u);
  const steps = [...todo.html.matchAll(/&quot;id&quot;:&quot;(\d+)&quot;,&quot;text&quot;/gu)].map(m => m[1]!);
  assert.ok(steps.length > 0, "Nora has steps");
  assert.equal((await call(nora, "tickItem", { id: steps[0], done: true })).ok, true);
  // Someone else's step: not hers to tick.
  assert.equal((await call(hugo, "tickItem", { id: steps[0], done: false })).ok, false);
  // A checklist one does not take part in does not exist.
  assert.equal((await page(hugo, `/chest/checklists/${started.value.id}`)).status, 404);
  assert.equal((await page(nora, "/chest/checklists")).status, 404);
  // The "My to-dos" tab carries the number of open steps.
  assert.match((await page(nora, "/chest")).html, /href="\/chest\/todo"[^>]*>[\s\S]*?ck-count/u);
});

test("an HR record: created, saved field by field, read by its person, a 404 for anyone else", async () => {
  const made = await call(camille, "createRecord", { memberId: tom.id });
  assert.equal(made.ok, true);
  const id = made.value.id as string;
  const saved = await call(camille, "saveRecord", { id, input: { legalName: "Walker Tom", nationality: "British", startDate: "2024-02-01", contract: "fixed_term" } });
  assert.deepEqual(saved.value.changed.sort(), ["contract", "legalName", "nationality", "startDate"]);
  const hr = await page(camille, `/chest/records/${id}`);
  assert.equal(hr.status, 200);
  assert.match(hr.html, /data-island="RecordForm"/u);
  const own = await page(tom, `/chest/records/${id}`);
  assert.equal(own.status, 200);
  assert.match(own.html, /Walker Tom/u);
  assert.doesNotMatch(own.html, /data-island="RecordForm"/u);
  assert.match(own.html, /data-island="AskChange"/u);
  assert.equal((await page(hugo, `/chest/records/${id}`)).status, 404);
  assert.equal((await page(hugo, "/chest/records")).status, 404);
  // A document: an upload address of the Chest's; a link only for HR and the person.
  const grant = await call(camille, "documentUpload", { id, type: "application/pdf", size: 1000 });
  assert.equal(grant.ok, true);
  const tooBig = await call(camille, "documentUpload", { id, type: "application/pdf", size: 30 << 20 });
  assert.deepEqual([tooBig.error, tooBig.message], ["file_too_large", "Ce fichier est trop lourd : 20 Mo au plus."]);
  assert.equal((await get(hugo, `/chest/records/${id}/documents/1`)).status, 404);
  // The pages around records.
  for (const path of ["/chest/records", "/chest/records/register", "/chest/numbers", "/chest/records/letters", "/chest/records/import", "/chest/import"]) {
    assert.equal((await page(camille, path)).status, 200, path);
  }
});

test("letters: the examples, then one printed from a record as paper", async () => {
  const added = await call(camille, "addLetterExamples", {});
  assert.equal(added.ok, true);
  const [first] = await database.sql<{ id: string }[]>`select id::text from records order by id limit 1`;
  const record = first!.id;
  const letter = await page(camille, `/chest/records/${record}/letters/${added.value[0]}`);
  assert.equal(letter.status, 200);
  assert.match(letter.html, /class="letter-sheet"/u);
  assert.match(letter.html, /data-island="PrintButton"/u);
  assert.equal((await page(hugo, `/chest/records/${record}/letters/${added.value[0]}`)).status, 404);
});

test("the numbers draw their bars with classes, never a style", async () => {
  const { html } = await page(camille, "/chest/numbers");
  assert.match(html, /class="pct-\d+"/u);
  assert.match(html, /data-island="MonthsTable"/u);
});

test("downloads: the directory and the register as CSV for HR, nothing for anyone else", async () => {
  const csv = await get(camille, "/chest/export");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.headers.get("content-disposition") ?? "", /^attachment; filename="[\w-]+-\d{4}-\d{2}-\d{2}\.csv"$/u);
  const text = await csv.text();
  assert.match(text, /Hugo Bernard/u);
  assert.match(text, /\+33 6 12 34 56 78/u, "a phone written as it is");
  assert.equal((await get(hugo, "/chest/export")).status, 404);
  const register = await get(camille, "/chest/records/register/csv");
  assert.equal(register.status, 200);
  assert.match(await register.text(), /Walker Tom/u);
  assert.equal((await get(hugo, "/chest/records/register/csv")).status, 404);
});

test("an import: the file read on the server, the days of the preview written in the reader's words", async () => {
  const file = "Name,Job title,Start date\nInès Moreau,Accountant,2023-03-01\n";
  const plan = await call(hugo, "previewImport", { text: file });
  assert.equal(plan.error, "forbidden");
  const preview = await call(camille, "previewImport", { text: file });
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.value.rows[0].memberId, ines.id);
  assert.equal(preview.value.days["2023-03-01"], "1er mars 2023");
  const applied = await call(camille, "applyImport", { text: file });
  assert.equal(applied.value.updated, 1);
});

test("refusals: a code and the reader's words; cross-site requests refused", async () => {
  assert.equal((await call(hugo, "noSuchAction", {})).status, 404);
  const cross = await app.fetch(withMember(new Request(url("/chest/actions/tickItem"), { method: "POST", body: JSON.stringify({ id: "1", done: true }), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "cross-site" } }), hugo));
  assert.equal(cross.status, 403);
  const noHeader = await app.fetch(withMember(new Request(url("/chest/actions/tickItem"), { method: "POST", body: JSON.stringify({ id: "1", done: true }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), hugo));
  assert.equal(noHeader.status, 403, "JSON without the island's header");
  const missing = await call(hugo, "tickItem", { id: "999999", done: true });
  assert.deepEqual([missing.status, missing.error, missing.message], [404, "not_found", "This no longer exists."]);
});

test("errors: the reader's page, the right status; a page that refuses is a 404, never a 500", async () => {
  const nothing = await page(camille, "/chest/nothing");
  assert.equal(nothing.status, 404);
  assert.match(nothing.html, /Rien ici/u);
  assert.equal((await page(camille, "/chest/checklists/abc")).status, 404);
  assert.equal((await page(camille, "/chest/records/999999")).status, 404);
  assert.equal((await page(camille, "/chest/checklists/templates/999999")).status, 404);
  assert.equal((await get(null, "/assets/nothing.js")).status, 404);
});

test("no public part: the root says where People lives, in the visitor's language", async () => {
  const home = await get(null, "/", { "accept-language": "fr-CH, en;q=0.5" });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Cet outil se trouve dans votre Chest/u);
  const lang = await get(null, "/lang/en?back=/");
  assert.match(lang.headers.get("set-cookie") ?? "", /^lang=en;/u);
  assert.equal(lang.headers.get("location"), "/");
  assert.equal((await get(null, "/lang/fr?back=//evil.example")).headers.get("location"), "/");
});

test("the Chest's events: a member who leaves keeps their place above their reports; told twice, done once", async () => {
  const to = (request: Request) => app.fetch(request);
  const removed = { type: "member.removed" as const, id: "evt_" + "r".repeat(26), data: { id: lea.id } };
  assert.equal(await chest.emit(removed, to), 204);
  assert.equal(await chest.emit(removed, to), 204);
  const [row] = await database.sql<{ left: boolean }[]>`select manager_left as left from profiles where member_id = ${hugo.id}`;
  assert.equal(row?.left, true);
  // A change of name: nothing to do (names are read when a page renders).
  assert.equal(await chest.emit({ type: "member.updated" as const, id: "evt_" + "u".repeat(26), data: { id: hugo.id, changed: ["name"] } }, to), 204);
});

test("the morning schedule runs on POST /chest-schedules, at least once, and nothing else is a schedule", async () => {
  const to = (request: Request) => app.fetch(request);
  assert.equal(await chest.run("morning", to, { id: "run_" + "m".repeat(26) }), 204);
  assert.equal(await chest.run("morning", to, { id: "run_" + "m".repeat(26) }), 204, "again: seen, nothing done twice");
  assert.equal(await chest.run("nothing", to), 404);
  // Unsigned: refused.
  assert.equal((await app.fetch(new Request(url("/chest-schedules"), { method: "POST", body: "{}" }))).status, 401);
});
