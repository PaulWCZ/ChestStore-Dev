import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { connectionOptions, type Sql } from "../lib/db.ts";
import { finalise, nextNumber } from "../lib/documents.ts";
import { AppError } from "../lib/errors.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, sofia } from "./support/members.ts";

// The invoices' sequence must never have a gap nor a duplicate, whatever
// runs at the same time. On a real PostgreSQL (TEST_DATABASE_URL) the
// finalisations below truly run in parallel, on ten connections; PGlite
// has one connection, so there they run one after the other.

let database: TestDatabase;
let chest: FakeChest;
let many: Sql;
const real = Boolean(process.env["TEST_DATABASE_URL"]);

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  await company(database.sql);
  many = real ? (postgres(database.url, { max: 10, ...connectionOptions }) as unknown as Sql) : database.sql;
});
after(async () => {
  if (real) await many.end();
  await chest.close();
  await database.close();
});

test("thirty invoices finalised at once take thirty numbers in a row, no gap, no duplicate", async () => {
  const c = await client(database.sql);
  const drafts = [];
  for (let i = 0; i < 30; i++) drafts.push(await draft(database.sql, "invoice", c.id, [line(`Mission ${i}`, 1000, 10000 + i)]));
  const done = await Promise.all(drafts.map((d, i) => finalise(many, asMember(i % 2 ? sofia : camille), d.id, today)));
  const seqs = done.map(d => Number(d.number!.slice(-4))).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 30 }, (_, i) => i + 1));
  assert.equal(new Set(done.map(d => d.number)).size, 30);
  const [counter] = await database.sql<{ last: number }[]>`select last from counters where type = 'invoice' and year = 2026`;
  assert.equal(counter?.last, 30);
});

test("a finalisation that fails gives its number back, even while others run", async () => {
  const c = await client(database.sql, { name: "Échec" });
  const good = [];
  for (let i = 0; i < 6; i++) good.push(await draft(database.sql, "invoice", c.id, [line(`Bon ${i}`, 1000, 5000)]));
  const failing = Array.from({ length: 6 }, () =>
    many.begin(async tx => {
      await nextNumber(tx, "invoice", 2026, "F");
      throw new AppError("unknown");
    }).catch(() => "failed"),
  );
  const results = await Promise.all([...good.map(d => finalise(many, asMember(sofia), d.id, today)), ...failing]);
  const numbers = results.filter((r): r is Awaited<ReturnType<typeof finalise>> => typeof r !== "string").map(d => Number(d.number!.slice(-4))).sort((a, b) => a - b);
  assert.deepEqual(numbers, [31, 32, 33, 34, 35, 36]);
  const [counter] = await database.sql<{ last: number }[]>`select last from counters where type = 'invoice' and year = 2026`;
  assert.equal(counter?.last, 36);
});

test("the same draft finalised twice at once is numbered once", async () => {
  const c = await client(database.sql, { name: "Double clic" });
  const d = await draft(database.sql, "invoice", c.id, [line("Une fois", 1000, 5000)]);
  const results = await Promise.allSettled([finalise(many, asMember(sofia), d.id, today), finalise(many, asMember(camille), d.id, today)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const refused = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(refused.reason instanceof AppError && refused.reason.code === "not_draft");
  const [counter] = await database.sql<{ last: number }[]>`select last from counters where type = 'invoice' and year = 2026`;
  assert.equal(counter?.last, 37);
});

test("each kind and each year has its own sequence", async () => {
  const c = await client(database.sql, { name: "Suites" });
  const d = await draft(database.sql, "invoice", c.id, [line("Janvier", 1000, 5000)]);
  const next = await finalise(database.sql, asMember(sofia), d.id, "2027-01-04");
  assert.equal(next.number, "F-2027-0001");
  const [q] = await database.sql<{ n: number }[]>`select count(*)::int as n from counters`;
  assert.equal(q?.n, 2);
});
