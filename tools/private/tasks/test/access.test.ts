import assert from "node:assert/strict";
import { test } from "node:test";
import { boardAccess, can, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, groups, hugo, ines, lea, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("roles: a manager may everything; a member creates and imports; a viewer and no role, nothing", () => {
  const all: Ability[] = ["boards.create", "boards.all", "import"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["boards.create", "import"]);
  assert.deepEqual(all.filter(a => can(asMember(lea), a)), []);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a team board: members write, viewers comment, owners own, managers own everything", () => {
  const team = { visibility: "team" as const, people: [{ memberId: ines.id, owner: true }], groups: [] };
  assert.equal(boardAccess(asMember(ines), team), "own");
  assert.equal(boardAccess(asMember(hugo), team), "write");
  assert.equal(boardAccess(asMember(lea), team), "comment");
  assert.equal(boardAccess(asMember(camille), team), "own");
  assert.equal(boardAccess(asMember(nora), team), "none");
  assert.equal(boardAccess(null, team), "none");
});

test("a private board: only its people and the members of its groups see it", () => {
  const board = { visibility: "private" as const, people: [{ memberId: ines.id, owner: true }], groups: [groups.office] };
  assert.equal(boardAccess(asMember(ines), board), "own");
  assert.equal(boardAccess(asMember(hugo), board), "none");
  assert.equal(boardAccess(asMember(lea), board), "comment"); // in the office group
  assert.equal(boardAccess(asMember(camille), board), "own"); // manager
});
