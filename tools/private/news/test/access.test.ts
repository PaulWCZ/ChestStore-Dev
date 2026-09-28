import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, stranger } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("a publisher does everything; a reader reads and takes part; no role, nothing", () => {
  const all: Ability[] = ["read", "react", "publish", "moderate", "confirmations"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["read", "react"]);
  assert.deepEqual(all.filter(a => can(asMember(stranger), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
  assert.equal(roleOf(asMember({ ...hugo, role: "publisher" })), "publisher");
});
