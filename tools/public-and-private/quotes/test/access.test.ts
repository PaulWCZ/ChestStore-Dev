import assert from "node:assert/strict";
import { test } from "node:test";
import { can, issuers, roleOf, type Ability } from "../lib/access.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, lea, nora, sofia } from "./support/members.ts";

// Each role's rights, one by one: what the server enforces.
test("admin, billing, sales, viewer: what each may do", () => {
  const all: Ability[] = ["read", "settings", "clients.write", "catalogue.write", "quotes.write", "invoices.draft", "invoices.issue", "payments", "export"];
  const rights = (m: typeof camille) => all.filter(a => can(asMember(m), a));
  assert.deepEqual(rights(camille), all);
  assert.deepEqual(rights(sofia), ["read", "clients.write", "catalogue.write", "quotes.write", "invoices.draft", "invoices.issue", "payments", "export"]);
  assert.deepEqual(rights(hugo), ["read", "clients.write", "catalogue.write", "quotes.write", "invoices.draft"]);
  assert.deepEqual(rights(lea), ["read", "export"]);
  assert.deepEqual(rights(nora), []);
  assert.deepEqual(all.filter(a => can(null, a)), []);
  assert.equal(roleOf(asMember({ ...hugo, role: "ghost" })), null);
  assert.deepEqual(issuers, ["admin", "billing"]);
});
