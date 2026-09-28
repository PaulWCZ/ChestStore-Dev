import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { parseCsv, toCsv } from "../lib/csv.ts";
import { cycleCsv, fileName } from "../lib/export.ts";
import { catalogue } from "../lib/i18n/index.ts";
import { checkIn } from "../lib/key-results.ts";
import { createObjective } from "../lib/objectives.ts";
import { asMember } from "./support/member.ts";
import { camille, ines, nora } from "./support/members.ts";
import { companyObjective, running, world, type World } from "./support/world.ts";

let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

test("a cycle as a spreadsheet: one row per key result, in the reader's language and number format", async () => {
  const { sql } = w.database;
  const { cycle, sales } = await running(w);
  const company = await companyObjective(w, cycle.id);
  await checkIn(sql, asMember(ines), company.keyResults[0]!.id, { value: "7,5", confidence: "at_risk" });
  await createObjective(sql, asMember(ines), { cycleId: cycle.id, level: "team", teamId: sales.id, parentId: company.id, title: "=HYPERLINK(\"x\")" });
  const fr = await cycleCsv(sql, asMember(camille), cycle.id, catalogue("fr"), "fr", "Europe/Paris");
  const rows = parseCsv(fr.csv);
  assert.equal(rows[0]![0], "Niveau");
  assert.equal(rows[0]!.length, 18);
  assert.deepEqual(rows[1]!.slice(0, 3), ["Entreprise", "", "Win 20 new customers"]);
  assert.deepEqual(rows[1]!.slice(6, 15), ["Customers signed", "Inès Moreau", "Un nombre", "0", "20", "7,5", "customers", "38", "À risque"]);
  assert.deepEqual(rows[2]!.slice(6, 12), ["Website live", "Hugo Bernard", "Fait ou pas", "", "", "Pas encore"]);
  // A title a spreadsheet would run is written as text.
  assert.equal(rows[3]![2], "'=HYPERLINK(\"x\")");
  assert.equal(rows[3]![1], "Sales");
  assert.equal(rows[3]![3], "Win 20 new customers");
  const en = parseCsv((await cycleCsv(sql, asMember(ines), cycle.id, catalogue("en"), "en", "Europe/Paris")).csv);
  assert.deepEqual([en[0]![0], en[1]![11], en[1]![14]], ["Level", "7.5", "At risk"]);
  await assert.rejects(cycleCsv(sql, asMember(nora), cycle.id, catalogue("en"), "en", "Europe/Paris"), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  await assert.rejects(cycleCsv(sql, asMember(ines), "404", catalogue("en"), "en", "Europe/Paris"), (e: unknown) => e instanceof AppError && e.code === "not_found");
  assert.equal(fileName(cycle.name, "csv"), cycle.name.replace(" ", "-") + ".csv");
});

test("CSV: quotes, separators and negative numbers survive", () => {
  const text = toCsv([["a;b", "say \"hi\"", -3, "-x", "line\nbreak"]], ";");
  assert.deepEqual(parseCsv(text), [["a;b", "say \"hi\"", "-3", "'-x", "line\nbreak"]]);
});
