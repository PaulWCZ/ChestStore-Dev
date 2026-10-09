import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { askChange, decideChange } from "../src/lib/changes.ts";
import { AppError } from "../src/lib/errors.ts";
import { createRecord, eraseRecords, record, updateRecord } from "../src/lib/records.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, nora, sofia, tom } from "./support/members.ts";

// Two saves of one record at once — two HR forms, an accepted change and a
// form — each apply over the other, never from a stale read (a lost
// update). On a real PostgreSQL (TEST_DATABASE_URL) the writes truly run
// side by side, on several connections; on PGlite they take turns.
atLeast(5);

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("two HR saves of different fields at once: both kept, every time", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: tom.id });
  for (let round = 0; round < 20; round++) {
    await Promise.all([
      updateRecord(sql, hr, id, { nationality: `Nation ${round}` }),
      updateRecord(sql, asMember(sofia), id, { job: `Job ${round}` }),
      updateRecord(sql, hr, id, { qualification: `Level ${round}` }),
    ]);
    const { record: r } = await record(sql, hr, id);
    assert.deepEqual([r.nationality, r.job, r.qualification], [`Nation ${round}`, `Job ${round}`, `Level ${round}`], `round ${round}`);
  }
});

test("a change accepted while HR saves the form: the address asked and the form's fields are both kept", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: nora.id });
  for (let round = 0; round < 10; round++) {
    const asked = await askChange(sql, asMember(nora), id, { address: `${round} rue du Port, Lyon` });
    await Promise.all([
      decideChange(sql, hr, asked.id, true),
      updateRecord(sql, asMember(sofia), id, { workPermit: `Permit ${round}` }),
    ]);
    const { record: r } = await record(sql, hr, id);
    assert.deepEqual([r.address, r.workPermit], [`${round} rue du Port, Lyon`, `Permit ${round}`], `round ${round}`);
  }
});

test("two HR answer one change at once: one applies it, the other is told it is answered", async () => {
  const { sql } = database;
  const { id: noraRecord } = (await sql<{ id: string }[]>`select id::text from records where member_id = ${nora.id}`)[0]!;
  const asked = await askChange(sql, asMember(nora), noraRecord, { emergencyName: "Paul Petit" });
  const answers = await Promise.allSettled([decideChange(sql, hr, asked.id, true), decideChange(sql, asMember(sofia), asked.id, false, "No")]);
  assert.equal(answers.filter(a => a.status === "fulfilled").length, 1);
  const lost = answers.find(a => a.status === "rejected") as PromiseRejectedResult;
  assert.ok(refused("not_found")(lost.reason));
});

test("a record detached by an erasure keeps no address nor emergency contact, and they are never written again", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: tom.id }).catch(async () => ({ id: (await sql<{ id: string }[]>`select id::text from records where member_id = ${tom.id}`)[0]!.id }));
  await updateRecord(sql, hr, id, { startDate: "2024-01-08", address: "1 rue de la Paix" });
  await eraseRecords(sql, tom.id, "2026-10-06");
  const { record: r } = await record(sql, hr, id);
  assert.equal(r.address, "");
  await assert.rejects(updateRecord(sql, hr, id, { address: "2 rue de la Paix" }), refused("erased"));
  await assert.rejects(updateRecord(sql, hr, id, { emergencyPhone: "06 12 34 56 78" }), refused("erased"));
  // What the register needs may still be corrected.
  assert.deepEqual((await updateRecord(sql, hr, id, { qualification: "Technician" })).changed, ["qualification"]);
});

test("nobody is born in the future", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { legalName: "Futur Jean" });
  const next = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  await assert.rejects(updateRecord(sql, hr, id, { birthDate: next }), refused("invalid"));
  assert.deepEqual((await updateRecord(sql, hr, id, { birthDate: "1990-04-02" })).changed, ["birthDate"]);
});
