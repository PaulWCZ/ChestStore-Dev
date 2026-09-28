import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { GET } from "../app/chest/people/export/route.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setApprover } from "../lib/staff.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines } from "./support/members.ts";

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
});
after(async () => {
  await chest.close();
  await database.close();
});

const get = (who: typeof camille | null, query: string) => {
  const request = new Request("http://tool.test/chest/people/export" + query);
  return GET(who ? withMember(request, who) : request);
};

test("the payroll CSV: HR gets it in their language (French: ';' and decimal commas); others are refused", async () => {
  const fr = await get(camille, "?month=" + month);
  assert.equal(fr.status, 200);
  assert.match(fr.headers.get("content-disposition") ?? "", new RegExp(`conges-${month}\\.csv`, "u"));
  const text = await fr.text();
  const [header, line] = text.replace(/^﻿/u, "").split("\r\n");
  assert.equal(header, "Personne;Type;Premier jour;Depuis;Dernier jour;Jusqu’à;Jours ce mois-ci;Jours au total");
  assert.match(line ?? "", /^Hugo Bernard;Congés payés;\d{4}-\d{2}-\d{2};matin;\d{4}-\d{2}-\d{2};soir;5;5$/u);
  const en = await get({ ...camille, locale: "en" }, "?month=" + month);
  assert.match((await en.text()).split("\r\n")[0] ?? "", /Person,Kind,First day/u);
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
