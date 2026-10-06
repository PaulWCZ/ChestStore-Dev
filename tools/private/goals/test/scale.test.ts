import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { withMember, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { camille } from "./support/members.ts";
import { server, type Server } from "./support/server.ts";
import { world, type World } from "./support/world.ts";

// A company at the size Goals is for, and past it: 300 people, a cycle of
// 500 objectives (the most a cycle takes) with three key results each, a
// month of weekly updates. The pages that show it all must stay quick and
// light: rows grouped in one pass, names asked once, the tree drawn on the
// server (no island carrying it).
atLeast(2);
let w: World, app: Server;
const people = Array.from({ length: 300 }, (_, i) => `mbr_${String(i).padStart(4, "0").replace(/\d/gu, d => "abcdefghij"[Number(d)]!)}${"a".repeat(22)}`);
before(async () => {
  w = await world();
  // Everyone is a member of the Chest (names asked in batches of 200).
  for (const [i, id] of people.entries()) w.chest.members.push({ id, firstName: "Person", lastName: String(i), name: `Person ${i}`, photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" });
  w.chest.clearCaches();
  const { sql } = w.database;
  const [cycle] = await sql<{ id: string }[]>`insert into cycles (name, starts_on, ends_on, current, created_by) values ('Big quarter', current_date - 40, current_date + 50, true, ${camille.id}) returning id::text`;
  const [team] = await sql<{ id: string }[]>`insert into teams (name) values ('Everyone') returning id::text`;
  // 20 company objectives, 480 team objectives under them.
  await sql`
    insert into objectives (cycle_id, level, team_id, parent_id, owner, title, created_by)
    select ${cycle!.id}, 'company', null, null, ${people[0]!}, 'Company goal ' || n, ${camille.id} from generate_series(1, 20) n`;
  await sql`
    insert into objectives (cycle_id, level, team_id, parent_id, owner, title, created_by)
    select ${cycle!.id}, 'team', ${team!.id}, (select id from objectives where level = 'company' order by id offset (n % 20) limit 1), (${people}::text[])[1 + n % 300], 'Team goal ' || n, ${camille.id} from generate_series(1, 480) n`;
  await sql`
    insert into key_results (objective_id, title, kind, target_value, current_value, weight, owner, created_by, created_at)
    select o.id, 'Measure ' || k, 'number', 100, (o.id * 7 + k * 13) % 100, 1 + k % 3, (${people}::text[])[1 + (o.id::int * 3 + k) % 300], ${camille.id}, now() - interval '30 days'
    from objectives o, generate_series(1, 3) k`;
  await sql`
    insert into check_ins (key_result_id, value, confidence, author, created_at)
    select k.id, k.current_value, (array['on_track','at_risk','off_track'])[1 + (k.id::int + w) % 3], k.owner, now() - (w * 7 || ' days')::interval
    from key_results k, generate_series(1, 4) w`;
  app = await server();
});
after(async () => { await w.close(); });

async function timed(who: FakeMember, path: string) {
  const started = performance.now();
  const response = await app(withMember(new Request(`https://goals-chest.chest.test${path}`), who));
  const html = await response.text();
  return { status: response.status, html, ms: performance.now() - started };
}

test("the company tree of 500 objectives and 1,500 key results renders in well under a second or two, without a giant island", async t => {
  await timed(camille, "/chest/company"); // first read: the server warms up
  const page = await timed(camille, "/chest/company");
  assert.equal(page.status, 200);
  checkPage(page.html);
  assert.equal((page.html.match(/class="node level-/gu) ?? []).length, 500);
  assert.ok(page.ms < 2500, `${Math.round(page.ms)} ms`);
  // Every island's props, whatever the page: none carries the tree.
  const biggest = Math.max(...[...page.html.matchAll(/data-props="([^"]*)"/gu)].map(m => m[1]!.length));
  assert.ok(biggest < 256 * 1024, `largest island props: ${biggest} characters`);
  t.diagnostic(`company: ${Math.round(page.ms)} ms, ${Math.round(page.html.length / 1024)} KiB, largest island props ${biggest} characters`);
  assert.ok(page.html.length < 6 * 1024 * 1024, `${Math.round(page.html.length / 1024)} KiB of HTML`);
});

test("the cycles and teams pages, and a person's own goals, stay quick at that size", async t => {
  for (const path of ["/chest/cycles", "/chest/teams", "/chest"]) {
    const page = await timed(camille, path);
    assert.equal(page.status, 200, path);
    t.diagnostic(`${path}: ${Math.round(page.ms)} ms, ${Math.round(page.html.length / 1024)} KiB`);
    assert.ok(page.ms < 2500, `${path}: ${Math.round(page.ms)} ms`);
  }
});
