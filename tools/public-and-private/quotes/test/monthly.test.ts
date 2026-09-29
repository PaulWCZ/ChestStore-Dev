import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { finalise } from "../lib/documents.ts";
import { AppError } from "../lib/errors.ts";
import { erase } from "../lib/lifecycle.ts";
import { archiveDue, listArchives, makeArchive, monthsDue, openArchive, waitingArchives } from "../lib/monthly.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines, lea, sofia } from "./support/members.ts";

// The monthly archive: on the first days of a month, the month before —
// its PDFs of record, the summary, the entries, the lists — as one ZIP in
// the Chest's files, with its SHA-256; parts when it is too big for one
// file; the desk asks to keep a copy until one is downloaded.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

// ZIP entry names, read from the central directory.
function names(zip: Uint8Array): string[] {
  const out: string[] = [];
  const view = Buffer.from(zip);
  for (let i = 0; i + 46 <= view.length; i++) {
    if (view.readUInt32LE(i) !== 0x02014b50) continue;
    const length = view.readUInt16LE(i + 28);
    out.push(view.subarray(i + 46, i + 46 + length).toString("utf8"));
  }
  return out;
}

test("a month ended is archived once, whole, with its fingerprint", async () => {
  const { sql } = database;
  const c = await client(sql);
  for (const amount of [100000, 200000, 300000]) {
    const d = await draft(sql, "invoice", c.id, [line("Travaux", 1000, amount)]);
    await finalise(sql, asMember(sofia), d.id, "2026-08-20");
  }
  const late = await draft(sql, "invoice", c.id, [line("Septembre", 1000, 50000)]);
  await finalise(sql, asMember(sofia), late.id, "2026-09-03");
  assert.deepEqual(await monthsDue(sql, "2026-08-31"), []);
  assert.deepEqual(await monthsDue(sql, "2026-09-01"), ["2026-08"]);
  assert.equal(await archiveDue(sql, "2026-09-01", "fr"), 1);
  const [part] = await listArchives(sql, asMember(lea));
  assert.equal(part!.period, "2026-08");
  assert.equal(part!.documents, 3);
  const kept = chest.files.get(part!.object!)!;
  assert.equal(part!.object, "archives/2026/2026-08.zip");
  assert.equal(createHash("sha256").update(kept.data).digest("hex"), part!.sha256);
  const inside = names(kept.data);
  assert.equal(inside.filter(n => n.endsWith(".pdf")).length, 3);
  assert.ok(inside.some(n => n.startsWith("Facture-F-2026-0001")));
  assert.equal(inside.filter(n => n.endsWith(".csv")).length, 4);
  assert.ok(!inside.some(n => n.includes("0004")));
  // Made once.
  assert.equal(await archiveDue(sql, "2026-09-02", "fr"), 0);
});

test("the desk asks for a copy until someone downloads one", async () => {
  const { sql } = database;
  assert.equal((await waitingArchives(sql, asMember(sofia))).length, 1);
  assert.deepEqual(await waitingArchives(sql, asMember(ines)), []);
  await assert.rejects(openArchive(sql, asMember(ines), "2026-08", "1"), refused("forbidden"));
  await assert.rejects(openArchive(sql, asMember(lea), "2026-13", "1"), refused("not_found"));
  const { bytes, fileName } = await openArchive(sql, asMember(lea), "2026-08", "1");
  assert.equal(fileName, "2026-08.zip");
  assert.ok(bytes.length > 1000);
  assert.deepEqual(await waitingArchives(sql, asMember(sofia)), []);
  await erase(sql, lea.id);
  const [row] = await sql<{ downloaded_by: string }[]>`select downloaded_by from archives where period = '2026-08'`;
  assert.equal(row!.downloaded_by, "erased");
});

test("a month too big for one file is cut into parts; an empty month leaves no file", async () => {
  const { sql } = database;
  const parts = await makeArchive(sql, "2026-09", "2026-10-01", "en", 1);
  // One PDF per part (the spreadsheets ride with the first).
  assert.equal(parts.length, 1);
  await sql`delete from archives where period = '2026-09'`;
  const c = await client(sql, { name: "Autre SARL", siren: "", vatNumber: "" });
  const d = await draft(sql, "invoice", c.id, [line("Encore", 1000, 1000)]);
  await finalise(sql, asMember(sofia), d.id, "2026-09-10");
  const split = await makeArchive(sql, "2026-09", "2026-10-01", "en", 1);
  assert.deepEqual(split.map(p => [p.part, p.parts, p.documents]), [[1, 2, 1], [2, 2, 1]]);
  assert.deepEqual(split.map(p => p.object), ["archives/2026/2026-09-1.zip", "archives/2026/2026-09-2.zip"]);
  const empty = await makeArchive(sql, "2026-07", "2026-10-01", "en");
  assert.deepEqual(empty.map(p => [p.object, p.documents]), [[null, 0]]);
});
