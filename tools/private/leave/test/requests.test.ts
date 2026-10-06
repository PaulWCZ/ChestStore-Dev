import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import { addDays } from "../src/shared/calendar.ts";
import { balances } from "../src/lib/balances.ts";
import * as requests from "../src/lib/requests.ts";
import { archiveType, saveType, types } from "../src/lib/rules.ts";
import { setApprover, setStartDate } from "../src/lib/staff.ts";
import * as tell from "../src/lib/tell.ts";
import { today } from "../src/lib/today.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, nora, sofia, tom, seen } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let paid: string, sick: string, unpaid: string;
before(async () => {
  database = await testDatabase();
  // These tests ask without setting balances first: paid leave may go
  // below zero here (its default refusal is tested in requests.test.ts).
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({ network: {}, members: everyone, groups: fakeGroups });
  const all = await types(database.sql);
  paid = all.find(t => t.key === "paid")!.id;
  sick = all.find(t => t.key === "sick")!.id;
  unpaid = all.find(t => t.key === "unpaid")!.id;
  await setApprover(database.sql, asMember(camille), hugo.id, ines.id);
  await setApprover(database.sql, asMember(camille), tom.id, lea.id);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("an employee asks for a week: it costs 5 days, waits for an answer, and cannot be asked twice", async () => {
  const { sql } = database;
  const monday = quietMonday(14);
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(monday), note: "  Family trip  " });
  assert.equal(r.days, 5);
  assert.equal(r.status, "pending");
  assert.equal(r.note, "Family trip");
  await assert.rejects(requests.createRequest(sql, asMember(hugo), { typeId: paid, start: addDays(monday, 4), startHalf: "pm", end: addDays(monday, 7), endHalf: "pm" }), refused("overlap"));
  // The afternoon after a morning off is free.
  const m = await requests.createRequest(sql, asMember(hugo), { typeId: paid, start: addDays(monday, 14), startHalf: "am", end: addDays(monday, 14), endHalf: "am" });
  const a = await requests.createRequest(sql, asMember(hugo), { typeId: paid, start: addDays(monday, 14), startHalf: "pm", end: addDays(monday, 14), endHalf: "pm" });
  assert.equal(m.days + a.days, 1);
  assert.deepEqual((await requests.history(sql, asMember(hugo), r.id)).map(s => s.kind), ["asked"]);
});

test("what a request refuses: dates, week-ends, half days, notes, far dates, hidden types, no role", async () => {
  const { sql } = database;
  const monday = quietMonday(60);
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, start: addDays(monday, 2), startHalf: "am", end: monday, endHalf: "pm" }), refused("bad_dates"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, start: monday, startHalf: "pm", end: monday, endHalf: "am" }), refused("bad_dates"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, start: addDays(monday, 5), startHalf: "am", end: addDays(monday, 6), endHalf: "pm" }), refused("no_days"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: sick, start: monday, startHalf: "am", end: monday, endHalf: "am" }), refused("no_half_days"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: sick, ...week(monday), note: "flu" }), refused("no_notes"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, start: addDays(today(), 800), startHalf: "am", end: addDays(today(), 800), endHalf: "pm" }), refused("too_far"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, start: "2026-02-30", startHalf: "am", end: "2026-03-02", endHalf: "pm" }), refused("invalid"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, ...week(monday), startHalf: "noon" }), refused("invalid"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, ...week(monday), note: "x".repeat(301) }), refused("too_long"));
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: "999", ...week(monday) }), refused("not_found"));
  await assert.rejects(requests.createRequest(sql, asMember(nora), { typeId: paid, ...week(monday) }), refused("forbidden"));
  await archiveType(sql, asMember(camille), unpaid, true);
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: unpaid, ...week(monday) }), refused("not_found"));
  await archiveType(sql, asMember(camille), unpaid, false);
});

test("sick leave is recorded at once, counted in calendar days, never with a note", async () => {
  const { sql } = database;
  const monday = quietMonday(30);
  const r = await requests.createRequest(sql, asMember(sofia), { typeId: sick, start: addDays(monday, 4), startHalf: "am", end: addDays(monday, 7), endHalf: "pm" });
  assert.equal(r.status, "approved");
  assert.equal(r.days, 4);
  assert.equal(r.decidedBy, "chest");
  assert.deepEqual((await requests.history(sql, asMember(sofia), r.id)).map(s => s.kind), ["declared"]);
});

test("the approver approves: the days leave the balance; others may not answer or even see it", async () => {
  const { sql } = database;
  await setStartDate(sql, asMember(camille), hugo.id, addDays(today(), -365));
  const before = (await balances(sql, asMember(hugo), hugo.id)).find(b => b.typeId === paid)!;
  const monday = quietMonday(100);
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(monday) });
  assert.equal((await balances(sql, asMember(hugo), hugo.id)).find(b => b.typeId === paid)!.pending, before.pending + 5);
  await assert.rejects(requests.decide(sql, asMember(lea), r.id, { verdict: "approve" }), refused("not_found"));
  await assert.rejects(requests.decide(sql, asMember(sofia), r.id, { verdict: "approve" }), refused("not_found"));
  await assert.rejects(requests.decide(sql, asMember(hugo), r.id, { verdict: "approve" }), refused("own_request"));
  await assert.rejects(requests.decide(sql, asMember(ines), r.id, { verdict: "maybe" }), refused("invalid"));
  const done = await requests.decide(sql, asMember(ines), r.id, { verdict: "approve", reason: "Enjoy!" });
  assert.equal(done.status, "approved");
  assert.equal(done.decidedBy, ines.id);
  const after = (await balances(sql, asMember(hugo), hugo.id)).find(b => b.typeId === paid)!;
  assert.equal(after.left, before.left - 5);
  await assert.rejects(requests.decide(sql, asMember(ines), r.id, { verdict: "refuse" }), refused("not_pending"));
  // Undo within ten minutes: waiting again, the days back.
  await assert.rejects(requests.reopen(sql, asMember(camille), r.id), refused("not_pending"));
  assert.equal((await requests.reopen(sql, asMember(ines), r.id)).status, "pending");
  assert.equal((await balances(sql, asMember(hugo), hugo.id)).find(b => b.typeId === paid)!.left, before.left);
  // HR may answer anyone's.
  const refusedOne = await requests.decide(sql, asMember(camille), r.id, { verdict: "refuse", reason: "Stock count that week" });
  assert.equal(refusedOne.status, "refused");
  assert.equal(refusedOne.reason, "Stock count that week");
  assert.deepEqual((await requests.history(sql, asMember(hugo), r.id)).map(s => s.kind), ["asked", "approved", "reopened", "refused"]);
});

test("cancelling: a pending request at once (with undo), an approved one on the approver's say", async () => {
  const { sql } = database;
  const monday = quietMonday(130);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: paid, ...week(monday) });
  await assert.rejects(requests.cancel(sql, asMember(lea), r.id), refused("forbidden"));
  assert.equal(await requests.cancel(sql, asMember(tom), r.id), "cancelled");
  assert.equal((await requests.restore(sql, asMember(tom), r.id)).status, "pending");
  await requests.decide(sql, asMember(lea), r.id, { verdict: "approve" });
  const left = async () => (await balances(sql, asMember(tom), tom.id)).find(b => b.typeId === paid)!.left;
  const approvedLeft = await left();
  assert.equal(await requests.cancel(sql, asMember(tom), r.id), "asked");
  assert.equal(await requests.cancel(sql, asMember(tom), r.id), "asked");
  assert.equal((await requests.request(sql, asMember(tom), r.id)).cancelAsked, true);
  await assert.rejects(requests.settleCancel(sql, asMember(ines), r.id, { accept: true }), refused("not_found"));
  const kept = await requests.settleCancel(sql, asMember(lea), r.id, { accept: false, reason: "Too late, sorry" });
  assert.equal(kept.status, "approved");
  assert.equal(kept.cancelAsked, false);
  await assert.rejects(requests.settleCancel(sql, asMember(lea), r.id, { accept: false }), refused("not_approved"));
  await requests.cancel(sql, asMember(tom), r.id);
  const gone = await requests.settleCancel(sql, asMember(lea), r.id, { accept: true });
  assert.equal(gone.status, "cancelled");
  assert.equal(await left(), approvedLeft + 5);
  // Given back once only.
  await assert.rejects(requests.settleCancel(sql, asMember(lea), r.id, { accept: true }), refused("not_approved"));
  assert.equal(await left(), approvedLeft + 5);
  await assert.rejects(requests.restore(sql, asMember(tom), r.id), refused("not_pending"));
});

test("an HR person's own request goes to another HR person; the only HR person answers their own", async () => {
  const { sql } = database;
  const monday = quietMonday(160);
  const r = await requests.createRequest(sql, asMember(camille), { typeId: paid, ...week(monday) });
  // Camille is the only HR person: she may answer it.
  assert.equal((await requests.request(sql, asMember(camille), r.id)).mayDecide, true);
  chest.members.find(m => m.id === sofia.id)!.role = "hr";
  try {
    await assert.rejects(requests.decide(sql, asMember(camille), r.id, { verdict: "approve" }), refused("own_request"));
    assert.equal((await requests.decide(sql, asMember({ ...sofia, role: "hr" }), r.id, { verdict: "approve" })).status, "approved");
  } finally {
    chest.members.find(m => m.id === sofia.id)!.role = "employee";
  }
});

test("what waits for whom: a manager their people's, HR everyone's, an employee nothing", async () => {
  const { sql } = database;
  const monday = quietMonday(190);
  const h = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(monday) });
  const t = await requests.createRequest(sql, asMember(tom), { typeId: paid, ...week(monday) });
  const s = await requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(monday) });
  const ids = (list: { id: string }[]) => list.map(r => r.id);
  assert.ok(ids(await requests.waiting(sql, asMember(ines))).includes(h.id));
  assert.ok(!ids(await requests.waiting(sql, asMember(ines))).includes(t.id));
  assert.ok(!ids(await requests.waiting(sql, asMember(lea))).includes(h.id));
  const hr = ids(await requests.waiting(sql, asMember(camille)));
  assert.ok(hr.includes(h.id) && hr.includes(t.id) && hr.includes(s.id));
  await assert.rejects(requests.waiting(sql, asMember(hugo)), refused("forbidden"));
  // The calendar: colleagues see someone away, not why.
  const seenBySofia = await requests.between(sql, asMember(sofia), monday, addDays(monday, 6));
  assert.equal(seenBySofia.find(e => e.id === h.id)?.typeId, null);
  assert.equal(seenBySofia.find(e => e.id === s.id)?.typeId, paid);
  assert.equal((await requests.between(sql, asMember(ines), monday, addDays(monday, 6))).find(e => e.id === h.id)?.typeId, paid);
  assert.equal((await requests.between(sql, asMember(ines), monday, addDays(monday, 6))).find(e => e.id === t.id)?.typeId, null);
  await assert.rejects(requests.between(sql, asMember(nora), monday, monday), refused("forbidden"));
  await assert.rejects(requests.request(sql, asMember(sofia), h.id), refused("not_found"));
  await assert.rejects(requests.ofPerson(sql, asMember(lea), hugo.id), refused("not_found"));
  assert.ok(ids(await requests.ofPerson(sql, asMember(ines), hugo.id)).includes(h.id));
});

test("the bell: the approver hears of a request in their language, the requester of the answer in theirs; tiles count", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const monday = quietMonday(220);
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(monday) });
  await tell.asked(sql, asMember(hugo), r);
  const toInes = seen(chest.notifications.find(n => n.member === ines.id)!);
  assert.equal(toInes.title, "Hugo Bernard demande un congé");
  // One notice: English, with its French for the Chest to show her; no email from Leave.
  assert.equal(chest.notifications.find(n => n.member === ines.id)!.title, "Hugo Bernard asks for time off");
  assert.match(toInes.body ?? "", /^Congés payés · .+ · 5 jours$/u);
  assert.equal(toInes.path, `/chest/requests/${r.id}`);
  assert.ok((chest.badges.get(ines.id) ?? 0) >= 1);
  const answered = await requests.decide(sql, asMember(ines), r.id, { verdict: "refuse", reason: "Inventory" });
  await tell.answered(sql, asMember(ines), answered);
  const toHugo = seen(chest.notifications.find(n => n.member === hugo.id)!);
  assert.equal(toHugo.title, "Your time off is refused");
  assert.match(toHugo.body ?? "", /Inventory\nby Inès Moreau$/u);
  assert.ok(!chest.notifications.some(n => n.member === ines.id && n.key === `req:${r.id}`));
});

test("paid leave never goes below zero by default (French practice: an advance is the employer's to allow); HR recording it for someone is that advance", async () => {
  const { sql } = database;
  // A new company's paid leave (migration 0004 turned it off everywhere).
  await sql`update leave_types set overdraw = false where key = 'paid'`;
  try {
    const kind = (await types(sql)).find(t => t.key === "paid")!;
    assert.equal(kind.overdraw, false);
    // Sofia has no balance set: asking a week is refused.
    const monday = quietMonday(300);
    await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(monday) }), refused("not_enough"));
    // HR records it for her: an advance HR decided — allowed, approved.
    const advance = await requests.createRequest(sql, asMember(camille), { typeId: paid, memberId: sofia.id, ...week(monday) });
    assert.equal(advance.status, "approved");
    // HR allows it for everyone: the kind's switch.
    await saveType(sql, asMember(camille), paid, { overdraw: true });
    const asked = await requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(addDays(monday, 14)) });
    assert.equal(asked.status, "pending");
  } finally {
    await sql`update leave_types set overdraw = true where key = 'paid'`;
  }
});
