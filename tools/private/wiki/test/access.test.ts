import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleOf, spaceAccess, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, groups, hugo, ines, lea, nora, tom } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("an editor reads, writes and imports; a reader reads; no role, nothing", () => {
  const all: Ability[] = ["read", "write", "import"];
  assert.deepEqual(all.filter(a => can(asMember(ines), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["read"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a space open to everyone: editors write, readers read, no role sees nothing", () => {
  const open = { visibility: "everyone" as const, groups: [], createdBy: ines.id };
  assert.equal(spaceAccess(asMember(tom), open), "write");
  assert.equal(spaceAccess(asMember(hugo), open), "read");
  assert.equal(spaceAccess(asMember(nora), open), "none");
  assert.equal(spaceAccess(null, open), "none");
});

test("a space kept to groups: their members, its creator and the Chest's admins only", () => {
  const kept = { visibility: "groups" as const, groups: [groups.sales], createdBy: tom.id };
  assert.equal(spaceAccess(asMember(ines), kept), "write"); // sales, editor
  assert.equal(spaceAccess(asMember(hugo), kept), "read"); // sales, reader
  assert.equal(spaceAccess(asMember(tom), kept), "write"); // its creator
  assert.equal(spaceAccess(asMember(camille), kept), "write"); // admin
  assert.equal(spaceAccess(asMember(lea), kept), "none"); // tech
  assert.equal(spaceAccess(asMember({ ...nora, groups: [groups.sales] }), kept), "none"); // no role
});

test("a space edited by some: its groups and people, its creator and the admins write; other editors read; readers stay readers", () => {
  const some = { visibility: "everyone" as const, groups: [], createdBy: ines.id, editing: "some" as const, editors: [groups.tech, hugo.id] };
  assert.equal(spaceAccess(asMember(tom), some), "write"); // tech, editor
  assert.equal(spaceAccess(asMember(ines), some), "write"); // its creator
  assert.equal(spaceAccess(asMember(camille), some), "write"); // admin
  assert.equal(spaceAccess(asMember({ ...tom, id: "mbr_sofiaaaaaaaaaaaaaaaaaaaaa", groups: [] }), some), "read"); // an editor not named
  assert.equal(spaceAccess(asMember(hugo), some), "read"); // named, but a reader
  assert.equal(spaceAccess(asMember(lea), some), "read"); // tech, but a reader
  assert.equal(spaceAccess(asMember(nora), some), "none");
  // Seeing comes first: kept to sales, a tech editor named nowhere sees nothing.
  assert.equal(spaceAccess(asMember(tom), { ...some, visibility: "groups", groups: [groups.sales], editors: [] }), "none");
});
