import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleOf, type Ability } from "../src/lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, ines, nora } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces (the job-level
// rights are tested with the services: test/jobs.test.ts, candidates.test.ts).
test("a recruiter may do everything; an interviewer only gives feedback; no role, nothing", () => {
  const all: Ability[] = ["jobs.manage", "candidates.manage", "candidates.erase", "feedback.give", "settings", "export"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(ines), a)), ["feedback.give"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...ines, role: "ghost" })), null);
  assert.equal(roleOf(asMember(camille)), "recruiter");
});
