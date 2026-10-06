import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { withMember, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage, settled } from "@argentic/chest-app/testing";
import { camille, hugo, ines, nora, sofia } from "./support/members.ts";
import { server, type Server } from "./support/server.ts";
import { world, type World } from "./support/world.ts";

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by the fake Chest, a real PostgreSQL. The
// services have their own tests; these check what the server adds: routes,
// pages, islands, actions at their boundary, the look, the policy, the
// downloads, the Chest's own deliveries.
atLeast(13);
let w: World, app: Server;
before(async () => {
  w = await world({ groups: true });
  app = await server();
});
after(async () => {
  await settled();
  await w.close();
});

const url = (path: string) => `https://goals-chest.chest.test${path}`;
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
async function get(who: FakeMember | null, path: string) {
  const request = new Request(url(path));
  const response = await app(who ? withMember(request, who) : request);
  const html = response.headers.get("content-type")?.startsWith("text/html") ? await response.clone().text() : "";
  if (html) checkPage(html);
  return { status: response.status, html, response };
}
// An action as call() sends it from an island.
async function call(who: FakeMember, name: string, input: unknown, headers: Record<string, string> = {}) {
  const response = await app(withMember(new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin", ...headers } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string }) };
}

let cycleId = "", objectiveId = "", krId = "";

test("a member's page: their language, the strict policy, no inline script or style, the look as its own stylesheet", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const { status, html, response } = await get(camille, "/chest");
  assert.equal(status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Mes objectifs/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]+"\/>/u);
  assert.doesNotMatch(html, /\sstyle="/u);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/u);
  assert.doesNotMatch(html, /<style/u);
});

test("the look: Goals' Trail map with its dark header, its fonts and icon under /assets/", async () => {
  const { html } = await get(hugo, "/chest");
  const sheet = /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(html)![1]!;
  const css = await (await get(hugo, sheet)).response.text();
  assert.match(css, /--top-bg:var\(--inverse\)/u);
  assert.match(css, /\/assets\/fonts\/barlow-semi-condensed-latin-600-normal\.woff2/u);
  for (const path of ["/assets/icon.svg", "/assets/fonts/work-sans-latin-wght-normal.woff2"]) assert.equal((await get(null, path)).status, 200, path);
  // The company's choice: another sheet at another address, the kit's header.
  w.chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  const chosen = /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec((await get(hugo, "/chest")).html)![1]!;
  assert.notEqual(chosen, sheet);
  assert.doesNotMatch(await (await get(hugo, chosen)).response.text(), /--top-bg/u);
  w.chest.theme.all = { mode: "own" };
});

test("a member without a role is told why on every page, and nothing is read", async () => {
  for (const path of ["/chest", "/chest/company", "/chest/cycles"]) {
    const { status, html } = await get(nora, path);
    assert.equal(status, 200, path);
    assert.match(html, /can’t use Goals yet/u, path);
  }
});

test("an empty Chest: the admin starts the quarter in one click; a member is told whom to ask", async () => {
  const empty = await get(camille, "/chest");
  assert.match(empty.html, /Pas encore de cycle/u);
  assert.match(empty.html, /StartCycle/u);
  assert.match((await get(hugo, "/chest")).html, /Camille Martin/u, "whom to ask, by name");
  const started = await call(camille, "startFirstCycle", { which: "current" });
  assert.equal(started.ok, true);
  cycleId = started.value.id;
  assert.equal((await call(hugo, "startFirstCycle", { which: "current" })).error, "forbidden");
  assert.equal((await call(camille, "startFirstCycle", { which: "later" })).error, "invalid");
});

test("an objective written in one form: fields read at the boundary, refusals in the reader's words", async () => {
  const refused = await call(camille, "createObjective", { cycleId, level: "company", title: "  ", why: "", keyResults: [], viewers: [] });
  assert.deepEqual([refused.status, refused.error, refused.message], [400, "empty", "Écrivez d’abord quelque chose."]);
  const badKr = await call(camille, "createObjective", { cycleId, level: "company", title: "Grow", why: "", keyResults: [{ title: "Customers", kind: "lots", start: "0", target: "20", unit: "", owner: ines.id, weight: "1", source: "manual", mine: false, scope: "" }], viewers: [] });
  assert.equal(badKr.error, "invalid");
  const badNumber = await call(hugo, "createObjective", { cycleId, level: "company", title: "Grow", why: "", keyResults: [], viewers: [] });
  assert.equal(badNumber.error, "forbidden", "a company objective is the admins'");
  const made = await call(camille, "createObjective", {
    cycleId, level: "company", title: "Win 20 new customers in Lyon", why: "The new van.", viewers: [],
    keyResults: [
      { title: "Customers signed", kind: "number", start: "0", target: "20", unit: "customer/customers", owner: ines.id, weight: "2", source: "manual", mine: false, scope: "" },
      { title: "Website live", kind: "milestone", start: "", target: "", unit: "", owner: hugo.id, weight: "1", source: "manual", mine: false, scope: "" },
    ],
  });
  assert.equal(made.ok, true);
  objectiveId = made.value.id;
  await settled();
  assert.ok(w.chest.notifications.some(n => n.member === ines.id && n.path === `/chest/objectives/${objectiveId}`), "Inès hears a key result is hers");
  const typo = await call(camille, "addKeyResult", { objectiveId, keyResult: { title: "Calls", kind: "number", start: "0", target: "douze", unit: "", owner: "", weight: "1", source: "manual", mine: false, scope: "" } });
  assert.equal(typo.message, "Écrivez un nombre, comme 12 ou 12,5.");
});

test("every page renders for an admin and a member, and checks for what the policy blocks", async () => {
  const [kr] = await w.database.sql<{ id: string }[]>`select id::text from key_results where title = 'Customers signed'`;
  krId = kr!.id;
  const [made] = await w.database.sql<{ team: string }[]>`insert into teams (name) values ('Workshop') returning id::text as team`;
  const team = made!.team;
  const pages = ["/chest", "/chest/company", `/chest/company?cycle=${cycleId}&status=at_risk,quiet`, `/chest/company?owner=${ines.id}`, "/chest/teams", `/chest/teams/${team}`, `/chest/objectives/${objectiveId}`, `/chest/objectives/${objectiveId}?checkin=${krId}`, `/chest/objectives/${objectiveId}/edit`, "/chest/objectives/new", "/chest/cycles", `/chest/cycles/${cycleId}`, "/chest/settings", "/chest/import"];
  for (const path of pages) {
    const { status, html } = await get(camille, path);
    assert.equal(status, 200, path);
    assert.match(html, /<h1/u, path);
  }
  for (const path of ["/chest", "/chest/company", `/chest/objectives/${objectiveId}`, "/chest/cycles"]) assert.equal((await get(sofia, path)).status, 200, path);
  assert.equal((await get(sofia, "/chest/settings")).status, 404, "settings are the admins'");
  assert.equal((await get(sofia, `/chest/objectives/${objectiveId}/edit`)).status, 404, "editing is its owner's and the admins'");
  for (const path of ["/chest/objectives/999999", "/chest/objectives/x", "/chest/cycles/999999", "/chest/teams/999999", "/chest/company?cycle=999999", "/chest/nothing"]) assert.equal((await get(camille, path)).status, 404, path);
  // An island per key result, its id apart from the ids inside it.
  const page = (await get(camille, `/chest/objectives/${objectiveId}`)).html;
  assert.match(page, new RegExp(`id="island-kr-${krId}"`, "u"));
  assert.match(page, new RegExp(`id="kr-${krId}"`, "u"));
});

test("a weekly update and its Undo, from the island; the home's waiting list follows", async () => {
  const done = await call(ines, "checkIn", { id: krId, value: "4", confidence: "on_track", note: "Two in Lyon" });
  assert.equal(done.ok, true);
  assert.equal((await call(hugo, "checkIn", { id: krId, value: "5", confidence: "on_track", note: "" })).error, "forbidden");
  assert.equal((await call(ines, "checkIn", { id: krId, value: "4", confidence: "sure", note: "" })).error, "invalid");
  const page = (await get(ines, `/chest/objectives/${objectiveId}`)).html;
  assert.match(page, /Two in Lyon/u);
  assert.equal((await call(ines, "undoCheckIn", { id: done.value.id })).ok, true);
  assert.doesNotMatch((await get(ines, `/chest/objectives/${objectiveId}`)).html, /Two in Lyon/u);
});

test("cross-site requests and requests without the island's header are refused", async () => {
  assert.equal((await call(ines, "checkIn", { id: krId, value: "4", confidence: "on_track", note: "" }, { "sec-fetch-site": "cross-site" })).status, 403);
  const bare = withMember(new Request(url("/chest/actions/setEmail"), { method: "POST", body: JSON.stringify({ on: false }), headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }), ines);
  assert.equal((await app(bare)).status, 403);
  assert.equal((await call(ines, "noSuchAction", {})).status, 404);
});

test("downloads: the cycle as CSV in the reader's language, every update, the example file", async () => {
  const csv = await get(camille, `/chest/cycles/${cycleId}/export`);
  assert.equal(csv.status, 200);
  assert.equal(csv.response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.response.headers.get("content-disposition") ?? "", /^attachment; filename="T\d-20\d\d\.csv"/u);
  const text = await csv.response.text();
  assert.match(text, /Win 20 new customers in Lyon/u);
  assert.match(text.split("\r\n")[0]!, /;/u, "French: ; between cells");
  const updates = await get(hugo, `/chest/cycles/${cycleId}/export?what=check-ins`);
  assert.equal(updates.status, 200);
  const example = await get(hugo, "/chest/import/example");
  assert.match(await example.response.text(), /Hugo Bernard/u);
  assert.equal((await get(hugo, "/chest/cycles/999999/export")).status, 404);
});

test("the schedules of chest.json run on /chest-schedules, each once; an unknown one is 404", async () => {
  await w.database.sql`update key_results set created_at = now() - interval '10 days'`;
  const to = (request: Request) => app(request);
  assert.equal(await w.chest.run("reminder", to), 204);
  assert.ok(w.chest.notifications.some(n => n.key === "checkin" && n.member === ines.id));
  assert.equal(await w.chest.run("week", to), 204);
  assert.equal(await w.chest.run("nothing", to), 404);
  const unsigned = await app(new Request(url("/chest-schedules"), { method: "POST", body: "{}" }));
  assert.equal(unsigned.status, 401);
});

test("outside /chest: Goals has no public part — a page says where it lives, in the visitor's language", async () => {
  const home = await app(new Request(url("/"), { headers: { "accept-language": "fr-FR,fr;q=0.9" } }));
  assert.equal(home.status, 200);
  const html = await home.text();
  checkPage(html);
  assert.match(html, /Objectifs se trouve dans votre Chest/u);
  assert.equal((await get(null, "/chest/actions/checkIn")).status, 401);
  assert.equal((await get(null, "/anything")).status, 404);
});

test("a form sent without JavaScript is read the same way, then back to its page", async () => {
  const request = withMember(new Request(url("/chest/actions/setEmail"), { method: "POST", body: new URLSearchParams({ on: "" }), headers: { "sec-fetch-site": "same-origin", referer: url("/chest"), host: "goals-chest.chest.test" } }), ines);
  const response = await app(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/chest");
  const [row] = await w.database.sql<{ email_off: boolean }[]>`select email_off from preferences where member_id = ${ines.id}`;
  assert.equal(row!.email_off, true);
});

test("a page read again with nothing changed is a 304; after a change, the page", async () => {
  const first = await get(hugo, "/chest/company");
  const version = /<meta name="chest-version" content="([^"]+)"/u.exec(first.html)![1]!;
  const again = await app(withMember(new Request(url("/chest/company"), { headers: { "x-tool-version": version } }), hugo));
  assert.equal(again.status, 304);
  await call(ines, "checkIn", { id: krId, value: "7", confidence: "at_risk", note: "" });
  const changed = await app(withMember(new Request(url("/chest/company"), { headers: { "x-tool-version": version } }), hugo));
  assert.equal(changed.status, 200);
});
