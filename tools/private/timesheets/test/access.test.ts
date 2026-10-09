import assert from "node:assert/strict";
import { test } from "node:test";
import { can, offered, roleOf, type Ability } from "../src/lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("a manager may do everything; a member records their own time; no role, nothing", () => {
  const all: Ability[] = ["time.own", "projects.manage", "projects.all", "reports.all", "lock", "import", "settings", "rates", "approve", "invoice"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["time.own"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a project is open to everyone, or to the people named on it; managers record on all open ones", () => {
  const open = { archived: false, everyone: true, people: [] };
  const named = { archived: false, everyone: false, people: [hugo.id] };
  const closed = { archived: true, everyone: true, people: [] };
  assert.ok(offered(asMember(hugo), open));
  assert.ok(offered(asMember(hugo), named));
  assert.ok(!offered(asMember({ ...hugo, id: "mbr_otheraaaaaaaaaaaaaaaaaaaaa" }), named));
  assert.ok(offered(asMember(camille), { ...named, people: [] }));
  assert.ok(!offered(asMember(camille), closed));
  assert.ok(!offered(asMember(nora), open));
  assert.ok(!offered(null, open));
});
