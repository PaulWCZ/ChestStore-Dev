import assert from "node:assert/strict";
import { test } from "node:test";
import { can, canBeApprover, mayDecide, roleOf, sightOf, type Ability } from "../lib/access.ts";
import { answerers } from "../lib/routing.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, lea, nora, sofia } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("HR may everything; a manager answers and sees their people; an employee asks and looks; no role, nothing", () => {
  const all: Ability[] = ["request", "calendar", "approve", "approve.any", "people.team", "people.all", "settings", "export"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(ines), a)), ["request", "calendar", "approve", "people.team"]);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["request", "calendar"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
  assert.ok(canBeApprover("hr") && canBeApprover("manager") && !canBeApprover("employee") && !canBeApprover(null));
});

test("who sees what of someone's leave: themselves and their approvers the details, colleagues only that they are away", () => {
  const hugosLeave = { memberId: hugo.id, approverId: ines.id };
  assert.equal(sightOf(asMember(hugo), hugosLeave), "own");
  assert.equal(sightOf(asMember(ines), hugosLeave), "approver");
  assert.equal(sightOf(asMember(camille), hugosLeave), "approver");
  assert.equal(sightOf(asMember(lea), hugosLeave), "team"); // a manager, not his
  assert.equal(sightOf(asMember(sofia), hugosLeave), "team");
  assert.equal(sightOf(asMember(nora), hugosLeave), null);
});

test("who answers: the named approver, HR for anyone, nobody their own — but the only HR person", () => {
  const hugosLeave = { memberId: hugo.id, approverId: ines.id };
  assert.ok(mayDecide(asMember(ines), hugosLeave, false));
  assert.ok(mayDecide(asMember(camille), hugosLeave, false));
  assert.ok(!mayDecide(asMember(lea), hugosLeave, false));
  assert.ok(!mayDecide(asMember(hugo), hugosLeave, false));
  assert.ok(!mayDecide(asMember(ines), { memberId: ines.id, approverId: null }, false));
  assert.ok(!mayDecide(asMember(camille), { memberId: camille.id, approverId: null }, false));
  assert.ok(mayDecide(asMember(camille), { memberId: camille.id, approverId: null }, true));
  assert.ok(!mayDecide(asMember(camille), { memberId: camille.id, approverId: ines.id }, true));
});

test("requests go to the named approver while they can answer, otherwise to HR", () => {
  const dir = [{ id: camille.id, role: "hr" }, { id: ines.id, role: "manager" }, { id: hugo.id, role: "employee" }, { id: sofia.id, role: "hr" }];
  assert.deepEqual(answerers({ memberId: hugo.id, approverId: ines.id }, dir), [ines.id]);
  assert.deepEqual(answerers({ memberId: hugo.id, approverId: null }, dir), [camille.id, sofia.id]);
  assert.deepEqual(answerers({ memberId: hugo.id, approverId: lea.id }, dir), [camille.id, sofia.id]); // Léa has no access here
  assert.deepEqual(answerers({ memberId: camille.id, approverId: null }, dir), [sofia.id]);
  assert.deepEqual(answerers({ memberId: camille.id, approverId: null }, dir.filter(p => p.id !== sofia.id)), [camille.id]);
  assert.deepEqual(answerers({ memberId: ines.id, approverId: hugo.id }, dir), [camille.id, sofia.id]); // an employee cannot answer
});
