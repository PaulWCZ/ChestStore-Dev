import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { catalogue } from "../src/i18n/index.ts";
import { AppError } from "../src/lib/app-error.ts";
import { checkBudgets, levels } from "../src/lib/budgets.ts";
import { db, provide } from "../src/lib/db.ts";
import { everyoneOrNone, isManager, managerIds } from "../src/lib/directory.ts";
import { cut, notice, notify } from "../src/lib/notify.ts";
import { friday } from "../src/lib/reminder.ts";
import { removeStep } from "../src/lib/rates.ts";
import { saveReminder } from "../src/lib/settings.ts";
import { seenNow } from "../src/lib/weeks.ts";
import { transaction } from "../src/lib/tx.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// The small modules of src/lib/, each on its own (the services that use
// them have their own tests).
atLeast(10);
let database: TestDatabase;
let chest: FakeChest | undefined;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await chest?.close();
  await database.close();
});

test("a refusal is a code with its values, the package's own class", () => {
  const e = new AppError("too_long", { max: 80 });
  assert.equal(e.code, "too_long");
  assert.deepEqual(e.values, { max: 80 });
  assert.ok(e instanceof Error);
});

test("db() answers the connection given, and a transaction runs inside the caller's", async () => {
  provide(database.sql);
  assert.equal(db(), database.sql);
  const n = await transaction(db(), async tx => {
    const inner = await transaction(tx, async same => {
      assert.equal(same, tx, "the caller's transaction, not a new one");
      return (await same<{ n: number }[]>`select 1 as n`)[0]!.n;
    });
    return inner + 1;
  });
  assert.equal(n, 2);
});

test("outside a Chest, the directory says it could not be reached; nobody is a manager", async () => {
  assert.deepEqual(await everyoneOrNone(), { people: [], reached: false });
  assert.deepEqual(await managerIds(), []);
  assert.equal(await isManager(camille.id), false);
});

test("a bell item is cut to the Chest's length in characters, with an ellipsis", () => {
  assert.equal(cut("  a   b  ", 80), "a b");
  assert.equal(cut("é".repeat(81), 80), "é".repeat(79) + "…");
  assert.equal([...cut("😀".repeat(100), 80)].length, 80);
});

test("a notice is written once in every language: English its own words, French in its translations, each cut to the Chest's bounds", () => {
  const n = notice((t, locale) => ({ title: t.bell.emptyWeek + " " + "x".repeat(locale === "fr" ? 100 : 0), body: locale === "fr" ? "é".repeat(300) : "" }));
  assert.deepEqual(Object.keys(n).sort(), ["title", "translations"]);
  assert.equal(n.title, "Your week is empty — fill it in?");
  assert.equal([...n.translations!.fr!.title].length, 80);
  assert.equal([...n.translations!.fr!.body!].length, 280);
});

test("budget alerts are at 80 and 100 %, and a project without a budget rings nobody", async () => {
  assert.deepEqual([...levels], [80, 100]);
  chest = await fakeChest({ members: everyone, network: {} });
  await checkBudgets(database.sql, []);
  const [row] = await database.sql<{ id: string }[]>`insert into projects (name) values ('Free') returning id::text`;
  await checkBudgets(database.sql, [row!.id]);
  assert.equal(chest.notifications.length, 0);
});

test("a notice goes to members only, its French with it; none to an id the Chest does not know", async () => {
  await notify([hugo.id, "mbr_" + "z".repeat(26)], t => ({ title: t.bell.emptyWeek }), { path: "/chest", key: "week" });
  assert.equal(chest!.notifications.length, 1);
  assert.equal(chest!.notifications[0]!.title, "Your week is empty — fill it in?");
  assert.deepEqual(chest!.notifications[0]!.translations, { fr: { title: "Votre semaine est vide — la remplir\u202f?" } });
});

test("the Friday reminder, turned off, sends nothing", async () => {
  await saveReminder(database.sql, asMember(camille), { enabled: false, minutes: 2100 });
  assert.equal(await friday(database.sql, { id: "run_" + "a".repeat(26), name: "friday", scheduledAt: new Date().toISOString(), attempt: 1 }), 0);
});

test("a rate step taken back names a day: anything else is refused, never a server error", async () => {
  for (const from of ["x; drop", "2026-02-31", 12, null]) {
    await assert.rejects(removeStep(database.sql, asMember(camille), { kind: "cost", memberId: hugo.id, from }), (e: unknown) => e instanceof AppError && e.code === "invalid");
  }
});

test("the first day someone opened the tool is written once; later visits only read it", async () => {
  await seenNow(database.sql, hugo.id);
  await database.sql`update seen set first_seen = '2026-01-05' where member_id = ${hugo.id}`;
  await seenNow(database.sql, hugo.id);
  const [row] = await database.sql<{ d: string }[]>`select to_char(first_seen, 'YYYY-MM-DD') as d from seen where member_id = ${hugo.id}`;
  assert.equal(row!.d, "2026-01-05");
});
