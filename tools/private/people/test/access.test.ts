import assert from "node:assert/strict";
import { test } from "node:test";
import { can, recordAccess, roleOf, seesJourney, ticks, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora, paul } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("HR may do everything; a member reads and edits their own profile; no role, nothing", () => {
  const all: Ability[] = ["directory.read", "profile.own", "profile.job", "checklists.manage", "directory.import", "directory.export", "records.manage"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["directory.read", "profile.own"]);
  assert.deepEqual(all.filter(a => can(asMember(paul), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a checklist is seen by HR, its person, their manager and whoever has a step; ticked by HR and the step's person", () => {
  const journey = { personId: nora.id, managerId: ines.id, assignees: [hugo.id] };
  assert.equal(seesJourney(asMember(camille), journey), true);
  assert.equal(seesJourney(asMember(nora), journey), true);
  assert.equal(seesJourney(asMember(ines), journey), true);
  assert.equal(seesJourney(asMember(hugo), journey), true);
  assert.equal(seesJourney(asMember({ ...hugo, id: "mbr_" + "z".repeat(26) }), journey), false);
  assert.equal(seesJourney(asMember({ ...nora, role: null }), journey), false);
  assert.equal(seesJourney(null, journey), false);
  assert.equal(ticks(asMember(hugo), { assignee: hugo.id }), true);
  assert.equal(ticks(asMember(hugo), { assignee: nora.id }), false);
  assert.equal(ticks(asMember(camille), { assignee: nora.id }), true);
  assert.equal(ticks(asMember(paul), { assignee: paul.id }), false);
});

test("an employee record: HR edits it, its person reads it, nobody else (not even their manager) knows it exists", () => {
  const record = { memberId: nora.id };
  assert.equal(recordAccess(asMember(camille), record), "edit");
  assert.equal(recordAccess(asMember(nora), record), "read");
  assert.equal(recordAccess(asMember(ines), record), null);
  assert.equal(recordAccess(asMember({ ...nora, role: null }), record), null);
  assert.equal(recordAccess(null, record), null);
  // Someone without the Chest: HR only.
  assert.equal(recordAccess(asMember(hugo), { memberId: null }), null);
  assert.equal(recordAccess(asMember(camille), { memberId: null }), "edit");
});
