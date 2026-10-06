import assert from "node:assert/strict";
import { test } from "node:test";
import { can, mayCheckIn, mayCreate, mayEdit, roleOf, type Ability } from "../src/lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, groups, hugo, ines, nora, sofia } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
const all: Ability[] = ["read", "comment", "cycles.manage", "settings.manage", "company.write", "team.write", "personal.write", "any.write"];

test("an admin may do everything; a member reads, comments, writes team and personal goals; no role, nothing", () => {
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["read", "comment", "team.write", "personal.write"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("who may create what: company for admins; a team's for its group's members (anyone for a named team); personal only when on", () => {
  const sales = { groupId: groups.sales, archived: false };
  const workshop = { groupId: null, archived: false };
  const old = { groupId: null, archived: true };
  assert.equal(mayCreate(asMember(camille), "company", null, false, camille.groups ?? []), true);
  assert.equal(mayCreate(asMember(hugo), "company", null, false, hugo.groups ?? []), false);
  assert.equal(mayCreate(asMember(hugo), "team", sales, false, hugo.groups ?? []), true);
  assert.equal(mayCreate(asMember(sofia), "team", sales, false, sofia.groups ?? []), false);
  assert.equal(mayCreate(asMember(camille), "team", sales, false, camille.groups ?? []), true);
  assert.equal(mayCreate(asMember(sofia), "team", workshop, false, sofia.groups ?? []), true);
  assert.equal(mayCreate(asMember(sofia), "team", old, false, sofia.groups ?? []), false);
  assert.equal(mayCreate(asMember(hugo), "team", null, false, hugo.groups ?? []), false);
  assert.equal(mayCreate(asMember(hugo), "personal", null, false, hugo.groups ?? []), false);
  assert.equal(mayCreate(asMember(hugo), "personal", null, true, hugo.groups ?? []), true);
  assert.equal(mayCreate(asMember(nora), "team", workshop, true, nora.groups ?? []), false);
  assert.equal(mayCreate(null, "team", workshop, true, []), false);
});

test("an objective is changed by its owner or an admin; a key result checked in by its owner or an admin", () => {
  assert.equal(mayEdit(asMember(hugo), { owner: hugo.id }), true);
  assert.equal(mayEdit(asMember(ines), { owner: hugo.id }), false);
  assert.equal(mayEdit(asMember(camille), { owner: hugo.id }), true);
  assert.equal(mayEdit(asMember(nora), { owner: nora.id }), false);
  assert.equal(mayCheckIn(asMember(ines), { owner: ines.id }), true);
  assert.equal(mayCheckIn(asMember(hugo), { owner: ines.id }), false);
  assert.equal(mayCheckIn(asMember(camille), { owner: ines.id }), true);
  assert.equal(mayCheckIn(null, { owner: ines.id }), false);
});
