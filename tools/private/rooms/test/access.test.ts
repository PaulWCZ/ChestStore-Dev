import assert from "node:assert/strict";
import { test } from "node:test";
import { can, mayChange, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("an admin may everything; a member books for themselves; no role, nothing", () => {
  const all: Ability[] = ["book", "places.manage", "rules.manage", "bookings.any", "export"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["book"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
  assert.equal(roleOf(asMember({ ...hugo, role: "manager" })), null);
});

test("a booking is changed by whoever made it, or by an admin", () => {
  assert.equal(mayChange(asMember(hugo), hugo.id), true);
  assert.equal(mayChange(asMember(ines), hugo.id), false);
  assert.equal(mayChange(asMember(camille), hugo.id), true);
  assert.equal(mayChange(asMember(nora), nora.id), false);
  assert.equal(mayChange(null, hugo.id), false);
});
