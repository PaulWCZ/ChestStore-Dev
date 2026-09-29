import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { GET } from "../app/chest/people/export/route.ts";
import * as requests from "../lib/requests.ts";
import { saveType, types } from "../lib/rules.ts";
import { AppError } from "../lib/app-error.ts";
import { setApprover, setEmployeeNumber } from "../lib/staff.ts";
import { GET as balancesCsv } from "../app/chest/people/balances/route.ts";
import * as balances from "../lib/balances.ts";
import { today } from "../lib/model.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let month: string;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: fakeGroups });
  const { sql } = database;
  await setApprover(sql, asMember(camille), hugo.id, ines.id);
  const paid = (await types(sql)).find(t => t.key === "paid")!.id;
  const monday = quietMonday(20);
  month = monday.slice(0, 7);
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(monday), note: "=HYPERLINK(\"x\")" });
  await requests.decide(sql, asMember(ines), r.id, { verdict: "approve" });
  await setEmployeeNumber(sql, asMember(camille), hugo.id, "0042");
});
after(async () => {
  await chest.close();
  await database.close();
});

const get = (who: typeof camille | null, query: string) => {
  const request = new Request("http://tool.test/chest/people/export" + query);
  return GET(who ? withMember(request, who) : request);
};

test("the payroll CSV: HR gets it in their language (French: ';' and decimal commas), with each kind's payroll code; others are refused", async () => {
  const fr = await get(camille, "?month=" + month);
  assert.equal(fr.status, 200);
  assert.match(fr.headers.get("content-disposition") ?? "", new RegExp(`conges-${month}\\.csv`, "u"));
  const text = await fr.text();
  const [header, line] = text.replace(/^﻿/u, "").split("\r\n");
  assert.equal(header, "Matricule;Personne;Type;Code paie;Premier jour;Depuis;Dernier jour;Jusqu’à;Jours ce mois-ci;Jours au total");
  assert.match(line ?? "", /^0042;Hugo Bernard;Congés payés;CP;\d{4}-\d{2}-\d{2};matin;\d{4}-\d{2}-\d{2};soir;5;5$/u);
  const en = await get({ ...camille, locale: "en" }, "?month=" + month);
  assert.match((await en.text()).split("\r\n")[0] ?? "", /Employee number,Person,Kind,Payroll code,First day/u);
  assert.equal((await get(ines, "?month=" + month)).status, 403);
  assert.equal((await get(camille, "?month=nope")).status, 400);
  assert.equal((await get(null, "?month=" + month)).status, 401);
});

test("asking to cancel reaches the approver; the answer reaches the requester", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const [mine] = await requests.mine(sql, asMember(hugo));
  await requests.cancel(sql, asMember(hugo), mine!.id);
  await tell.cancelAsked(sql, asMember(hugo), await requests.request(sql, asMember(hugo), mine!.id));
  assert.equal(chest.notifications.find(n => n.member === ines.id)?.title, "Hugo Bernard demande l’annulation d’un congé");
  const settled = await requests.settleCancel(sql, asMember(ines), mine!.id, { accept: true });
  await tell.cancelSettled(sql, asMember(ines), settled);
  assert.equal(chest.notifications.find(n => n.member === hugo.id)?.title, "Your leave is cancelled");
});

test("the balances CSV: paid leave N-1 and N as the pay slip shows them, leave to come apart, those who left included; HR only", async () => {
  const { sql } = database;
  const paid = (await types(sql)).find(t => t.key === "paid")!.id;
  await balances.setOpening(sql, asMember(camille), { memberId: ines.id, typeId: paid, days: "10", earning: "3,5", onDate: today() });
  const call = (who: typeof camille | null, query = "") => {
    const request = new Request("http://tool.test/chest/people/balances" + query);
    return balancesCsv(who ? withMember(request, who) : request);
  };
  const fr = await call(camille);
  assert.equal(fr.status, 200);
  const lines = (await fr.text()).replace(/^\uFEFF/u, "").split("\r\n");
  assert.match(lines[0]!, /^Matricule;Personne;Date d’entrée;Dernier jour;Congés payés \(CP\) N-1 acquis;Congés payés \(CP\) N-1 pris;Congés payés \(CP\) N-1 solde;Congés payés \(CP\) N acquis;Congés payés \(CP\) N pris par anticipation;Congés payés \(CP\) N solde;Congés payés \(CP\) reportés;Congés payés \(CP\) validés à venir;Congés payés \(CP\) restants;Congés payés \(CP\) en attente de réponse;RTT \(RTT\) validés à venir;RTT \(RTT\) restants/u);
  const inesLine = lines.find(l => l.includes("Inès Moreau"))!;
  assert.match(inesLine, /^;Inès Moreau;;;10;0;10;3,5;0;3,5;0;0;13,5;0;/u);
  assert.equal(lines.find(l => l.includes("Hugo Bernard"))!.split(";")[0], "0042");
  // An approved week still to come: apart, not taken yet.
  const r = await requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(quietMonday(40)) });
  await requests.decide(sql, asMember(camille), r.id, { verdict: "approve" });
  const again = (await (await call(camille)).text()).split("\r\n").find(l => l.includes("Sofia Rossi"))!.split(";");
  assert.equal(again[11], "5");
  assert.equal((await call(ines)).status, 403);
  assert.equal((await call(camille, "?on=2999-01-01")).status, 400);
  assert.equal((await call(null)).status, 401);
});

test("a payroll code HR changes (or removes) is the one both files carry", async () => {
  const { sql } = database;
  const all = await types(sql);
  const paid = all.find(t => t.key === "paid")!;
  // The defaults: the usual French codes.
  assert.deepEqual(Object.fromEntries(all.map(t => [t.key, t.payrollCode])), { paid: "CP", rtt: "RTT", unpaid: "CSS", sick: "MAL", other: null, family: "EVF", remote: null });
  const monday = quietMonday(150);
  await requests.createRequest(sql, asMember(camille), { typeId: paid.id, memberId: hugo.id, ...week(monday) });
  const month = monday.slice(0, 7);
  await saveType(sql, asMember(camille), paid.id, { payrollCode: " cp01 " });
  const header = (await (await get({ ...camille, locale: "en" }, "?month=" + month)).text()).split("\r\n");
  assert.match(header[1] ?? "", /^0042,Hugo Bernard,Paid leave,CP01,/u);
  await assert.rejects(saveType(sql, asMember(camille), paid.id, { payrollCode: "congés payés" }), (e: unknown) => e instanceof AppError && e.code === "bad_code");
  await assert.rejects(saveType(sql, asMember(ines), paid.id, { payrollCode: "X" }), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  await saveType(sql, asMember(camille), paid.id, { payrollCode: "" });
  const line = (await (await get({ ...camille, locale: "en" }, "?month=" + month)).text()).split("\r\n")[1] ?? "";
  assert.match(line, /^0042,Hugo Bernard,Paid leave,,/u);
  await saveType(sql, asMember(camille), paid.id, { payrollCode: "CP" });
});
