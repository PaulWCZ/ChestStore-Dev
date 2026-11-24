import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { askChange, decideChange, waitingChange } from "../src/lib/changes.ts";
import { createRecord, record, updateRecord } from "../src/lib/records.ts";
import { openPrivate, sealLegacy, sealedFields } from "../src/lib/sealing.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember, opener } from "./support/member.ts";
import { camille, everyone, hugo, nora, sofia } from "./support/members.ts";

// The home address and the emergency contact are sealed by the Chest
// (src/lib/sealing.ts): the database holds `chest:sealed:…`; HR opens them
// (sealed for the role "hr"), the person opens their own copy, nobody else
// (a member, or HR's code asked by someone else) does.

let database: TestDatabase;
let chest: FakeChest;
const hr = asMember(camille);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "people", members: everyone, capabilities: ["members", "files", "notifications", "sealed"], roles: ["hr", "member"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const stored = async (id: string) => (await database.sql<Record<string, string | null>[]>`
  select address, emergency_name, emergency_relation, emergency_phone, own_sealed from records where id = ${id}`)[0]!;

test("chest.json asks for the capability sealed", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
  assert.ok(manifest.capabilities.includes("sealed"));
});

test("sealed in the database; HR opens them, the person opens their own, another member nothing", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: nora.id });
  await updateRecord(sql, hr, id, { address: "8 quai Rambaud\n69002 Lyon", emergencyName: "Anne Petit", emergencyRelation: "Mère", emergencyPhone: "06 12 34 56 78" }, opener(hr));
  const row = await stored(id);
  for (const column of ["address", "emergency_name", "emergency_relation", "emergency_phone", "own_sealed"]) {
    assert.match(String(row[column]), /^chest:sealed:/u, `${column} is sealed`);
    assert.doesNotMatch(String(row[column]), /Rambaud|Anne|Mère|06 12/u);
  }
  const forHr = (await record(sql, hr, id, opener(hr))).record;
  assert.equal(forHr.sealed, "open");
  assert.deepEqual([forHr.address, forHr.emergencyName, forHr.emergencyRelation, forHr.emergencyPhone], ["8 quai Rambaud\n69002 Lyon", "Anne Petit", "Mère", "06 12 34 56 78"]);
  const forNora = (await record(sql, asMember(nora), id, opener(asMember(nora)))).record;
  assert.equal(forNora.sealed, "open");
  assert.equal(forNora.address, "8 quai Rambaud\n69002 Lyon");
  // HR's copy opens for the role hr only: the Chest itself refuses Nora's
  // request, even if the tool's code took her for HR.
  const forged = await openPrivate(opener(asMember(nora)), { ...asMember(nora), role: "hr" }, {
    id, memberId: nora.id, stored: { hr: { address: String(row["address"]), emergencyName: String(row["emergency_name"]), emergencyRelation: String(row["emergency_relation"]), emergencyPhone: String(row["emergency_phone"]) }, own: null },
  });
  assert.equal(forged.state, "hidden");
  assert.equal(forged.values.address, "");
  const opens = chest.opens.length;
  assert.ok(opens > 0, "the Chest journals each open");
  // Another HR person opens it too; saving nothing new seals nothing again.
  const again = await updateRecord(sql, asMember(sofia), id, { address: "8 quai Rambaud\n69002 Lyon" }, opener(asMember(sofia)));
  assert.deepEqual(again.changed, []);
  assert.equal((await stored(id)).address, row.address, "unchanged: not sealed again");
  // A change is sealed again, both copies.
  const changed = await updateRecord(sql, hr, id, { emergencyPhone: "07 00 00 00 00" }, opener(hr));
  assert.deepEqual(changed.changed, ["emergencyPhone"]);
  assert.equal((await record(sql, asMember(nora), id, opener(asMember(nora)))).record.emergencyPhone, "07 00 00 00 00");
});

test("a change asked is sealed while it waits; HR opens and accepts it; only the fields' names stay", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: hugo.id });
  const asked = await askChange(sql, asMember(hugo), id, { address: "1 place Bellecour" }, opener(asMember(hugo)));
  const [raw] = await sql<{ changes: Record<string, unknown> }[]>`select changes from record_requests where id = ${asked.id}`;
  assert.doesNotMatch(JSON.stringify(raw!.changes), /Bellecour/u);
  assert.deepEqual(raw!.changes["fields"], ["address"]);
  assert.deepEqual((await waitingChange(sql, asMember(hugo), id, opener(asMember(hugo))))?.changes, { address: "1 place Bellecour" });
  assert.deepEqual((await waitingChange(sql, hr, id, opener(hr)))?.changes, { address: "1 place Bellecour" });
  await decideChange(sql, hr, asked.id, true, "", opener(hr));
  assert.equal((await record(sql, hr, id, opener(hr))).record.address, "1 place Bellecour");
  const [after] = await sql<{ changes: unknown }[]>`select changes from record_requests where id = ${asked.id}`;
  assert.deepEqual(after!.changes, ["address"]);
});

test("values written in clear before this version are sealed by the morning; read as they are until then", async () => {
  const { sql } = database;
  const [made] = await sql<{ id: string }[]>`
    insert into records (legal_name, created_by, address, emergency_name) values ('Old record', ${camille.id}, '3 rue des Lilas', 'Paul Petit') returning id::text as id`;
  const id = made!.id;
  assert.equal((await record(sql, hr, id, opener(hr))).record.address, "3 rue des Lilas");
  assert.ok((await sealLegacy(sql)) >= 1);
  const row = await stored(id);
  assert.match(String(row["address"]), /^chest:sealed:/u);
  assert.equal(row["emergency_relation"], "", "an empty field stays empty");
  assert.equal((await record(sql, hr, id, opener(hr))).record.emergencyName, "Paul Petit");
  assert.equal(await sealLegacy(sql), 0, "nothing left in clear");
  assert.deepEqual([...sealedFields], ["address", "emergencyName", "emergencyRelation", "emergencyPhone"]);
});
