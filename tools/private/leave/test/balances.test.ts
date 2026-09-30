import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { addDays, addMonths } from "../lib/calendar.ts";
import * as balances from "../lib/balances.ts";
import { planImport } from "../lib/import.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { today } from "../lib/today.ts";
import { types } from "../lib/rules.ts";
import { setApprover, setStartDate } from "../lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, sofia, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let paid: string, rtt: string, sick: string;
before(async () => {
  database = await testDatabase();
  // These tests ask without setting balances first: paid leave may go
  // below zero here (its default refusal is tested in requests.test.ts).
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({ members: everyone, groups: fakeGroups });
  const all = await types(database.sql);
  paid = all.find(t => t.key === "paid")!.id;
  rtt = all.find(t => t.key === "rtt")!.id;
  sick = all.find(t => t.key === "sick")!.id;
  await setApprover(database.sql, asMember(camille), hugo.id, ines.id);
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const of = async (who: typeof hugo, person = who, type = paid) => (await balances.balances(database.sql, asMember(who), person.id)).find(b => b.typeId === type)!;

test("the balance pure: an opening, lines after it, and months earned since", () => {
  const lines = [
    { kind: "adjustment" as const, days: 3, onDate: "2026-01-10" }, // before the opening: no longer counts
    { kind: "opening" as const, days: 10, onDate: "2026-06-01" },
    { kind: "taken" as const, days: -5, onDate: "2026-07-06" },
    { kind: "adjustment" as const, days: 1.5, onDate: "2026-08-01" },
  ];
  const b = balances.compute({ id: "1", perYear: 25 }, lines, { startDate: null }, { periodStartMonth: 6 }, "2026-09-28");
  assert.equal(b.months, 3);
  assert.equal(b.earnedTotal, 6.25);
  assert.equal(b.left, 12.75);
  assert.equal(b.since, "2026-06-01");
  assert.equal(b.perMonth, 2.08);
  assert.equal(balances.compute({ id: "1", perYear: 25 }, [], { startDate: null }, { periodStartMonth: 6 }, "2026-09-28").setUp, false);
  // A start date later than the opening: earning counts from it.
  assert.equal(balances.compute({ id: "1", perYear: 25 }, lines.slice(1), { startDate: "2026-08-01" }, { periodStartMonth: 6 }, "2026-09-28").earnedTotal, 2.08);
});

test("someone with a start date earns 25 days a year month by month, and sees it", async () => {
  await setStartDate(database.sql, asMember(camille), tom.id, addMonths(today(), -3));
  const b = await of(tom);
  assert.equal(b.months, 3);
  assert.equal(b.left, 6.25);
  assert.ok(b.setUp);
  assert.equal((await of(sofia)).setUp, false);
});

test("HR adjusts with a reason, sets an opening balance; lines are only added, never changed", async () => {
  const { sql } = database;
  await balances.setOpening(sql, asMember(camille), { memberId: hugo.id, typeId: paid, days: "12,5", onDate: today() });
  assert.equal((await of(hugo)).left, 12.5);
  await balances.adjust(sql, asMember(camille), { memberId: hugo.id, typeId: paid, days: -2, reason: "Correction" });
  assert.equal((await of(hugo)).left, 10.5);
  await assert.rejects(balances.adjust(sql, asMember(camille), { memberId: hugo.id, typeId: paid, days: 1, reason: " " }), refused("empty"));
  await assert.rejects(balances.adjust(sql, asMember(camille), { memberId: hugo.id, typeId: paid, days: 0, reason: "Nothing" }), refused("invalid"));
  await assert.rejects(balances.adjust(sql, asMember(camille), { memberId: hugo.id, typeId: paid, days: 400, reason: "Too much" }), refused("invalid"));
  await assert.rejects(balances.adjust(sql, asMember(camille), { memberId: hugo.id, typeId: sick, days: 1, reason: "No balance" }), refused("invalid"));
  await assert.rejects(balances.adjust(sql, asMember(ines), { memberId: hugo.id, typeId: paid, days: 1, reason: "Gift" }), refused("forbidden"));
  await assert.rejects(balances.setOpening(sql, asMember(hugo), { memberId: hugo.id, typeId: paid, days: 99 }), refused("forbidden"));
  const [line] = await sql`select id from ledger where member_id = ${hugo.id} limit 1`;
  await assert.rejects(sql`update ledger set days = 100 where id = ${line!["id"]}`);
  await assert.rejects(sql`delete from ledger where id = ${line!["id"]}`);
  const history = await balances.ledger(sql, asMember(hugo), hugo.id);
  assert.deepEqual(history.map(l => [l.kind, l.days]), [["adjustment", -2], ["opening", 12.5]]);
});

test("who sees a balance: the person, their approver, HR — not a colleague nor another manager", async () => {
  const { sql } = database;
  assert.ok(await balances.balances(sql, asMember(ines), hugo.id));
  assert.ok(await balances.balances(sql, asMember(camille), hugo.id));
  await assert.rejects(balances.balances(sql, asMember(lea), hugo.id), refused("not_found"));
  await assert.rejects(balances.ledger(sql, asMember(sofia), hugo.id), refused("not_found"));
});

test("RTT for everyone at once", async () => {
  const { sql } = database;
  const n = await balances.giveEveryone(sql, asMember(camille), { typeId: rtt, days: 10, reason: "RTT 2026" }, [hugo.id, tom.id, sofia.id, "not-an-id"]);
  assert.equal(n, 3);
  assert.equal((await of(sofia, sofia, rtt)).left, 10);
  await assert.rejects(balances.giveEveryone(sql, asMember(ines), { typeId: rtt, days: 10, reason: "RTT" }, [hugo.id]), refused("forbidden"));
});

test("importing opening balances: names matched whatever their accents, case or order; problems said, nothing guessed", async () => {
  const people = everyone.map(p => ({ id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName }));
  const all = await types(database.sql);
  const names = all.filter(t => t.balance).map(t => ({ typeId: t.id, key: t.key, split: t.period === "acquired", names: [t.name ?? "", ...(t.key ? [en.types[t.key], fr.types[t.key], t.key] : [])] }));
  const csv = "\uFEFFNom;Congés payés;RTT;Ancienneté\r\nines moreau;12,5;3;2\r\nDUBOIS Léa;20;;\r\nJean Inconnu;5;1;\r\nTom Walker;abc;2;\r\n";
  const plan = planImport(csv, names, people);
  assert.deepEqual(plan.columns.map(c => c.field), ["name", `b:${paid}:total`, `b:${rtt}:total`, "ignore"]);
  assert.deepEqual(plan.rows.map(r => [r.line, r.memberId, r.problem]), [[2, ines.id, null], [3, lea.id, null], [4, null, "unknown"], [5, tom.id, "bad_number"]]);
  assert.deepEqual(plan.rows[0]!.values, [{ typeId: paid, days: 12.5, earning: null }, { typeId: rtt, days: 3, earning: null }]);
  const twins = [...people, { id: "mbr_twinaaaaaaaaaaaaaaaaaaaaaa", name: "Inès Moreau", firstName: "Inès", lastName: "Moreau" }];
  assert.equal(planImport(csv, names, twins).rows[0]!.problem, "ambiguous");
  assert.throws(() => planImport("just one column\nx", names, people), refused("import_invalid"));
  // A column nobody knows: HR is asked what it is before any line is read.
  assert.deepEqual(planImport("Name,Shoes\nInès Moreau,3", names, people).rows, []);
  assert.throws(() => planImport("Name,Email\nInès Moreau,x", names, people), refused("import_invalid"));
  // Applied: only the clean lines, in one go.
  const rows = plan.rows.filter(r => r.problem === null && r.memberId).flatMap(r => r.values.map(v => ({ memberId: r.memberId!, ...v })));
  assert.equal(await balances.openings(database.sql, asMember(camille), rows, addDays(today(), -1), "From Lucca"), 3);
  assert.equal((await of(camille, lea)).left, 20);
  await assert.rejects(balances.openings(database.sql, asMember(ines), rows, today(), ""), refused("forbidden"));
  await assert.rejects(balances.openings(database.sql, asMember(camille), [], today(), ""), refused("import_empty"));
});
