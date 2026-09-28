import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("an administrator hosts and sees everyone's bookings; a host only hosts; no role, nothing", () => {
  const all: Ability[] = ["host", "bookings.all", "settings"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["host"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});
