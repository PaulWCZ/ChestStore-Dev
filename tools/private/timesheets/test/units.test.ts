import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { catalogue } from "../src/i18n/index.ts";
import { AppError } from "../src/lib/app-error.ts";
import { checkBudgets, levels } from "../src/lib/budgets.ts";
import { db, provide } from "../src/lib/db.ts";
import { everyoneOrNone, isManager, managerIds } from "../src/lib/directory.ts";
import { email, letterText } from "../src/lib/mail.ts";
import { cut, notify } from "../src/lib/notify.ts";
import { friday } from "../src/lib/reminder.ts";
import { saveReminder } from "../src/lib/settings.ts";
import { transaction } from "../src/lib/tx.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// The small modules of src/lib/, each on its own (the services that use
// them have their own tests).
atLeast(8);
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

test("an email's text: its lines, the link to the page, why it came", () => {
  const t = catalogue("en");
  const text = letterText(t, { subject: "x", lines: ["Line one"] }, "/chest?week=2026-09-28", "https://timesheets-chest.chest.test");
  assert.equal(text, `Line one\n\nOpen it: https://timesheets-chest.chest.test/chest?week=2026-09-28\n\n—\n${t.mail.why}`);
  assert.doesNotMatch(letterText(t, { subject: "x", lines: ["Line one"] }, "/chest", null), /Open it/u);
});

test("budget alerts are at 80 and 100 %, and a project without a budget rings nobody", async () => {
  assert.deepEqual([...levels], [80, 100]);
  chest = await fakeChest({ members: everyone, network: {} });
  await checkBudgets(database.sql, []);
  const [row] = await database.sql<{ id: string }[]>`insert into projects (name) values ('Free') returning id::text`;
  await checkBudgets(database.sql, [row!.id]);
  assert.equal(chest.notifications.length, 0);
});

test("a bell item and an email go to members only, each in their language; none to an id the Chest does not know", async () => {
  await notify([hugo.id, "mbr_" + "z".repeat(26)], t => ({ title: t.bell.emptyWeek }), { path: "/chest", key: "week" });
  assert.equal(chest!.notifications.length, 1);
  // Without the mail permission nothing leaves, and nothing fails.
  assert.equal(await email([hugo.id], t => ({ subject: t.bell.emptyWeek, lines: [] }), { path: "/chest", key: "test" }), 0);
});

test("the Friday reminder, turned off, sends nothing", async () => {
  await saveReminder(database.sql, asMember(camille), { enabled: false, minutes: 2100 });
  assert.equal(await friday(database.sql, { id: "run_" + "a".repeat(26), name: "friday", scheduledAt: new Date().toISOString(), attempt: 1 }), 0);
});
