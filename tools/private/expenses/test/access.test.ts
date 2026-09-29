import assert from "node:assert/strict";
import { test } from "node:test";
import { can, expenseAccess, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora, tom } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("an accountant may do everything; an approver approves; an employee owns; no role, nothing", () => {
  const all: Ability[] = ["own", "approve", "approve.all", "see.all", "settings", "pay", "export"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(ines), a)), ["own", "approve"]);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["own"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a draft is its owner's alone; a sent expense is seen by its approver and the accountants", () => {
  const draft = { owner: hugo.id, status: "draft", approver: null, assignedTo: ines.id };
  assert.deepEqual(expenseAccess(asMember(hugo), draft), { see: true, own: true, decide: false });
  for (const other of [camille, ines, tom, nora]) assert.equal(expenseAccess(asMember(other), draft).see, false);
  const sent = { ...draft, status: "submitted", approver: ines.id };
  assert.deepEqual(expenseAccess(asMember(hugo), sent), { see: true, own: true, decide: false });
  assert.deepEqual(expenseAccess(asMember(ines), sent), { see: true, own: false, decide: true });
  assert.deepEqual(expenseAccess(asMember(camille), sent), { see: true, own: false, decide: true });
  assert.deepEqual(expenseAccess(asMember(tom), sent), { see: false, own: false, decide: false });
  assert.equal(expenseAccess(asMember(nora), sent).see, false);
  // Approved: the approver still sees it, nobody decides again.
  assert.deepEqual(expenseAccess(asMember(ines), { ...sent, status: "approved" }), { see: true, own: false, decide: false });
  // Named approver now, though sent to the accountants: sees, does not decide.
  assert.deepEqual(expenseAccess(asMember(ines), { ...sent, approver: null }), { see: true, own: false, decide: false });
});

test("nobody approves their own expense, not even an accountant nobody was named to approve", () => {
  const own = { owner: ines.id, status: "submitted", approver: ines.id, assignedTo: ines.id };
  assert.equal(expenseAccess(asMember(ines), own).decide, false);
  const accountant = { owner: camille.id, status: "submitted", approver: null, assignedTo: null };
  assert.deepEqual(expenseAccess(asMember(camille), accountant), { see: true, own: true, decide: false });
  assert.equal(expenseAccess(asMember(camille), { ...accountant, assignedTo: ines.id, approver: ines.id }).decide, false);
  assert.equal(expenseAccess(asMember(ines), { ...accountant, assignedTo: ines.id, approver: ines.id }).decide, true);
});
