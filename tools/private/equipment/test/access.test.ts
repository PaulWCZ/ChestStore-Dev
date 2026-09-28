import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("a manager may do everything; a member browses and reports; no role, nothing", () => {
  const all: Ability[] = ["items.browse", "items.manage", "report"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["items.browse", "report"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
  assert.equal(roleOf(asMember(camille)), "manager");
});
