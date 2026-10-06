import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { toApp as POST } from "./support/app.ts";
import { AppError } from "../src/lib/app-error.ts";
import { checkName, listWatches, measured, purge, record, saveWatches, statuses, syncChest } from "../src/lib/checks.ts";
import { addComponent } from "../src/lib/components.ts";
import { pass } from "../src/lib/jobs.ts";
import { statusView } from "../src/lib/status-view.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, lea, nora, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
const editor = asMember(camille);
let website = "", shop = "";

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"], checks: { max: 10 } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`truncate incidents, components, subscribers, settings restart identity cascade`;
  chest.notifications.length = 0;
  website = (await addComponent(sql, editor, { name: "Website" })).id;
  shop = (await addComponent(sql, editor, { name: "Online shop" })).id;
});

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};

test("editors give services an https address to check; the whole list goes to the Chest", async () => {
  const { sql } = database;
  await saveWatches(sql, editor, [{ componentId: website, url: " https://atelier-martin.fr/ ", every: 5, expectStatus: 200, maxMs: 3000 }, { componentId: shop, url: "" }]);
  assert.deepEqual((await listWatches(sql)).map(w => [w.name, w.url, w.every]), [[checkName(website), "https://atelier-martin.fr/", 5]]);
  assert.equal(await syncChest(sql), "running");
  assert.deepEqual(chest.checks, [{ name: checkName(website), url: "https://atelier-martin.fr/", every: 5, expect: { status: 200, maxMs: 3000 } }]);
  // Saving again replaces the list: an emptied address is no longer checked.
  await saveWatches(sql, editor, [{ componentId: website, url: "" }, { componentId: shop, url: "https://shop.atelier-martin.fr/health", every: "1", expectStatus: "204", maxMs: "800" }]);
  await syncChest(sql);
  assert.deepEqual(chest.checks.map(c => [c.name, c.every, c.expect]), [[checkName(shop), 1, { status: 204, maxMs: 800 }]]);
});

test("addresses and settings are bounded; only editors may set them", async () => {
  const { sql } = database;
  for (const url of ["http://atelier-martin.fr/", "https://localhost/", "https://127.0.0.1/", "https://192.168.1.4/", "https://user:pw@atelier-martin.fr/", "ftp://x.fr/", "not a url", 42]) {
    await refuses("invalid_url", () => saveWatches(sql, editor, [{ componentId: website, url }]));
  }
  await refuses("invalid", () => saveWatches(sql, editor, [{ componentId: website, url: "https://a.fr/", every: 0 }]));
  await refuses("invalid", () => saveWatches(sql, editor, [{ componentId: website, url: "https://a.fr/", every: 61 }]));
  await refuses("invalid", () => saveWatches(sql, editor, [{ componentId: website, url: "https://a.fr/", expectStatus: 99 }]));
  await refuses("invalid", () => saveWatches(sql, editor, [{ componentId: website, url: "https://a.fr/", maxMs: 50 }]));
  await refuses("invalid", () => saveWatches(sql, editor, [{ componentId: "999", url: "https://a.fr/" }]));
  await refuses("forbidden", () => saveWatches(sql, asMember(nora), [{ componentId: website, url: "https://a.fr/" }]));
  await refuses("forbidden", () => saveWatches(sql, null, []));
  const many: { componentId: string; url: string }[] = [];
  for (let i = 0; i < 11; i++) many.push({ componentId: (await addComponent(sql, editor, { name: "S" + i })).id, url: `https://s${i}.fr/` });
  await refuses("too_many", () => saveWatches(sql, editor, many));
});

test("a Chest that cannot run checks: the addresses are kept, the tool says so and works on", async () => {
  const { sql } = database;
  const bare = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"] });
  try {
    await saveWatches(sql, editor, [{ componentId: website, url: "https://atelier-martin.fr/" }]);
    assert.equal(await syncChest(sql), "unavailable");
    assert.equal((await listWatches(sql)).length, 1);
  } finally {
    await bare.close();
  }
});

test("three failures in a row tell the editors once, in their language; answering again tells them once more", async () => {
  const { sql } = database;
  await saveWatches(sql, editor, [{ componentId: website, url: "https://atelier-martin.fr/" }]);
  await syncChest(sql);
  const name = checkName(website);
  const t0 = Date.now() - 60 * 60000;
  const at = (m: number) => new Date(t0 + m * 60000).toISOString();
  assert.equal(await chest.check(name, POST, { ok: false, status: 503, error: "status", at: at(0) }), 204);
  assert.equal(await chest.check(name, POST, { ok: false, status: 503, error: "status", at: at(5) }), 204);
  assert.equal(chest.notifications.length, 0, "two failures: nothing yet");
  const third = "chk_" + "c".repeat(26);
  await chest.check(name, POST, { id: third, ok: false, status: null, ms: 10000, error: "timeout", at: at(10) });
  await chest.check(name, POST, { id: third, ok: false, status: null, ms: 10000, error: "timeout", at: at(10) });
  const items = chest.notifications.filter(n => n.key === `check:${website}`);
  assert.deepEqual(items.map(n => n.member).sort(), [camille.id, lea.id, tom.id].sort(), "editors only, once");
  assert.equal(items.find(n => n.member === tom.id)!.title, "Website is not answering");
  assert.equal(items.find(n => n.member === tom.id)!.body, "Three checks in a row failed: no answer in time. Open an incident if customers are affected.");
  assert.equal(shownTo(items.find(n => n.member === camille.id)!, "fr").title, "Website ne répond plus");
  assert.equal(items[0]!.path, `/chest#check-${website}`);
  const s = (await statuses(sql)).get(website)!;
  assert.equal(s.downSince!.toISOString(), at(0));
  assert.equal(s.failures, 3);
  const [{ count }] = (await sql`select count(*)::int as count from incidents`) as unknown as [{ count: number }];
  assert.equal(count, 0, "never a public incident by itself");
  await chest.check(name, POST, { ok: false, error: "status", at: at(15) });
  assert.equal(chest.notifications.filter(n => n.key === `check:${website}`).length, 3, "still down: no more items");
  await chest.check(name, POST, { ok: true, at: at(20) });
  await chest.check(name, POST, { ok: true, at: at(25) });
  const back = chest.notifications.filter(n => n.key === `check:${website}`);
  assert.equal(back.length, 3, "the item is replaced, not doubled");
  assert.equal(back.find(n => n.member === tom.id)!.title, "Website answers again");
  assert.equal((await statuses(sql)).get(website)!.downSince, null);
});

test("results out of order count by their time; a result for no watched service is ignored; an unsigned one refused", async () => {
  const { sql } = database;
  await saveWatches(sql, editor, [{ componentId: website, url: "https://atelier-martin.fr/" }]);
  const now = Date.now();
  const r = (id: string, m: number, ok: boolean) => ({ id: "chk_" + id.repeat(26), name: checkName(website), at: new Date(now - m * 60000).toISOString(), ok, status: ok ? 200 : 500, ms: 100, error: ok ? null : "status" as const });
  assert.equal(await record(sql, r("a", 1, true)), null);
  assert.equal(await record(sql, r("b", 20, false)), null);
  assert.equal(await record(sql, r("d", 15, false)), null);
  assert.equal(await record(sql, r("e", 10, false)), null, "the latest result is up: not down");
  assert.equal(await record(sql, { ...r("f", 1, true), name: "c-424242" }), null);
  const response = await POST(new Request("http://tool.test/chest-checks", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});

test("measured uptime is the share of checks answered in time; the public page shows it beside the declared one; results go after 90 days", async () => {
  const { sql } = database;
  await saveWatches(sql, editor, [{ componentId: website, url: "https://atelier-martin.fr/" }]);
  const now = Date.now();
  let n = 0;
  const put = async (daysAgo: number, ok: boolean) => {
    const id = "chk_" + String.fromCharCode(97 + (n % 26)).repeat(13) + String.fromCharCode(97 + Math.floor(n / 26)).repeat(13);
    n++;
    await record(sql, { id, name: checkName(website), at: new Date(now - daysAgo * 86400000).toISOString(), ok, status: ok ? 200 : 503, ms: 90, error: ok ? null : "status" });
  };
  // Four checks in the first hour, one failed: no figure yet ("25 %"
  // would be false) — only the date the checks began.
  for (let i = 0; i < 3; i++) await put(1.5 - i / 1000, true);
  await put(1.5, false);
  const early = (await measured(sql, new Date(now - 90 * 86400000), new Date(now - 1.49 * 86400000))).get(website)!;
  assert.equal(early.count, 4);
  assert.equal(early.percent, null);
  // A day later, but still fewer than 24 checks: still no figure.
  assert.equal((await measured(sql, new Date(now - 90 * 86400000), new Date(now))).get(website)!.percent, null);
  for (let i = 0; i < 36; i++) await put(1 + i / 100, true);
  await put(120, false);
  const m = (await measured(sql, new Date(now - 90 * 86400000))).get(website)!;
  assert.equal(m.count, 40);
  assert.equal(m.percent, 97.5);
  const view = await statusView(sql, "Europe/Paris", new Date(now));
  assert.equal(view.entries.find(e => e.id === website)!.self!.measured!.percent, 97.5);
  assert.equal(view.entries.find(e => e.id === shop)!.self!.measured, null);
  assert.equal(await purge(sql, new Date(now)), 1);
  await put(100, true);
  await pass(sql, new Date(now));
  const [{ count }] = (await sql`select count(*)::int as count from check_results`) as unknown as [{ count: number }];
  assert.equal(count, 40, "the updates schedule purges too");
});
