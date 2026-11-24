import assert from "node:assert/strict";
import { test } from "node:test";
import * as checks from "../checks.js";
import * as checksRules from "../checks-rules.js";
import { fakeChest } from "../testing.js";

test("a check's result reaches the tool, signed; anything else is refused", async () => {
  const fake = await fakeChest({ checks: { max: 2 } });
  try {
    assert.deepEqual(await checks.list(), []);
    await assert.rejects(checks.configure([{ name: "Web", url: "http://a.test/", every: 0 }]), (e: unknown) => (e as { code?: string }).code === "invalid_checks");
    await checks.configure([{ name: "website", url: "https://atelier-martin.test/", every: 5 }]);
    assert.deepEqual((await checks.list()).map(c => c.name), ["website"]);
    const seen: checks.CheckResult[] = [];
    const tool = (request: Request) => checks.handle(request, r => { seen.push(r); }).then(status => new Response(null, { status }));
    assert.equal(await fake.check("website", tool), 204);
    assert.equal(await fake.check("website", tool, { ok: false, status: null, ms: 10000, error: "timeout" }), 204);
    assert.deepEqual(seen.map(r => [r.name, r.ok, r.status, r.error]), [["website", true, 200, null], ["website", false, null, "timeout"]]);
    assert.match(seen[0]!.id, checks.checkIdPattern);
    // Unsigned, or at another path: 401.
    assert.equal(await checks.handle(new Request("http://tool.test/chest-checks", { method: "POST", body: "{}" }), () => {}), 401);
    await assert.rejects(fake.check("api", tool), /no check named api/u);
  } finally {
    await fake.close();
  }
});

test("the manifest's permission, and a list's rules: names, https addresses, 1 to 60 minutes, expectations", async () => {
  assert.deepEqual(checksRules.checkManifest(true), []);
  // studio.1's {max}: still read, bounds nothing.
  assert.deepEqual(checksRules.checkManifest({ max: 3 }), []);
  assert.deepEqual(checksRules.checkManifest({ max: 30 }), []);
  assert.equal(checksRules.checkManifest({ max: 0 }).length, 1);
  assert.equal(checksRules.checkManifest(false).length, 1);
  assert.equal(checksRules.checkManifest([]).length, 1);
  assert.equal(checksRules.checkManifest({ max: 3, every: 1 }).length, 1);
  // No number of checks (0.7.0-studio.2): the Chest paces its probes; 50 are taken.
  assert.equal("checks" in checks.limits, false);
  assert.equal(checks.limits.probesPerMinute, 60);
  const fake = await fakeChest({ checks: true });
  try {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `site-${i}`, url: `https://s${i}.test/`, every: 1 }));
    assert.equal((await checks.configure(many)).length, 50);
    assert.equal((await checks.list()).length, 50);
  } finally {
    await fake.close();
  }
  // A studio.1 test's {max} bounds nothing either.
  const legacy = await fakeChest({ checks: { max: 1 } });
  try {
    assert.equal((await checks.configure([{ name: "a", url: "https://a.test/", every: 5 }, { name: "b", url: "https://b.test/", every: 5 }])).length, 2);
  } finally {
    await legacy.close();
  }
  assert.deepEqual(checksRules.checkChecks([{ name: "website", url: "https://a.test/", every: 5, expect: { status: 200, maxMs: 3000 } }]), []);
  assert.deepEqual(checksRules.checkChecks([{ name: "local", url: "http://localhost:4000/", every: 1 }]), []);
  assert.ok(checksRules.checkChecks([{ name: "Web", url: "http://a.test/", every: 0 }]).length >= 3);
  assert.ok(checksRules.checkChecks([{ name: "a", url: "https://a.test/", every: 5 }, { name: "a", url: "https://b.test/", every: 5 }]).some(p => p.includes("two checks")));
  assert.ok(checksRules.checkChecks([{ name: "a", url: "https://a.test/", every: 5, expect: { maxMs: 50 } }]).length === 1);
});
