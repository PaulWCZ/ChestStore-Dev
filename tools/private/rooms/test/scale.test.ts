import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage, settled } from "@argentic/chest-app/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";

atLeast(2);

// A realistic large office, through the built server: 300 people with
// Rooms, 10 floors, 200 meeting rooms, 500 desks, and a working week of
// bookings — 4,000 room bookings, 1,500 desk days — read by an admin on
// every page. Nothing in a page may grow with the square of its rows (a
// list scanned per row, a select of everyone per desk), nor make an Intl
// object per row (test/sources.test.ts): the time a page takes is held
// to a bound, and grows about linearly from a quarter of the office to
// all of it.
let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
const letters = "abcdefghijklmnopqrstuvwxyz";
const idOf = (n: number) => "mbr_" + ("p" + [...String(n).padStart(4, "0")].map(d => letters[Number(d)]).join("")).padEnd(26, "s");
const people: FakeMember[] = Array.from({ length: 300 }, (_, n) => ({
  id: idOf(n), firstName: `Person${n}`, lastName: "Test", name: `Person${n} Test`, photo: null, role: n === 0 ? "admin" : "member", isAdmin: n === 0, isBuilder: false, groups: [], language: "en",
}));
const admin = people[0]!;
const zone = "Europe/Paris";

before(async () => {
  database = await testDatabase({ timeZone: zone });
  chest = await fakeChest({ network: {}, tool: "rooms", members: people, chest: { publicUrl: null, timeZone: zone } });
  const sql = database.sql;
  await sql.unsafe(`
    insert into offices (name, address, position) values ('Tower', '1 avenue de la Tour', 0), ('Annex', '2 rue Basse', 1);
    insert into floors (office_id, name, position) select o.id, 'Floor ' || f, f from offices o, generate_series(1, 10) f where o.name = 'Tower';
    insert into rooms (floor_id, name, capacity, equipment, note, position)
      select fl.id, 'Room ' || fl.position || '-' || r, 2 + (r % 10), array['screen'], '', fl.position * 100 + r from floors fl, generate_series(1, 20) r;
    insert into areas (floor_id, name, position) select fl.id, 'Area ' || fl.position || '-' || a, a from floors fl, generate_series(1, 2) a;
    insert into desks (area_id, name, features, position) select ar.id, 'D-' || ar.id || '-' || d, array['screen'], d from areas ar, generate_series(1, 25) d;
  `).simple();
  // A working week from the next Monday: every room four times a day,
  // 300 people at a desk every day.
  await sql.unsafe(`
    create table scale_week as select (date_trunc('week', current_date)::date + 7 + d) as day from generate_series(0, 4) d;
    insert into room_bookings (room_id, member_id, title, day, during)
      select r.id, '${idOf(1)}', 'Meeting ' || s, w.day,
        tstzrange((w.day + make_interval(mins => s))::timestamp at time zone '${zone}', (w.day + make_interval(mins => s + 60))::timestamp at time zone '${zone}', '[)')
      from rooms r, scale_week w, unnest(array[540, 660, 840, 960]) s;
  `).simple();
  const ids = people.map(p => p.id);
  await sql`
    insert into desk_bookings (desk_id, member_id, day, part, during)
    select d.id, m.id, w.day, 'day', tstzrange(w.day::timestamp at time zone ${zone}, (w.day + 1)::timestamp at time zone ${zone}, '[)')
    from (select id, row_number() over (order by id) as n from desks) d
    join (select id, row_number() over (order by id) as n from unnest(${ids}::text[]) as id) m on m.n = d.n
    cross join scale_week w`;
  await sql`insert into presence (member_id, day, status, office_id) select m, w.day, 'office', (select id from offices where name = 'Tower') from unnest(${ids}::text[]) m cross join scale_week w on conflict do nothing`;
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
});
after(async () => {
  await settled();
  await chest.close();
  await database.close();
  forgetTheme();
});

const team = "https://rooms-chest.chest.test";
async function timed(path: string): Promise<{ ms: number; size: number }> {
  const at = performance.now();
  const response = await app.fetch(withMember(new Request(team + path), admin));
  const html = await response.text();
  const ms = performance.now() - at;
  assert.equal(response.status, 200, path);
  checkPage(html);
  // An island's props are rendered and sent twice in the page: each stays
  // under the package's 256 KB.
  for (const m of html.matchAll(/data-island="(\w+)"[^>]*? data-props="([^"]*)"/gu)) assert.ok(m[2]!.length < 256 << 10, `${path}: ${m[1]}'s props are ${Math.round(m[2]!.length / 1024)} KiB`);
  return { ms, size: html.length };
}
const monday = async () => (await database.sql<{ day: string }[]>`select to_char(min(day), 'YYYY-MM-DD') as day from scale_week`)[0]!.day;

test("every page of a 200-room, 500-desk, 300-person office renders in bounded time and size", async () => {
  const day = await monday();
  // Warm: the first page reads the Chest's members and groups once.
  await timed(`/chest/rooms?day=${day}`);
  const bounds: Record<string, number> = { [`/chest/rooms?day=${day}`]: 4000, [`/chest/desks?day=${day}`]: 4000, [`/chest/people?day=${day}`]: 4000, [`/chest?day=${day}`]: 3000, [`/chest/places`]: 4000, [`/chest/visitors?day=${day}`]: 2000 };
  for (const [path, most] of Object.entries(bounds)) {
    const { ms, size } = await timed(path);
    console.log(`scale: ${path} ${Math.round(ms)} ms, ${Math.round(size / 1024)} KiB`);
    assert.ok(ms < most, `${path}: ${Math.round(ms)} ms (at most ${most})`);
    assert.ok(size < 3 << 20, `${path}: ${size} bytes`);
  }
});

test("the rooms' day grows about linearly with the rooms shown: a quarter of the office, then all of it", async () => {
  const day = await monday();
  const sql = database.sql;
  // The same week, the Tower's rooms moved to a second office a floor at a time.
  const annex = (await sql<{ id: string }[]>`select id from offices where name = 'Annex'`)[0]!.id;
  await sql`update floors set office_id = ${annex} where position <= 3`;
  const small = await timed(`/chest/rooms?day=${day}&office=${annex}`);
  await sql`update floors set office_id = ${annex}`;
  const large = await timed(`/chest/rooms?day=${day}&office=${annex}`);
  console.log(`scale: rooms of 60 → ${Math.round(small.ms)} ms, 200 → ${Math.round(large.ms)} ms`);
  // 3.3 times the rooms: linear work takes about 3.3 times as long; work
  // per pair of rows would take eleven times as long.
  assert.ok(large.ms < small.ms * 6 + 200, `${Math.round(small.ms)} ms → ${Math.round(large.ms)} ms`);
});
