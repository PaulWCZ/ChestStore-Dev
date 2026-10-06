import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage, settled } from "@argentic/chest-app/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

atLeast(12);

// The server as built for the tests (npm test: dist/test), asked as the
// Chest asks it: members signed by a fake Chest, a real PostgreSQL (PGlite,
// or TEST_DATABASE_URL) holding the sample office (seed/sample.sql). The
// services are tested on their own in the other files; these check what
// the server adds: routes, pages, islands, actions, the look, the policy,
// the files, the Chest's own deliveries — and that two people acting at
// the same moment never hold one desk or one room.
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  database = await testDatabase({ timeZone: "Europe/Paris" });
  await database.sql.unsafe(readFileSync("seed/sample.sql", "utf8")).simple();
  chest = await fakeChest({ network: {}, tool: "rooms", members: everyone, chest: { publicUrl: null, timeZone: "Europe/Paris" } });
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await settled();
  await chest.close();
  await database.close();
  forgetTheme();
});

const team = "https://rooms-chest.chest.test";
const get = (who: FakeMember | null, path: string, headers: Record<string, string> = {}) =>
  app.fetch(who ? withMember(new Request(team + path, { headers }), who) : new Request(team + path, { headers }));
// An action as call() sends it from an island of the page.
async function call(who: FakeMember, name: string, input: unknown) {
  const response = await app.fetch(withMember(new Request(`${team}/chest/actions/${name}`, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } }), who));
  return { status: response.status, ...(await response.json() as { ok: boolean; value?: any; error?: string; message?: string }) };
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// The props an island of the page received.
const props = (html: string, island: string): any => JSON.parse(new RegExp(`data-island="${island}"[^>]*? data-props="([^"]*)"`, "u").exec(html)![1]!.replaceAll("&quot;", "\"").replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));
const page = async (who: FakeMember, path: string) => {
  const response = await get(who, path);
  assert.equal(response.status, 200, path);
  return checkPage(await response.text());
};
// A working day ahead (Monday to Friday), n days after today at least, in the Chest's zone.
function workday(n: number): string {
  const at = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()) + "T12:00:00Z");
  at.setUTCDate(at.getUTCDate() + n);
  while (at.getUTCDay() === 0 || at.getUTCDay() === 6) at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

test("My week: the member's language, the policy, the look as a stylesheet, nothing inline; 401 without the Chest", async () => {
  assert.equal((await get(null, "/chest")).status, 401);
  const response = await get(camille, "/chest");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = checkPage(await response.text());
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /<title>Ma semaine · Salles<\/title>/u);
  assert.match(html, /<link rel="stylesheet" href="\/chest\/look\.css\?v=[\w-]{16}"\/>/u);
  assert.doesNotMatch(html, / style="/u, "no style attribute");
  const week = props(html, "WeekView");
  assert.equal(week.days.length, 10, "this week and the next, Monday to Friday");
  // Camille is an admin: Places is a section.
  assert.match(html, /href="\/chest\/places"/u);
  const en = await page(hugo, "/chest");
  assert.match(en, /<html lang="en">/u);
  assert.doesNotMatch(en, /href="\/chest\/places"/u, "a member does not set up the office");
});

test("the look: Blueprint, a stylesheet whose address is the hash of its text, 304 when the browser has it; the company's choice changes it", async () => {
  const linkOf = async () => /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(await page(hugo, "/chest"))![1]!;
  const own = await linkOf();
  const sheet = await get(hugo, own);
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") ?? "", /^text\/css/u);
  const css = await sheet.text();
  assert.match(css, /--accent:\s*#0f2447/u, "Blueprint, Rooms' own");
  assert.match(css, /url\(\/assets\/fonts\/albert-sans-latin-wght-normal\.woff2\)/u);
  assert.equal((await get(hugo, "/chest/look.css", { "if-none-match": sheet.headers.get("etag")! })).status, 304);
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  forgetTheme();
  const chosen = await linkOf();
  assert.notEqual(chosen, own);
  assert.doesNotMatch(await (await get(hugo, chosen)).text(), /albert-sans/u);
  chest.theme.all = null;
  forgetTheme();
});

test("the browser's files are served to anyone under /assets/, cached; the icon and the fonts too", { skip: existsSync("dist/client/assets") ? false : "no client build: npm run build first" }, async () => {
  const icon = await get(null, "/assets/icon.svg");
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("cache-control") ?? "", /public/u);
  assert.equal((await get(null, "/assets/fonts/albert-sans-latin-wght-normal.woff2")).status, 200);
  const html = await page(hugo, "/chest");
  assert.match(html, /<script type="module" src="\/assets\/client-[\w-]+\.js"/u);
});

test("every page renders for those who may see it, with nothing the policy blocks; the admins' pages are refused to others", async () => {
  const d = workday(1);
  for (const path of ["/chest", `/chest?day=${d}`, "/chest/desks", `/chest/desks?day=${d}&part=am&view=list&f=screen`, "/chest/rooms", `/chest/rooms?day=${d}`, "/chest/people", `/chest/people?q=l%C3%A9a&day=${d}`, "/chest/visitors", "/chest/places", "/chest/places/rules", "/chest/places/export"]) await page(camille, path);
  // The office manager: books for anyone, the reception; no Places.
  for (const path of ["/chest/desks", `/chest/desks?for=${hugo.id}`, "/chest/rooms", "/chest/visitors"]) await page(tom, path);
  for (const path of ["/chest/places", "/chest/places/rules", "/chest/places/export"]) {
    for (const who of [tom, hugo]) {
      const response = await get(who, path);
      assert.equal(response.status, 403, `${path} for ${who.firstName}`);
      checkPage(await response.text());
    }
  }
  const lost = await get(hugo, "/chest/nothing-here");
  assert.equal(lost.status, 404);
  assert.match(checkPage(await lost.text()), /href="\/chest"/u, "the way back");
});

test("a page read again while nothing changed is a 304 (its version); a change anyone makes renders it again", async () => {
  const first = await get(hugo, "/chest/rooms");
  const version = first.headers.get("x-tool-version") ?? /<meta name="chest-version" content="([^"]+)"/u.exec(await first.text())?.[1];
  assert.ok(version, "the page has a version");
  assert.equal((await get(hugo, "/chest/rooms", { "x-tool-version": version })).status, 304);
  assert.equal((await call(sofia, "setPresence", { day: workday(5), status: "remote", officeId: null })).ok, true);
  assert.equal((await get(hugo, "/chest/rooms", { "x-tool-version": version })).status, 200, "someone else's change shows");
});

test("My week too answers 304 when nothing changed: reading it writes nothing; another page read in between changes nothing either", async () => {
  await page(tom, "/chest"); // the usual week applied, the calendars told
  const first = await get(tom, "/chest");
  const version = /<meta name="chest-version" content="([^"]+)"/u.exec(await first.text())?.[1];
  assert.ok(version);
  assert.equal((await get(tom, "/chest", { "x-tool-version": version })).status, 304);
  await page(hugo, "/chest");
  await page(camille, "/chest/desks");
  assert.equal((await get(tom, "/chest", { "x-tool-version": version })).status, 304, "others reading pages write nothing");
});

test("a member whose role gives nothing is told why, and no page runs for them", async () => {
  for (const path of ["/chest", "/chest/desks", "/chest/rooms"]) {
    const html = await page(nora, path);
    assert.match(html, /can’t use this tool yet/u);
    assert.doesNotMatch(html, /data-island="(WeekView|DeskView|RoomsView)"/u);
  }
  const refused = await call(nora, "setPresence", { day: workday(1), status: "office", officeId: null });
  assert.equal(refused.error, "forbidden");
});

test("each island is keyed by what it shows: another day, part or office is another island", async () => {
  const d1 = workday(1), d2 = workday(2);
  const one = await page(hugo, `/chest/desks?day=${d1}`);
  const two = await page(hugo, `/chest/desks?day=${d2}&part=pm`);
  const idOf = (html: string, island: string) => new RegExp(`id="([^"]+)" data-island="${island}"`, "u").exec(html)?.[1];
  assert.ok(idOf(one, "DeskView"));
  assert.notEqual(idOf(one, "DeskView"), idOf(two, "DeskView"));
  assert.notEqual(idOf(await page(hugo, `/chest/rooms?day=${d1}`), "RoomsView"), idOf(await page(hugo, `/chest/rooms?day=${d2}`), "RoomsView"));
});

test("saying Office, booking a desk and freeing it go through the actions; the page then shows them", async () => {
  const d = workday(2);
  const said = await call(lea, "setPresence", { day: d, status: "office", officeId: null });
  assert.equal(said.ok, true, said.message);
  const plan = props(await page(lea, `/chest/desks?day=${d}`), "DeskView");
  const free = plan.floors.flatMap((f: any) => f.areas.flatMap((a: any) => a.desks)).find((x: any) => !x.assigned && x.bookings.length === 0);
  const booked = await call(lea, "bookDesk", { deskId: free.id, day: d, part: "day", move: true });
  assert.equal(booked.ok, true, booked.message);
  const week = props(await page(lea, "/chest"), "WeekView");
  assert.deepEqual(week.days.find((x: any) => x.day === d).desks.map((x: any) => x.name), [free.name]);
  const cancelled = await call(lea, "cancelDesk", { bookingId: booked.value.id });
  assert.equal(cancelled.ok, true);
  // A refusal is a code and a sentence in the member's words (Léa: French).
  const again = await call(lea, "cancelDesk", { bookingId: booked.value.id });
  assert.equal(again.ok, false);
  assert.equal(again.error, "not_found");
  assert.match(again.message!, /n’existe plus/u);
  // A field the action does not take is refused before any service runs.
  assert.equal((await call(lea, "bookDesk", { deskId: free.id, day: "2026-02-31", part: "day" })).error, "invalid");
});

test("two people clicking the same desk, or the same room, at the same moment: one gets it, the other hears it is taken", { skip: process.env["TEST_DATABASE_URL"] ? false : "PGlite serves one session: no race to play" }, async () => {
  const d = workday(3);
  const plan = props(await page(hugo, `/chest/desks?day=${d}`), "DeskView");
  const desk = plan.floors.flatMap((f: any) => f.areas.flatMap((a: any) => a.desks)).find((x: any) => !x.assigned && x.bookings.length === 0);
  // Three days, the same desk, two people each time (a desk each of
  // them had that day moves: only the desk asked is in play).
  for (const day of [...new Set([workday(3), workday(4), workday(5), workday(6)])].slice(0, 3)) {
    const results = await Promise.all([ines, sofia].map(who => call(who, "bookDesk", { deskId: desk.id, day, part: "day", move: true })));
    assert.equal(results.filter(r => r.ok).length, 1, `${day}: ${JSON.stringify(results.map(r => r.error))}`);
    assert.equal(results.find(r => !r.ok)?.error, "taken");
  }
  const grid = props(await page(hugo, `/chest/rooms?day=${d}`), "RoomsView");
  const room = grid.rooms[0];
  const results = await Promise.all([hugo, lea, tom].map(who => call(who, "bookRoom", { roomId: room.id, day: d, start: 1080, end: 1110, title: "", attendees: [] })));
  assert.equal(results.filter(r => r.ok).length, 1, JSON.stringify(results.map(r => r.error)));
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.error), ["taken", "taken"]);
  // The database holds one live booking of that slot.
  const [{ n } = { n: 0 }] = await database.sql<{ n: number }[]>`select count(*)::int as n from room_bookings where room_id = ${room.id} and day = ${d} and cancelled_at is null and lower(during) = (${d}::date + interval '18 hours') at time zone 'Europe/Paris'`;
  assert.equal(n, 1);
});

test("a room booked for a guest: the guest hears it in the bell after the answer; the booking opens from its link", async () => {
  const d = workday(4);
  const grid = props(await page(ines, `/chest/rooms?day=${d}`), "RoomsView");
  const room = grid.rooms.find((r: any) => !r.group);
  const before = chest.notifications.length;
  const booked = await call(ines, "bookRoom", { roomId: room.id, day: d, start: 1110, end: 1140, title: "Café", attendees: [hugo.id] });
  assert.equal(booked.ok, true, booked.message);
  await settled();
  const told = chest.notifications.slice(before).find(n => n.member === hugo.id);
  assert.ok(told, "the guest is told");
  assert.match(told.title, /Inès Moreau/u);
  const opened = props(await page(hugo, `/chest/rooms?day=${d}&booking=${booked.value.ids[0]}`), "RoomsView");
  assert.equal(opened.initial, booked.value.ids[0]);
  assert.equal(opened.bookings.find((b: any) => b[0] === booked.value.ids[0])[4], "Café");
});

test("the files: my calendar, my data, one booking; the admins' exports refused to others with a page", async () => {
  const mine = await get(hugo, "/chest/calendar/mine");
  assert.equal(mine.status, 200);
  assert.match(mine.headers.get("content-type") ?? "", /^text\/calendar/u);
  assert.match(mine.headers.get("content-disposition") ?? "", /attachment/u);
  const ics = await mine.text();
  assert.match(ics, /BEGIN:VCALENDAR/u);
  assert.match(ics, /UID:[0-9a-f]{32}@rooms-chest\.chest\.test/u, "UIDs on the company's own team host");
  const data = await get(hugo, "/chest/mine");
  assert.equal(data.status, 200);
  assert.match(data.headers.get("content-type") ?? "", /^text\/csv/u);
  const d = workday(1), until = workday(8);
  const exported = await get(camille, `/chest/export?kind=occupancy&from=${d}&to=${until}`);
  assert.equal(exported.status, 200);
  assert.match(await exported.text(), /;|,/u);
  const refused = await get(hugo, `/chest/export?kind=bookings&from=${d}&to=${until}`);
  assert.equal(refused.status, 403);
  checkPage(await refused.text());
  assert.equal((await get(hugo, "/chest/calendar/room/999999")).status, 404);
});

test("what the Chest posts: the quarter's run (204, once per run), lifecycle events, refused unsigned", async () => {
  assert.equal(await chest.run("quarter", request => app.fetch(request), { id: "run_" + "q".repeat(26) }), 204);
  assert.equal(await chest.run("quarter", request => app.fetch(request), { id: "run_" + "q".repeat(26) }), 204, "a run sent again is answered, not done twice");
  assert.equal(await chest.run("nothing", request => app.fetch(request)), 404);
  const unsigned = await app.fetch(new Request(team + "/chest-schedules", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
  assert.equal(unsigned.status, 401);
  assert.equal(await chest.emit({ type: "member.updated", data: { id: lea.id, changed: ["groups"] } }, request => app.fetch(request)), 204);
});

test("the host's root says where Rooms lives, in the visitor's language; no other public page", async () => {
  const root = await get(null, "/", { "accept-language": "fr-FR,fr;q=0.9" });
  assert.equal(root.status, 200);
  assert.match(checkPage(await root.text()), /Cet outil se trouve dans votre Chest/u);
  assert.equal((await get(null, "/rooms")).status, 404);
});
