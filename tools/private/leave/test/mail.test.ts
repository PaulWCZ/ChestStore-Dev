import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { emailOn, setEmail } from "../lib/mail.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setApprover } from "../lib/staff.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, nora } from "./support/members.ts";

// Email beside the bell (the mail proposal): the approver hears of a
// request, the requester of the answer, each in their language with the
// link to it; one switch per person; a Chest without mail sends nothing
// and nothing fails.
let database: TestDatabase;
let chest: FakeChest;
let paid: string;
const withEmail = everyone.map(m => ({ ...m, email: m.firstName.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") + "@atelier.test" }));
before(async () => {
  database = await testDatabase();
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({ members: withEmail, groups: fakeGroups, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier.test" } });
  paid = (await types(database.sql)).find(t => t.key === "paid")!.id;
  await setApprover(database.sql, asMember(camille), hugo.id, ines.id);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a request emails its approver (in French, with the link to answer); the answer emails the requester (in English)", async () => {
  const { sql } = database;
  chest.outbox.length = 0;
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(quietMonday(20)) });
  await tell.asked(sql, asMember(hugo), r);
  assert.equal(chest.outbox.length, 1);
  const toInes = chest.outbox[0]!;
  assert.deepEqual(toInes.to, ["ines@atelier.test"]);
  assert.equal(toInes.subject, "Hugo Bernard demande un congé");
  assert.match(toInes.text, /Congés payés · .+ · 5 jours/u);
  assert.match(toInes.text, new RegExp(`L’ouvrir dans Congés[\\s\\u202f]: https://[^/\\s]+/chest/requests/${r.id}$`, "mu"));
  // Never the note (it stays in the Chest).
  const decided = await requests.decide(sql, asMember(ines), r.id, { verdict: "approve" });
  await tell.answered(sql, asMember(ines), decided);
  const toHugo = chest.outbox.at(-1)!;
  assert.deepEqual([toHugo.to, toHugo.subject], [["hugo@atelier.test"], "Your time off is approved"]);
  assert.match(toHugo.text, /by Inès Moreau/u);
});

test("one switch per person turns the emails off (the bell still tells); only people with a role have it", async () => {
  const { sql } = database;
  assert.equal(await emailOn(sql, asMember(ines)), true);
  await setEmail(sql, asMember(ines), false);
  assert.equal(await emailOn(sql, asMember(ines)), false);
  chest.outbox.length = 0;
  chest.notifications.length = 0;
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(quietMonday(40)) });
  await tell.asked(sql, asMember(hugo), r);
  assert.equal(chest.outbox.length, 0);
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 1);
  await setEmail(sql, asMember(ines), true);
  await assert.rejects(setEmail(sql, asMember(nora), false), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  await assert.rejects(setEmail(sql, asMember(ines), "no"), (e: unknown) => e instanceof AppError && e.code === "invalid");
});

test("on a Chest without mail nothing is sent and nothing fails", async () => {
  const { sql } = database;
  await chest.close();
  chest = await fakeChest({ members: withEmail, groups: fakeGroups });
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(quietMonday(60)) });
  await tell.asked(sql, asMember(hugo), r);
  assert.equal(chest.outbox.length, 0);
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 1);
});
