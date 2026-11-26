import assert from "node:assert/strict";
import { test } from "node:test";
import { can, type Ability } from "../src/lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, lea, nora } from "./support/members.ts";

test("roles: admin everything; agent answers; viewer reads; no role nothing", () => {
  const all: Ability[] = ["tickets.read", "tickets.answer", "tickets.manage", "replies.manage", "tags.manage", "settings", "customers.erase", "export", "reports"];
  assert.deepEqual(all.filter(a => can(asMember(camille), a)), all);
  assert.deepEqual(all.filter(a => can(asMember(hugo), a)), ["tickets.read", "tickets.answer", "tickets.manage", "replies.manage", "export"]);
  assert.deepEqual(all.filter(a => can(asMember(lea), a)), ["tickets.read"]);
  assert.deepEqual(all.filter(a => can(asMember(nora), a)), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
});
