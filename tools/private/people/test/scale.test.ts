import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { atLeast, checkPage } from "@argentic/chest-app/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { camille } from "./support/members.ts";

atLeast(3);

// A company of 2,000 people, every one with a job, a team and a manager:
// HR's table, the directory and the org chart must grow with the number of
// people, never with its square (the Chest stops a tool above 256 MiB; a
// table offering every manager in every row was 289 MB of HTML and 2.5 GiB
// at 2,000 people).
const size = 2000;
const letters = "abcdefghijklmnopqrstuvwxyz234567";
const idOf = (n: number) => "mbr_" + Array.from({ length: 26 }, (_, i) => letters[Math.floor(n / 32 ** (i % 3)) % 32]).join("").replace(/^(.{3})/u, "zzz");
const crowd: FakeMember[] = Array.from({ length: size }, (_, n) => ({
  id: idOf(n), firstName: `Person${n}`, lastName: "Test", name: `Person${n} Test`, photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en",
}));

let chest: FakeChest, database: TestDatabase;
let app: { fetch(request: Request): Promise<Response> };
before(async () => {
  assert.equal(new Set(crowd.map(c => c.id)).size, size, "ids are distinct");
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "people", members: [camille, ...crowd], capabilities: ["database", "files", "members", "members.email", "notifications"] });
  ({ app } = await import("../dist/test/app.js" as string) as { app: typeof app });
  // Ten teams; everyone reports to someone of the first hundred (no loop).
  await database.sql`
    insert into profiles (member_id, title, team, office, manager_id)
    select id, 'Job ' || (n % 50), 'Team ' || (n % 10), 'Office ' || (n % 5), case when n < 100 then null else ${crowd[0]!.id}::text end
    from unnest(${crowd.map(c => c.id)}::text[]) with ordinality as t(id, n)`;
});
after(async () => {
  await chest.close();
  await database.close();
});

const url = (path: string) => `https://people-chest.chest.test${path}`;
async function measure(path: string): Promise<{ status: number; bytes: number; ms: number }> {
  const started = performance.now();
  const response = await app.fetch(withMember(new Request(url(path)), camille));
  const html = await response.text();
  checkPage(html);
  return { status: response.status, bytes: Buffer.byteLength(html), ms: Math.round(performance.now() - started) };
}
const mib = (bytes: number) => bytes / (1 << 20);

test("HR's table of 2,000 people: one page under 8 MiB, linear in the number of people", async () => {
  const big = await measure("/chest/table");
  assert.equal(big.status, 200);
  // About 3 KiB a person (cells, the island's props); a manager is a name,
  // never a list per row.
  console.log(`table: ${mib(big.bytes).toFixed(2)} MiB, ${big.ms} ms`);
  assert.ok((await (await app.fetch(withMember(new Request(url("/chest/table")), camille))).text()).split("<tr").length > size, "every person is a row");
  assert.ok(mib(big.bytes) < 8, `the table is ${mib(big.bytes).toFixed(1)} MiB`);
  assert.ok(big.bytes / size < 4096, `${Math.round(big.bytes / size)} bytes a person`);
});

test("the directory and the org chart of 2,000 people stay small", async () => {
  for (const path of ["/chest", "/chest/chart"]) {
    const page = await measure(path);
    assert.equal(page.status, 200, path);
    console.log(`${path}: ${mib(page.bytes).toFixed(2)} MiB, ${page.ms} ms`);
    assert.ok(mib(page.bytes) < 6, `${path} is ${mib(page.bytes).toFixed(1)} MiB`);
  }
});

test("rendering them again and again keeps the server's memory bounded", async () => {
  global.gc?.();
  const before = process.memoryUsage().rss;
  for (let i = 0; i < 5; i++) for (const path of ["/chest/table", "/chest", "/chest/chart"]) await measure(path);
  global.gc?.();
  const grown = mib(process.memoryUsage().rss - before);
  console.log(`fifteen renders: +${grown.toFixed(0)} MiB RSS`);
  // The test process holds PGlite too (when no server is given): the bound
  // is on what fifteen renders add, not on the whole process.
  assert.ok(grown < 160, `fifteen renders added ${grown.toFixed(0)} MiB`);
});
