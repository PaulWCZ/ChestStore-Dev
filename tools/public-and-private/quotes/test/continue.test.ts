import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { finalise, sendQuote, upcomingNumber } from "../src/lib/documents.ts";
import { AppError } from "../src/shared/app-error.ts";
import { continueSequence, continuedAt, numberingChanges, sequences, setNumberFormat } from "../src/lib/numbering.ts";
import { documentNumber, nextSeq, periodOf } from "../src/shared/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, ines, sofia } from "./support/members.ts";

// Switching from another tool on 1 October after its F-2026-0347: the
// next invoice here is F-2026-0348 — set by an administrator, only
// forward, only before this tool numbered anything in the sequence, and
// kept in the numbering's history.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("numbers with or without the year", () => {
  assert.equal(documentNumber("F", 2026, 42), "F-2026-0042");
  assert.equal(documentNumber("F", 0, 348), "F-0348");
  assert.equal(documentNumber("FA", 0, 12345), "FA-12345");
  assert.equal(periodOf("yearly", "2026-10-01"), 2026);
  assert.equal(periodOf("continuous", "2026-10-01"), 0);
  assert.equal(nextSeq("348"), 348);
  assert.throws(() => nextSeq("0"), refused("next_number_invalid"));
  assert.throws(() => nextSeq("F-2026-0348"), refused("next_number_invalid"));
});

test("the invoices go on from the previous tool's last number, and the change is kept", async () => {
  const { sql } = database;
  // Only an administrator.
  await assert.rejects(continueSequence(sql, asMember(sofia), "invoice", "348", today), refused("forbidden"));
  const set = await continueSequence(sql, asMember(camille), "invoice", "348", today);
  assert.equal(set.next, "F-2026-0348");
  assert.equal(await upcomingNumber(sql, "invoice", today), "F-2026-0348");
  // Still before anything is numbered: forward again, never back.
  await assert.rejects(continueSequence(sql, asMember(camille), "invoice", "300", today), refused("next_number_backwards"));
  await assert.rejects(continueSequence(sql, asMember(camille), "invoice", "347", today), refused("next_number_backwards"));
  assert.equal((await continueSequence(sql, asMember(camille), "invoice", "350", today)).next, "F-2026-0350");
  const c = await client(sql);
  const first = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Mission", 1000, 50000)])).id, today);
  const second = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Mission", 1000, 50000)])).id, today);
  assert.equal(first.number, "F-2026-0350");
  assert.equal(second.number, "F-2026-0351");
  // Once this tool numbered in the sequence, it can no longer move: a
  // jump would be a gap in its own numbers.
  await assert.rejects(continueSequence(sql, asMember(camille), "invoice", "500", today), refused("numbering_started"));
  // The credit notes' and quotes' sequences are their own.
  assert.equal((await continueSequence(sql, asMember(camille), "credit", "12", today)).next, "A-2026-0012");
  const list = await sequences(sql, today);
  assert.deepEqual(list.map(s => [s.type, s.next, s.started]), [["quote", "D-2026-0001", false], ["invoice", "F-2026-0352", true], ["credit", "A-2026-0012", false]]);
  // History: who set what, latest first; the first invoice numbered after
  // a change says so.
  const changes = await numberingChanges(sql);
  assert.deepEqual(changes.map(ch => ch.number), ["A-2026-0012", "F-2026-0350", "F-2026-0348"]);
  assert.equal(changes[0]!.changedBy, camille.id);
  const [row] = await sql<{ year: number; seq: number }[]>`select year, seq from documents where id = ${first.id}`;
  assert.ok(await continuedAt(sql, { type: "invoice", year: row!.year, seq: row!.seq }));
  const [other] = await sql<{ year: number; seq: number }[]>`select year, seq from documents where id = ${second.id}`;
  assert.equal(await continuedAt(sql, { type: "invoice", year: other!.year, seq: other!.seq }), null);
});

test("numbers without the year: F-0001 onwards, never restarting, and a sequence of their own", async () => {
  const { sql } = database;
  await assert.rejects(setNumberFormat(sql, asMember(ines), "continuous"), refused("forbidden"));
  await assert.rejects(setNumberFormat(sql, asMember(camille), "weekly"), refused("invalid"));
  assert.equal(await setNumberFormat(sql, asMember(camille), "continuous"), "continuous");
  // The same format again changes nothing and is not logged twice.
  await setNumberFormat(sql, asMember(camille), "continuous");
  assert.equal((await numberingChanges(sql)).filter(ch => ch.numberFormat === "continuous").length, 1);
  assert.equal(await upcomingNumber(sql, "invoice", today), "F-0001");
  assert.equal((await continueSequence(sql, asMember(camille), "invoice", "1203", today)).next, "F-1203");
  const c = await client(sql);
  const inv = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Mission", 1000, 50000)])).id, today);
  assert.equal(inv.number, "F-1203");
  // Next year, it goes on.
  const later = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Mission", 1000, 50000)])).id, "2027-01-04");
  assert.equal(later.number, "F-1204");
  const q = await draft(sql, "quote", c.id, [line("Devis", 1000, 10000)], ines);
  assert.equal((await sendQuote(sql, asMember(ines), q.id, null, "2027-01-04")).number, "D-0001");
  // Back to the year: the yearly counters were kept, no number comes twice.
  await setNumberFormat(sql, asMember(camille), "yearly");
  const back = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Mission", 1000, 50000)])).id, "2027-01-05");
  assert.equal(back.number, "F-2027-0001");
  const numbers = (await sql<{ number: string }[]>`select number from documents where type = 'invoice' and number is not null`).map(r => r.number);
  assert.equal(new Set(numbers).size, numbers.length);
});
