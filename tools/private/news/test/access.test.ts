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

// Audience: a post for everyone, or for some groups.
test("a post kept to groups: its members, its author and the admins see it; only its members are its audience", async () => {
  const { inAudience, seesPost } = await import("../lib/access.ts");
  const { groups, sofia, lea } = await import("./support/members.ts");
  const sales = { groups: [groups.sales], people: [], author: sofia.id };
  const open = { groups: [], people: [], author: sofia.id };
  assert.equal(inAudience(asMember(hugo), sales), true);
  assert.equal(inAudience(asMember(lea), sales), false);
  assert.equal(inAudience(asMember(lea), open), true);
  assert.equal(inAudience(asMember(camille), { groups: [groups.sales, groups.office], people: [] }), true);
  assert.equal(seesPost(asMember(hugo), sales), true);
  assert.equal(seesPost(asMember(lea), sales), false);
  assert.equal(seesPost(asMember(sofia), sales), true, "its author");
  assert.equal(inAudience(asMember(sofia), sales), false);
  assert.equal(seesPost(asMember(camille), sales), true, "an admin");
  assert.equal(inAudience(asMember(camille), sales), false);
  assert.equal(seesPost(asMember({ ...lea, role: "publisher" }), sales), false, "a publisher outside it");
});
