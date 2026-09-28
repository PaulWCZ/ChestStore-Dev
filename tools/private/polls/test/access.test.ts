import assert from "node:assert/strict";
import { test } from "node:test";
import { asked, can, edits, manages, namesShown, resultsState, roleOf, sees, type PollRights } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, groups, hugo, ines, lea, nora, sofia } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
const poll = (extra: Partial<PollRights> = {}): PollRights => ({ organiser: sofia.id, status: "open", everyone: true, groups: [], deleted: false, anonymous: false, results: "live", ...extra });

test("an organiser creates and answers; a member answers; no role, nothing", () => {
  assert.deepEqual([can(asMember(sofia), "create"), can(asMember(sofia), "answer")], [true, true]);
  assert.deepEqual([can(asMember(hugo), "create"), can(asMember(hugo), "answer")], [false, true]);
  assert.deepEqual([can(asMember(nora), "create"), can(asMember(nora), "answer")], [false, false]);
  assert.equal(can(null, "answer"), false);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("who is asked: everyone with a role, or the members of the poll's groups", () => {
  assert.equal(asked(asMember(hugo), poll()), true);
  assert.equal(asked(asMember(nora), poll()), false);
  const sales = poll({ everyone: false, groups: [groups.sales] });
  assert.equal(asked(asMember(hugo), sales), true);
  assert.equal(asked(asMember(lea), sales), false);
  assert.equal(asked(asMember(sofia), sales), false);
});

test("who sees a poll: those asked, its organiser, admins; a draft its organiser only; deleted, nobody", () => {
  const sales = poll({ everyone: false, groups: [groups.sales] });
  assert.equal(sees(asMember(lea), sales), false);
  assert.equal(sees(asMember(sofia), sales), true);
  assert.equal(sees(asMember(camille), sales), true, "an admin");
  assert.equal(sees(asMember(nora), poll()), false, "no role");
  const draft = poll({ status: "draft" });
  assert.equal(sees(asMember(sofia), draft), true);
  assert.equal(sees(asMember(camille), draft), false, "not even an admin");
  assert.equal(sees(asMember(hugo), draft), false);
  assert.equal(sees(asMember(sofia), poll({ deleted: true })), false);
});

test("who manages and edits: the organiser; an admin manages but does not rewrite", () => {
  assert.equal(manages(asMember(sofia), poll()), true);
  assert.equal(manages(asMember(camille), poll()), true);
  assert.equal(manages(asMember(hugo), poll()), false);
  assert.equal(manages(asMember(camille), poll({ status: "draft" })), false);
  assert.equal(edits(asMember(sofia), poll()), true);
  assert.equal(edits(asMember(camille), poll()), false);
  assert.equal(edits(asMember(sofia), poll({ status: "closed" })), false);
  // Deleted: its organiser and admins may still restore it.
  assert.equal(manages(asMember(sofia), poll({ deleted: true })), true);
  assert.equal(manages(asMember(hugo), poll({ deleted: true })), false);
  // A former organiser's poll: admins manage it.
  assert.equal(manages(asMember(camille), poll({ organiser: "erased" })), true);
});

test("when results show: live, or once closed; organisers always; anonymous only from five answers", () => {
  assert.equal(resultsState(asMember(hugo), poll(), 1), "shown");
  assert.equal(resultsState(asMember(hugo), poll({ results: "closed" }), 1), "after_close");
  assert.equal(resultsState(asMember(hugo), poll({ results: "closed", status: "closed" }), 1), "shown");
  assert.equal(resultsState(asMember(sofia), poll({ results: "closed" }), 1), "shown");
  assert.equal(resultsState(asMember(sofia), poll({ anonymous: true }), 4), "threshold");
  assert.equal(resultsState(asMember(camille), poll({ anonymous: true, status: "closed" }), 4), "threshold");
  assert.equal(resultsState(asMember(hugo), poll({ anonymous: true }), 5), "shown");
  // Names: named polls only, to those who see the results.
  assert.equal(namesShown(asMember(hugo), poll(), 3), true);
  assert.equal(namesShown(asMember(hugo), poll({ results: "closed" }), 3), false);
  assert.equal(namesShown(asMember(sofia), poll({ anonymous: true }), 9), false);
  assert.equal(namesShown(asMember(ines), poll({ anonymous: true }), 9), false);
});
