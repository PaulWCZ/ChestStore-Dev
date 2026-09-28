import assert from "node:assert/strict";
import { test } from "node:test";
import { can, canChangeActivity, canDeleteRecord, canEditDeal, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, lea, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
const all: Ability[] = ["read", "records.write", "records.delete.any", "activities.log", "deals.create", "deals.all", "assign", "stages", "import"];

test("a manager may everything; sales work on clients; a viewer reads; no role, nothing", () => {
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["read", "records.write", "activities.log", "deals.create", "assign", "import"]);
  assert.deepEqual(all.filter(a => can(asMember(lea), a)), ["read"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a deal is changed by its owner, a manager, or anyone of sales while nobody owns it", () => {
  assert.equal(canEditDeal(asMember(hugo), { owner: hugo.id }), true);
  assert.equal(canEditDeal(asMember(hugo), { owner: ines.id }), false);
  assert.equal(canEditDeal(asMember(hugo), { owner: null }), true);
  assert.equal(canEditDeal(asMember(camille), { owner: ines.id }), true);
  assert.equal(canEditDeal(asMember(lea), { owner: lea.id }), false);
  assert.equal(canEditDeal(asMember(nora), { owner: null }), false);
});

test("a record is deleted by a manager or its owner; a logged activity is edited by its author", () => {
  assert.equal(canDeleteRecord(asMember(camille), { owner: hugo.id }), true);
  assert.equal(canDeleteRecord(asMember(hugo), { owner: hugo.id }), true);
  assert.equal(canDeleteRecord(asMember(hugo), { owner: ines.id }), false);
  assert.equal(canDeleteRecord(asMember(lea), { owner: lea.id }), false);
  assert.equal(canChangeActivity(asMember(hugo), { author: hugo.id }, "edit"), true);
  assert.equal(canChangeActivity(asMember(hugo), { author: ines.id }, "remove"), false);
  assert.equal(canChangeActivity(asMember(camille), { author: ines.id }, "remove"), true);
  assert.equal(canChangeActivity(asMember(camille), { author: ines.id }, "edit"), false);
  assert.equal(canChangeActivity(asMember(lea), { author: lea.id }, "edit"), false);
});
