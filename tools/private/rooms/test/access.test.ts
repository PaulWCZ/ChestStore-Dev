import assert from "node:assert/strict";
import { test } from "node:test";
import { can, mayChange, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora, tom } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("an admin may everything; an office manager books for anyone and runs the reception; a member books for themselves; no role, nothing", () => {
  const all: Ability[] = ["book", "places.manage", "rules.manage", "bookings.any", "export", "visitors.all"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(tom), a)), ["book", "bookings.any", "visitors.all"]);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["book"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
  assert.equal(roleOf(asMember({ ...hugo, role: "manager" })), "manager");
  assert.equal(roleOf(asMember({ ...hugo, role: "approver" })), null);
});

test("a booking is changed by whoever made it, an admin or an office manager", () => {
  assert.equal(mayChange(asMember(tom), hugo.id), true);
  assert.equal(mayChange(asMember(hugo), hugo.id), true);
  assert.equal(mayChange(asMember(ines), hugo.id), false);
  assert.equal(mayChange(asMember(camille), hugo.id), true);
  assert.equal(mayChange(asMember(nora), nora.id), false);
  assert.equal(mayChange(null, hugo.id), false);
});
