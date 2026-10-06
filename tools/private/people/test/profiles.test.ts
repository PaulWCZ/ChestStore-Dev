import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { directory } from "../src/lib/directory.ts";
import { AppError } from "../src/lib/errors.ts";
import { choices, profile, reportsOf, updateJob, updateOwn } from "../src/lib/profiles.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, id, ines, lea, nora, paul, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a person edits their own profile; what they write is checked; others' profiles are not theirs to edit", async () => {
  const { sql } = database;
  const saved = await updateOwn(sql, asMember(hugo), { phone: "+33 6 12 34 56 78", pronouns: " he/him ", bio: "Sales\r\nand coffee", skills: ["Pricing", "pricing", "Trade shows"], birthday: { month: 3, day: 14 } });
  assert.deepEqual([saved.phone, saved.pronouns, saved.bio, saved.skills, saved.birthday], ["+33 6 12 34 56 78", "he/him", "Sales\nand coffee", ["Pricing", "Trade shows"], "03-14"]);
  // Only the keys given change; hiding the birthday forgets it.
  const again = await updateOwn(sql, asMember(hugo), { birthday: null });
  assert.equal(again.birthday, null);
  assert.equal(again.phone, "+33 6 12 34 56 78");
  await assert.rejects(updateOwn(sql, asMember(hugo), { phone: "call me" }), refused("invalid"));
  await assert.rejects(updateOwn(sql, asMember(hugo), { bio: "x".repeat(601) }), refused("too_long"));
  await assert.rejects(updateOwn(sql, asMember(hugo), { birthday: { month: 2, day: 30 } }), refused("invalid"));
  await assert.rejects(updateOwn(sql, asMember(paul), { phone: "0612345678" }), refused("forbidden"));
  await assert.rejects(updateOwn(sql, null, {}), refused("forbidden"));
  await assert.rejects(updateOwn(sql, asMember(hugo), "phone"), refused("invalid"));
  // A member never writes job fields, not even their own.
  await assert.rejects(updateJob(sql, asMember(hugo), hugo.id, { title: "CEO" }), refused("forbidden"));
  assert.equal((await profile(sql, asMember(ines), hugo.id)).title, "");
});

test("HR sets anyone's job; the manager is someone in the directory, never a loop", async () => {
  const { sql } = database;
  const hr = asMember(camille);
  await updateJob(sql, hr, ines.id, { title: "Head of sales", team: "Sales", office: "Lyon", startDate: "2021-03-01", managerId: camille.id });
  await updateJob(sql, hr, hugo.id, { title: "Account manager", team: "Sales", managerId: ines.id });
  await updateJob(sql, hr, nora.id, { managerId: hugo.id, startDate: "2026-09-22", phone: "01 23 45 67 89" });
  const h = await profile(sql, asMember(lea), hugo.id);
  assert.deepEqual([h.title, h.team, h.managerId, h.phone], ["Account manager", "Sales", ines.id, "+33 6 12 34 56 78"]);
  assert.deepEqual(await reportsOf(sql, asMember(lea), ines.id), [hugo.id]);
  // camille → ines → hugo → nora: none of them may manage camille.
  await assert.rejects(updateJob(sql, hr, camille.id, { managerId: nora.id }), refused("cycle"));
  await assert.rejects(updateJob(sql, hr, camille.id, { managerId: hugo.id }), refused("cycle"));
  await assert.rejects(updateJob(sql, hr, hugo.id, { managerId: hugo.id }), refused("cycle"));
  await assert.rejects(updateJob(sql, hr, hugo.id, { managerId: paul.id.replace("paul", "zzzz") }), refused("not_member"));
  await assert.rejects(updateJob(sql, hr, "mbr_" + "q".repeat(26), { title: "Ghost" }), refused("not_found"));
  await assert.rejects(updateJob(sql, hr, "'; drop table profiles; --", { title: "x" }), refused("not_found"));
  await assert.rejects(updateJob(sql, hr, hugo.id, { startDate: "2026-13-01" }), refused("invalid"));
  await assert.rejects(updateJob(sql, hr, hugo.id, { title: "x".repeat(81) }), refused("too_long"));
  // A manager removed is null; tom moves under lea, then camille.
  await updateJob(sql, hr, tom.id, { managerId: lea.id });
  await updateJob(sql, hr, tom.id, { managerId: null });
  assert.equal((await profile(sql, hr, tom.id)).managerId, null);
  assert.deepEqual((await choices(sql, hr)).teams, ["Sales"]);
});

test("the directory lists the Chest's members with what the tool knows, and only for those with a role", async () => {
  const { sql } = database;
  const { ok, entries } = await directory(sql, asMember(nora));
  assert.equal(ok, true);
  assert.deepEqual(entries.map(e => e.name), ["Camille Martin", "Hugo Bernard", "Inès Moreau", "Léa Dubois", "Nora Petit", "Paul Durand", "Sofia Rossi", "Tom Walker"]);
  assert.equal(entries.find(e => e.id === hugo.id)?.title, "Account manager");
  assert.equal(entries.find(e => e.id === tom.id)?.title, "");
  await assert.rejects(directory(sql, asMember(paul)), refused("forbidden"));
  // Someone who left and came back within 30 days finds their profile again.
  await sql`update profiles set left_at = now() - interval '2 days' where member_id = ${hugo.id}`;
  await sql`insert into profiles (member_id, title, left_at) values (${id("gone")}, 'Old', now() - interval '31 days')`;
  await directory(sql, asMember(nora));
  assert.equal((await sql`select left_at from profiles where member_id = ${hugo.id}`)[0]?.left_at, null);
  assert.equal((await sql`select 1 from profiles where member_id = ${id("gone")}`).length, 0);
});
