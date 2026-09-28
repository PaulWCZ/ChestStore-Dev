import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, nora, tom } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("an editor may do everything; someone without a role, nothing", () => {
  const all: Ability[] = ["read", "incidents", "components", "subscribers"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(tom), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...tom, role: "ghost" })), null);
  assert.equal(roleOf(asMember(camille)), "editor");
});
