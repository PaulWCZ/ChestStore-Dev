import assert from "node:assert/strict";
import { test } from "node:test";
import { can, canChangeActivity, canDeleteRecord, canEditDeal, canRemoveFile, canUndoImport, ownsStep, roleOf, type Ability } from "../src/lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, lea, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
const all: Ability[] = ["read", "records.write", "records.delete.any", "activities.log", "deals.create", "deals.all", "assign", "stages", "fields", "import", "export.all"];

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

test("an import is undone by its author or a manager; a step by its owner, its planner or a manager; a file by who added it or a manager", () => {
  assert.equal(canUndoImport(asMember(hugo), { author: hugo.id }), true);
  assert.equal(canUndoImport(asMember(hugo), { author: ines.id }), false);
  assert.equal(canUndoImport(asMember(camille), { author: ines.id }), true);
  assert.equal(canUndoImport(asMember(lea), { author: lea.id }), false);
  assert.equal(ownsStep(asMember(hugo), { owner: hugo.id, createdBy: ines.id }), true);
  assert.equal(ownsStep(asMember(hugo), { owner: ines.id, createdBy: hugo.id }), true);
  assert.equal(ownsStep(asMember(hugo), { owner: ines.id, createdBy: ines.id }), false);
  assert.equal(ownsStep(asMember(camille), { owner: ines.id, createdBy: ines.id }), true);
  assert.equal(ownsStep(asMember(lea), { owner: lea.id, createdBy: lea.id }), false);
  assert.equal(canRemoveFile(asMember(hugo), { addedBy: hugo.id }), true);
  assert.equal(canRemoveFile(asMember(hugo), { addedBy: ines.id }), false);
  assert.equal(canRemoveFile(asMember(camille), { addedBy: ines.id }), true);
  assert.equal(canRemoveFile(asMember(lea), { addedBy: lea.id }), false);
});
