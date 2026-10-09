import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/errors.ts";
import { ofRecord } from "../src/lib/journal.ts";
import { eraseRecords } from "../src/lib/records.ts";
import { createRecord, linkRecord, updateRecord } from "../src/lib/records.ts";
import { offlineStaff, placement, setPlacement } from "../src/lib/offline.ts";
import { profiles } from "../src/lib/profiles.ts";
import { addDays } from "../src/shared/model.ts";
import { orgChart } from "../src/shared/tree.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, paul, tom } from "./support/members.ts";

// Staff without the Chest (round 3, blocker 5): an HR record not linked to
// a member is in the directory and the org chart — name, job, team,
// manager, marked — for everyone who reads the directory, never with
// anything else of the record; HR places them, or takes them off; linked,
// the member's profile takes over.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "people", members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from records`;
});
const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

async function warehouse() {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { legalName: "Aminata Diallo" });
  await updateRecord(sql, hr, id, { job: "Warehouse operative", startDate: addDays(today(), -200), contract: "permanent", address: "12 rue des Lilas, Lyon", emergencyName: "Moussa Diallo", birthDate: "1990-04-02" });
  return id;
}

test("someone without the Chest is in the directory for everyone: name, job, team and manager only", async () => {
  const { sql } = database;
  const id = await warehouse();
  await setPlacement(sql, hr, id, { team: "Logistics", managerId: hugo.id });
  const seen = await offlineStaff(sql, asMember(ines), today());
  assert.deepEqual(seen, [{ id: `rec:${id}`, recordId: id, name: "Aminata Diallo", title: "Warehouse operative", team: "Logistics", managerId: hugo.id }]);
  // Nothing else of the record travels: no address, no dates, no contract.
  assert.deepEqual(Object.keys(seen[0]!).sort(), ["id", "managerId", "name", "recordId", "team", "title"]);
  // In the org chart, under her manager.
  const { roots } = orgChart([{ id: hugo.id, managerId: null }, { id: seen[0]!.id, managerId: seen[0]!.managerId }]);
  assert.deepEqual(roots.map(r => [r.person.id, r.reports.map(x => x.person.id)]), [[hugo.id, [`rec:${id}`]]]);
  // Someone with the tool but no role reads no directory.
  await assert.rejects(offlineStaff(sql, asMember(paul), today()), refused("forbidden"));
});

test("only while they work here, and only while HR lists them; linked records are members, not listed twice", async () => {
  const { sql } = database;
  const id = await warehouse();
  const future = (await createRecord(sql, hr, { legalName: "Linh Nguyen" })).id;
  await updateRecord(sql, hr, future, { startDate: addDays(today(), 20) });
  const gone = (await createRecord(sql, hr, { legalName: "Marc Roux" })).id;
  await updateRecord(sql, hr, gone, { startDate: "2020-01-06", endDate: addDays(today(), -1) });
  const member = (await createRecord(sql, hr, { memberId: tom.id })).id;
  assert.deepEqual((await offlineStaff(sql, hr, today())).map(o => o.recordId), [id]);
  assert.ok(member);
  await setPlacement(sql, hr, id, { listed: false });
  assert.deepEqual(await offlineStaff(sql, hr, today()), []);
  assert.equal((await placement(sql, hr, id)).listed, false);
});

test("HR places them: a team, a manager who has the tool; each change in the record's journal; nobody else may", async () => {
  const { sql } = database;
  const id = await warehouse();
  await assert.rejects(setPlacement(sql, asMember(ines), id, { team: "Logistics" }), refused("forbidden"));
  await assert.rejects(setPlacement(sql, hr, id, { managerId: "mbr_" + "z".repeat(26) }), refused("not_member"));
  await assert.rejects(setPlacement(sql, hr, id, { team: "x".repeat(61) }), refused("too_long"));
  await setPlacement(sql, hr, id, { team: " Logistics ", managerId: hugo.id });
  assert.deepEqual(await placement(sql, hr, id), { listed: true, team: "Logistics", managerId: hugo.id, linked: false });
  const journal = await ofRecord(sql, id, 10);
  assert.deepEqual(journal[0]!.fields.sort(), ["managerId", "team"]);
  // A record linked to a member is placed by their profile, not here.
  const linked = (await createRecord(sql, hr, { memberId: tom.id })).id;
  await assert.rejects(setPlacement(sql, hr, linked, { team: "Tech" }), refused("invalid"));
});

test("linked once they get the Chest: their team and manager fill the profile's empty fields; an erased manager leaves the record", async () => {
  const { sql } = database;
  const id = await warehouse();
  await setPlacement(sql, hr, id, { team: "Logistics", managerId: hugo.id });
  await linkRecord(sql, hr, id, tom.id);
  const profile = (await profiles(sql, hr, [tom.id])).get(tom.id)!;
  assert.equal(profile.team, "Logistics");
  assert.equal(profile.managerId, hugo.id);
  assert.deepEqual(await offlineStaff(sql, hr, today()), []);

  const other = await warehouse();
  await setPlacement(sql, hr, other, { managerId: hugo.id });
  await eraseRecords(sql, hugo.id, today());
  assert.equal((await placement(sql, hr, other)).managerId, null);
});
