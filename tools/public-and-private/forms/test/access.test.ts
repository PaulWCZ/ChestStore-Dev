import assert from "node:assert/strict";
import { test } from "node:test";
import { atLeast, can, levelOn, roleOf, type Ability } from "../src/lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("a manager may do everything; a creator creates; a member answers; no role, nothing", () => {
  const all: Ability[] = ["forms.create", "forms.all", "forms.answer", "privacy.erase"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(ines), a)), ["forms.create", "forms.answer"]);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["forms.answer"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
});

test("a level on a form: its owner and managers own it; a share gives editor or viewer; the rest, nothing", () => {
  const form = { owner: ines.id };
  assert.equal(levelOn(asMember(ines), form, null), "owner");
  assert.equal(levelOn(asMember(camille), form, null), "owner");
  assert.equal(levelOn(asMember(hugo), form, null), null);
  assert.equal(levelOn(asMember(hugo), form, "viewer"), "viewer");
  assert.equal(levelOn(asMember(nora), form, "editor"), null, "no role, no share");
  assert.ok(atLeast("owner", "editor") && atLeast("editor", "viewer") && !atLeast("viewer", "editor") && !atLeast(null, "viewer"));
});
