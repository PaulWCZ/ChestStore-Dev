import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday } from "./support/dates.ts";
import { camille, everyone, fakeGroups, hugo, ines, nora, sofia } from "./support/members.ts";

atLeast(12);

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL (PGlite,
// or TEST_DATABASE_URL) with the seven-person company of seed/sample.sql.
// The services are tested on their own in the other files; these check
// what the server adds: routes, pages, islands, actions, the look, the
// policy, the downloads, the Chest's own deliveries.
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  database = await testDatabase();
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  chest = await fakeChest({ network: {}, tool: "leave", members: everyone, groups: fakeGroups, chest: { publicUrl: null } });
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await chest.close();
  await database.close();
  forgetTheme();
});

const team = "https://leave-chest.chest.test";
const get = (who: FakeMember | null, path: string, headers: Record<string, string> = {}) =>
  app.fetch(who ? withMember(new Request(team + path, { headers }), who) : new Request(team + path, { headers }));
// An action as call() sends it from an island of the page.
async function call(who: FakeMember, name: string, input: unknown, headers: Record<string, string> = {}) {
  const response = await app.fetch(withMember(new Request(`${team}/chest/actions/${name}`, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string; redirect?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// The props an island of the page received (what the page read from the
// database, through the server: a test reading the database itself while
// the server's after() work runs would share PGlite's one session).
const props = (html: string, island: string): any => JSON.parse(new RegExp(`data-island="${island}"[^>]*? data-props="([^"]*)"`, "u").exec(html)![1]!.replaceAll("&quot;", "\"").replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));
const page = async (who: FakeMember, path: string) => {
  const response = await get(who, path);
  assert.equal(response.status, 200, path);
  return checkPage(await response.text());
};

test("the home: the member's language, the policy, the look as a stylesheet, nothing inline; 401 without the Chest", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = checkPage(await response.text());
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Mes congés · Congés<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.match(html, /<meta name="theme-color"/u);
  assert.match(html, /data-island="MyRequests"|Aucune demande/u);
  assert.match(html, /href="\/chest\/new"/u);
  // Camille is HR: "To answer" is a section, with its number.
  assert.match(html, /href="\/chest\/approvals"/u);
  const en = await page(hugo, "/chest");
  assert.match(en, /<html lang="en">/u);
  assert.doesNotMatch(en, /href="\/chest\/approvals"/u, "an employee answers nobody");
});

test("the look: the company's choice as a stylesheet, its address the hash of its text, 304 when the browser has it", async () => {
  const linkOf = async () => /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(await page(hugo, "/chest"))![1]!;
  const own = await linkOf();
  const sheet = await get(hugo, own);
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") ?? "", /^text\/css/u);
  assert.equal(sheet.headers.get("cache-control"), "private, max-age=31536000, immutable");
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#2366a8/u, "Seaside, Leave's own");
  assert.match(css, /url\(\/assets\/fonts\/nunito-latin-wght-normal\.woff2\)/u);
  assert.equal((await get(hugo, "/chest/look.css", { "if-none-match": sheet.headers.get("etag")! })).status, 304);
  assert.equal((await get(null, "/chest/look.css")).status, 401, "the team's look is the team's");
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  const chosen = await linkOf();
  assert.notEqual(chosen, own);
  assert.doesNotMatch(await (await get(hugo, chosen)).text(), /nunito/u);
  chest.theme.all = null;
  forgetTheme();
});

test("the browser's files are served to anyone under /assets/, cached; the icon too", async () => {
  const icon = await get(null, "/assets/icon.svg");
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("cache-control") ?? "", /public/u);
  assert.equal((await get(null, "/assets/fonts/nunito-latin-wght-normal.woff2")).status, 200);
  const html = await page(hugo, "/chest");
  const script = /<script type="module" src="(\/assets\/client-[\w-]+\.js)"/u.exec(html)?.[1];
  assert.ok(script, "the islands' script");
});

test("every page renders for those who may see it, with nothing the policy blocks; others get 404", async () => {
  for (const path of ["/chest", "/chest/new", "/chest/calendar", "/chest/approvals", "/chest/people", "/chest/people?show=former", "/chest/people/import", "/chest/people/import?what=leave", "/chest/people/payroll", "/chest/settings", `/chest/people/${hugo.id}`, `/chest/new?for=${hugo.id}`, "/chest/calendar?month=2027-01&show=mine"]) await page(camille, path);
  // A manager: their people, and what waits for them.
  for (const path of ["/chest/approvals", "/chest/people", `/chest/people/${hugo.id}`]) await page(ines, path);
  // An employee: none of HR's pages, nor someone else's.
  for (const path of ["/chest/approvals", "/chest/people", "/chest/settings", "/chest/people/payroll", `/chest/people/${sofia.id}`, `/chest/new?for=${sofia.id}`, "/chest/requests/999999", "/chest/nothing-here"]) {
    const response = await get(hugo, path);
    assert.equal(response.status, 404, path);
    assert.match(checkPage(await response.text()), /href="\/chest"/u, "the way back");
  }
});

test("a member whose role gives nothing is told why, and no page runs for them", async () => {
  const html = await page(nora, "/chest");
  assert.match(html, /can’t use Leave yet/u);
  assert.doesNotMatch(html, /data-island="MyRequests"/u);
});

test("asking from the form: the server counts again, then the home says it was sent; the request has its page", async () => {
  const types = await database.sql<{ id: string }[]>`select id from leave_types where key = 'unpaid'`;
  const monday = quietMonday(200);
  const sent = await call(hugo, "askLeave", { typeId: types[0]!.id, start: monday, startHalf: "am", end: monday, endHalf: "pm", note: "Dentist" });
  assert.equal(sent.status, 200);
  assert.equal(sent.ok, true);
  assert.equal(sent.redirect, "/chest?done=sent");
  const html = await page(hugo, "/chest?done=sent");
  assert.match(html, /role="status"/u);
  const [row] = await database.sql<{ id: string }[]>`select id from requests where member_id = ${hugo.id} and start_date = ${monday}`;
  const request = await page(hugo, `/chest/requests/${row!.id}`);
  assert.match(request, /data-island="RequestActions"/u);
  // The same days again: refused, in the member's words.
  const again = await call(hugo, "askLeave", { typeId: types[0]!.id, start: monday, startHalf: "am", end: monday, endHalf: "pm" });
  assert.equal(again.status, 400);
  assert.equal(again.error, "overlap");
  assert.equal(again.message, "You already asked for some of these days.");
});

test("an approver answers; the answer can be taken back; nobody else answers, nor the person", async () => {
  const [row] = await database.sql<{ id: string }[]>`select r.id from requests r join staff s on s.member_id = r.member_id where r.status = 'pending' and s.approver_id = ${ines.id} order by r.id limit 1`;
  assert.ok(row, "the sample has a request waiting for Inès");
  assert.equal((await call(sofia, "answer", { id: row.id, verdict: "approve" })).status, 404, "not hers to see");
  assert.equal((await call(hugo, "answer", { id: row.id, verdict: "approve" })).error, "own_request");
  const answered = await call(ines, "answer", { id: row.id, verdict: "approve" });
  assert.equal(answered.ok, true);
  assert.equal((await call(ines, "takeBack", { id: row.id })).ok, true);
  const refused = await call(ines, "answer", { id: row.id, verdict: "maybe" });
  assert.equal(refused.status, 400);
  assert.equal(refused.error, "invalid");
});

test("HR's settings are saved one change at a time, and two sent at once both land", async () => {
  const rules = async () => props(await page(camille, "/chest/settings"), "SettingsView").settings as { alsace: boolean; periodStartMonth: number };
  const before = await rules();
  const month = before.periodStartMonth === 6 ? 1 : 6;
  const [a, b] = await Promise.all([call(camille, "saveSettings", { alsace: !before.alsace }), call(camille, "saveSettings", { periodStartMonth: month })]);
  assert.equal(a.ok && b.ok, true);
  const after = await rules();
  assert.equal(after.alsace, !before.alsace);
  assert.equal(after.periodStartMonth, month);
  assert.equal((await call(hugo, "saveSettings", { alsace: true })).status, 403);
  assert.equal((await call(camille, "saveSettings", { alsace: before.alsace, periodStartMonth: before.periodStartMonth })).ok, true);
});

test("a kind of leave: only what changed is sent, and changes sent at once all land", async () => {
  const kinds = async () => props(await page(camille, "/chest/settings"), "SettingsView").types as { id: string; key: string | null; color: string; notes: boolean; payrollCode: string }[];
  const other = (await kinds()).find(k => k.key === "other")!;
  const results = await Promise.all([
    call(camille, "saveType", { typeId: other.id, input: { color: "rose" } }),
    call(camille, "saveType", { typeId: other.id, input: { notes: false } }),
    call(camille, "saveType", { typeId: other.id, input: { payrollCode: "abs" } }),
  ]);
  assert.ok(results.every(r => r.ok));
  const saved = (await kinds()).find(k => k.id === other.id)!;
  assert.deepEqual([saved.color, saved.notes, saved.payrollCode], ["rose", false, "ABS"]);
});

test("an action sent from another site, or not as a form or JSON, is refused", async () => {
  const cross = await call(camille, "setEmail", { on: false }, { "sec-fetch-site": "cross-site" });
  assert.equal(cross.status, 403);
  const text = await app.fetch(withMember(new Request(`${team}/chest/actions/setEmail`, { method: "POST", body: "on", headers: { "content-type": "text/plain", "x-tool-action": "1", "sec-fetch-site": "same-origin" } }), camille));
  assert.equal(text.status, 415);
  // A form sent without JavaScript: back to the page it came from.
  const form = await app.fetch(withMember(new Request(`${team}/chest/actions/setEmail`, { method: "POST", body: new URLSearchParams({ on: "on" }), headers: { "sec-fetch-site": "same-origin", referer: `${team}/chest` } }), camille));
  assert.equal(form.status, 303);
  assert.equal(form.headers.get("location"), "/chest");
});

test("payroll's files: HR only, in the reader's language; 401 without the Chest", async () => {
  const month = new Date().toISOString().slice(0, 7);
  const absences = await get(camille, `/chest/people/export?month=${month}`);
  assert.equal(absences.status, 200);
  assert.match(absences.headers.get("content-type") ?? "", /^text\/csv/u);
  assert.match(absences.headers.get("content-disposition") ?? "", /attachment; filename="conges-/u);
  const bytes = new Uint8Array(await absences.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a byte order mark: Excel reads it as UTF-8");
  assert.match(new TextDecoder().decode(bytes), /^Matricule;Personne/u);
  const balances = await get(camille, "/chest/people/balances");
  assert.equal(balances.status, 200);
  assert.equal((await get(hugo, `/chest/people/export?month=${month}`)).status, 403);
  assert.equal((await get(camille, "/chest/people/export?month=nope")).status, 400);
  assert.equal((await get(null, "/chest/people/balances")).status, 401);
});

test("what the Chest posts by itself: refused unsigned; a schedule run is done once", async () => {
  const unsigned = await app.fetch(new Request(`${team}/chest-schedules`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
  assert.equal(unsigned.status, 401);
  assert.equal((await app.fetch(new Request(`${team}/chest-events`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }))).status, 401);
  const run = (request: Request) => app.fetch(request);
  const runId = "run_" + "m".repeat(26);
  assert.equal(await chest.run("morning", run, { id: runId }), 204);
  assert.equal(await chest.run("morning", run, { id: runId }), 204, "the same run again: answered, not done twice");
  assert.equal(await chest.run("nothing", run), 404);
});

test("the host's root says where Leave lives; any other path is a 404 in the visitor's words", async () => {
  const root = await app.fetch(new Request("https://leave.chest.test/", { headers: { "accept-language": "fr-FR" } }));
  assert.equal(root.status, 200);
  assert.match(checkPage(await root.text()), /Congés se trouve dans votre Chest/u);
  const missing = await app.fetch(new Request("https://leave.chest.test/anything"));
  assert.equal(missing.status, 404);
});
