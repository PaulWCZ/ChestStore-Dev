import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { addDays, mondayOf, todayIn } from "../src/shared/days.ts";
import { fetchApp } from "./support/app.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL (PGlite,
// or TEST_DATABASE_URL). The services have their own tests; these check
// what the server adds: routes, pages, islands, actions as an island sends
// them, the look, the policy, the download, the Chest's own deliveries.
atLeast(12);
let chest: FakeChest, database: TestDatabase;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "timesheets", members: everyone, capabilities: ["database", "members", "notifications"], chest: { publicUrl: null }, tools: { quotes: true } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const url = (path: string) => `https://timesheets-chest.chest.test${path}`;
async function get(who: FakeMember | null, path: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await fetchApp(who ? withMember(new Request(url(path), { headers }), who) : new Request(url(path), { headers }));
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
}
// An action as call() sends it from an island.
async function call(who: FakeMember, name: string, input: unknown, headers: Record<string, string> = {}) {
  const response = await fetchApp(withMember(new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const monday = mondayOf(todayIn("UTC"));
let projectId = "";

test("a member's page: their language, the policy, no inline script or style, the look as a stylesheet, the timer", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Ma semaine · Temps<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look.css\?v=[\w-]+"\/>/u);
  assert.match(html, /data-island="TimerBar"/u);
  assert.match(html, /data-island="WeekView"/u);
  assert.match(html, new RegExp(`id="week-${monday}"`, "u"), "the week's island is keyed by its Monday");
  // An empty tool speaks to a manager as such.
  assert.match(html, /Ajouter un projet|Commencez par un projet/u);
});

test("the look: the company's choice as a stylesheet with the tool's own fonts; its address is the hash of its text", async () => {
  const linkOf = async () => /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(await (await get(hugo, "/chest")).text())![1]!;
  const own = await linkOf();
  const sheet = await get(hugo, own);
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") ?? "", /^text\/css/u);
  assert.match(sheet.headers.get("cache-control") ?? "", /immutable/u);
  assert.match(await sheet.text(), /\/assets\/fonts\/manrope-latin-wght-normal\.woff2/u);
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  const chosen = await linkOf();
  assert.notEqual(chosen, own);
  chest.theme.all = { mode: "own" };
  assert.equal((await get(null, "/look.css")).status, 200);
});

test("a member without a role is told why; a member reads that a managers' page is for managers (403)", async () => {
  const none = await get(nora, "/chest");
  assert.equal(none.status, 200);
  assert.match(await none.text(), /can’t use this tool yet/u);
  for (const path of ["/chest/team", "/chest/people", "/chest/projects", "/chest/projects/new", "/chest/settings", "/chest/import"]) {
    const page = await get(hugo, path);
    assert.equal(page.status, 403, path);
    assert.match(await page.text(), /This page is for managers/u, path);
  }
});

test("a project made as the form sends it: its rate as typed, in French", async () => {
  const made = await call(camille, "createProject", { project: { name: "Site vitrine", newClient: "Boulangerie Durand", color: "teal", billable: true, rate: "90,50", budget: { kind: "hours", text: "120:30" }, everyone: true, people: [], lead: null, tasks: ["Design"] } });
  assert.equal(made.ok, true, made.message);
  projectId = made.value.id;
  const page = await (await get(camille, `/chest/projects/${projectId}`)).text();
  assert.match(page, /90,50/u);
  assert.match(page, /data-island="ProjectForm"/u);
  const refused = await call(camille, "createProject", { project: { name: "Ambigu", color: "teal", billable: true, rate: "1.234", budget: { kind: "none" }, everyone: true, people: [] } });
  assert.equal(refused.status, 400);
  assert.equal(refused.error, "amount_ambiguous");
  assert.equal(refused.message, "Ce montant peut se lire de deux façons : écrivez 1200, ou 1 200,00.");
  // A currency typed beside the amount is set aside.
  const euros = await call(camille, "createProject", { project: { name: "En euros", color: "teal", billable: true, rate: "€80", budget: { kind: "money", text: "9 000 €" }, everyone: true, people: [] } });
  assert.equal(euros.ok, true, euros.message);
  assert.equal((await call(hugo, "createProject", { project: { name: "Mine", color: "teal", billable: true, rate: "", budget: { kind: "none" }, everyone: true, people: [] } })).status, 403);
  assert.equal((await get(camille, "/chest/projects/999999")).status, 404);
});

test("a cell takes the duration as typed: French 1,5 and English 1.5 are both an hour and a half", async () => {
  const fr = await call(ines, "saveCell", { projectId, taskId: null, day: monday, duration: "1,5" });
  assert.equal(fr.ok, true, fr.message);
  assert.equal(fr.value.minutes, 90);
  const en = await call(hugo, "saveCell", { projectId, taskId: null, day: monday, duration: "1.5" });
  assert.equal(en.value.minutes, 90);
  const bad = await call(ines, "saveCell", { projectId, taskId: null, day: monday, duration: "beaucoup" });
  assert.equal(bad.status, 400);
  assert.equal(bad.message, "Cette durée est illisible. Écrivez 1:30, 1,5 ou 90m (une journée au plus).");
  const minutes = (await database.sql<{ minutes: number }[]>`select sum(minutes)::int as minutes from entries where deleted_at is null`)[0]?.minutes;
  assert.equal(minutes, 180);
  assert.match(await (await get(ines, "/chest")).text(), /1:30/u);
});

test("a member never sees money: a money budget is a share in their reports, no amount", async () => {
  const [row] = await database.sql<{ id: string }[]>`select id::text from projects where name = 'En euros'`;
  assert.equal((await call(ines, "saveCell", { projectId: row!.id, taskId: null, day: monday, duration: "4" })).ok, true);
  const mine = await (await get(ines, "/chest/reports?preset=week")).text();
  assert.match(mine, /du budget consommé/u);
  const found = /.{120}(€|9[\s\u202f\u00a0]000).{40}/su.exec(mine);
  assert.equal(found?.[0] ?? null, null, "no amount, no budget in money");
  // A manager reads the amounts.
  assert.match(await (await get(camille, "/chest/reports?preset=week")).text(), /€/u);
});

test("Quotes installed but not linked: the panel says an administrator links them, and offers nothing to send", async () => {
  const html = await (await get(camille, "/chest/reports?preset=week&kind=uninvoiced")).text();
  assert.match(html, /pas encore relié à Temps/u);
  assert.doesNotMatch(html, /Brouillon de facture dans Devis :/u);
  assert.equal((await call(camille, "sendToQuotes", { projectId: "1", from: monday, to: addDays(monday, 6) })).error, "quotes_unavailable");
});

test("the timer: started, shown on every page with its project, stopped into an entry", async () => {
  const started = await call(hugo, "startTimer", { projectId, taskId: null, note: "Maquettes" });
  assert.equal(started.ok, true, started.message);
  const reports = await (await get(hugo, "/chest/reports")).text();
  assert.match(reports, /data-island="TimerBar"/u);
  assert.match(reports, /&quot;note&quot;:&quot;Maquettes&quot;/u);
  const stopped = await call(hugo, "stopTimer", {});
  assert.equal(stopped.ok, true);
  assert.equal(stopped.value.day, todayIn("UTC"));
});

test("people's usual week and rates as typed: hours with a comma, an amount from a day", async () => {
  const week = await call(camille, "setCapacity", { memberId: hugo.id, hours: "35,5" });
  assert.equal(week.ok, true, week.message);
  const week_minutes = (await database.sql<{ week_minutes: number }[]>`select week_minutes from people where member_id = ${hugo.id}`)[0]?.week_minutes;
  assert.equal(week_minutes, 2130);
  const rate = await call(camille, "setRate", { kind: "cost", memberId: hugo.id, rate: "45,00", from: todayIn("UTC") });
  assert.equal(rate.ok, true, rate.message);
  assert.equal((await call(camille, "setCapacity", { memberId: hugo.id, hours: "1,234" })).error, "invalid");
  // The grid's grammar: "7h30" a day, "37h30" a week.
  assert.equal((await call(camille, "setCapacity", { memberId: hugo.id, hours: "37h30" })).ok, true);
  const page = await (await get(camille, "/chest/people")).text();
  assert.match(page, /data-island="PeopleList"/u);
});

test("every page of a manager renders, in their language, with no inline style", async () => {
  for (const path of ["/chest", `/chest?week=${addDays(monday, -7)}`, "/chest/reports", "/chest/reports?preset=month&group=person&kind=uninvoiced", "/chest/reports?q=Maquettes", "/chest/team", `/chest/team/${hugo.id}?week=${monday}`, "/chest/people", "/chest/projects", "/chest/projects?archived=1", "/chest/projects/new", `/chest/projects/${projectId}`, "/chest/settings", "/chest/import"]) {
    const page = await get(camille, path);
    assert.equal(page.status, 200, path);
    assert.match(await page.text(), /<html lang="fr">/u, path);
  }
  assert.equal((await get(camille, "/chest/team/mbr_nobody")).status, 404);
});

test("the report's CSV: streamed, in the reader's language, formulas defused, a member's own time only", async () => {
  await call(ines, "setNote", { id: (await database.sql<{ id: string }[]>`select id::text from entries where member_id = ${ines.id} limit 1`)[0]!.id, note: "=HYPERLINK(\"x\")" });
  const fr = await get(camille, `/chest/reports/export?preset=custom&from=${monday}&to=${addDays(monday, 6)}`);
  assert.equal(fr.status, 200);
  assert.equal(fr.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(fr.headers.get("content-disposition") ?? "", /^attachment; filename="temps-/u);
  const bytes = new Uint8Array(await fr.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a byte-order mark: a spreadsheet reads it as UTF-8");
  const text = new TextDecoder().decode(bytes);
  const lines = text.trim().split("\r\n");
  assert.equal(lines.length, 1 + 3, "a header and the three cells (the timer stopped under a minute recorded nothing)");
  assert.match(lines[0]!, /;/u);
  assert.match(text, /'=HYPERLINK/u);
  assert.match(text, /;1,5;/u);
  const own = (await (await get(hugo, `/chest/reports/export?preset=custom&from=${monday}&to=${addDays(monday, 6)}`)).text()).trim().split("\r\n");
  assert.ok(own.slice(1).every(l => l.includes("Hugo Bernard")), "only Hugo's time");
});

test("cross-site requests are refused; a form without JavaScript comes back with the refusal", async () => {
  assert.equal((await call(camille, "addExample", {}, { "sec-fetch-site": "cross-site" })).status, 403);
  const noHeader = withMember(new Request(url("/chest/actions/addExample"), { method: "POST", body: "{}", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), camille);
  assert.equal((await fetchApp(noHeader)).status, 403, "JSON without the island's header");
  assert.equal((await call(camille, "noSuchAction", {})).status, 404);
});

test("the Chest's deliveries: the Friday run (and none other), a member erased once", async () => {
  const to = (request: Request) => fetchApp(request);
  assert.equal(await chest.run("friday", to), 204);
  assert.equal(await chest.run("nothing", to), 404);
  const erased = { type: "member.erased" as const, id: "evt_" + "c".repeat(26), data: { id: ines.id, erasure: "era_" + "b".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(erased, to), 204);
  assert.equal(await chest.emit(erased, to), 204);
  assert.deepEqual(chest.acknowledged, [erased.data.erasure]);
  const n = (await database.sql<{ n: number }[]>`select count(*)::int as n from entries where member_id = ${ines.id}`)[0]?.n;
  assert.equal(n, 0);
  const unsigned = await fetchApp(new Request(url("/chest-events"), { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
  assert.equal(unsigned.status, 401);
});

test("the host's root says where the tool lives, in the visitor's language; anything else is 404", async () => {
  const root = await get(null, "/", { "accept-language": "fr-FR" });
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Cet outil se trouve dans votre Chest/u);
  assert.equal((await get(null, "/nothing")).status, 404);
  assert.equal((await get(camille, "/chest/nothing")).status, 404);
});
