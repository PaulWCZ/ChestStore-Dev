import assert from "node:assert/strict";
import { test } from "node:test";
import { atLeast } from "@argentic/chest-app/testing";
import { catalogue } from "../src/i18n/index.ts";
import { balanceNotes, leftLine } from "../src/lib/balance-words.ts";
import { parseCsv, toCsv } from "../src/lib/csv.ts";
import { db, provide, type Sql } from "../src/lib/db.ts";
import { cut } from "../src/lib/notify.ts";
import { nameOf, plainName, type Person } from "../src/lib/people.ts";

// The small rules the pages, the files and the bell share, alone.
atLeast(5);

const figures = { left: 12.5, acquired: 10, earning: 2.5, carried: 0, deadline: "2027-05-31", perMonth: 2.08, pending: 2, until: null };

test("a balance in words: the same figures on every screen, the year said when the date is in another one", () => {
  const en = catalogue("en");
  assert.deepEqual(balanceNotes(figures, "acquired", "en", en, { thisYear: "2026" }), [
    "10 to take before 31 May 2027 (N-1)", "2.5 being earned (N)", en.balance.perMonth.replace("{days}", "2.08"), "2 days waiting for an answer",
  ]);
  assert.match(balanceNotes(figures, "acquired", "en", en, { thisYear: "2027" })[0]!, /before 31 May \(N-1\)$/u);
  assert.equal(balanceNotes(figures, "acquired", "en", en, { perMonth: false }).length, 3);
  assert.equal(leftLine({ left: 7.25, pending: 2 }, "en", en), "7.25 left · 2 waiting");
  assert.equal(leftLine({ left: 7.25, pending: 0 }, "fr", catalogue("fr")), catalogue("fr").balance.left.replace("{days}", "7,25"));
});

test("files: a cell a spreadsheet would run as a formula is defused; a French file uses ';' and keeps '12,5' bare; read back as written", () => {
  const text = toCsv([["Nom", "Jours"], ["=HYPERLINK(\"x\")", "12,5"], ["Line\nbreak", "-3"]], ";");
  assert.ok(text.startsWith("﻿"), "a byte order mark: Excel reads it as UTF-8");
  assert.equal(text, "﻿Nom;Jours\r\n\"'=HYPERLINK(\"\"x\"\")\";12,5\r\n\"Line\nbreak\";'-3\r\n");
  assert.deepEqual(parseCsv("a;b\r\n\"c;d\";\"e\"\"f\"\r\n"), [["a", "b"], ["c;d", "e\"f"]]);
});

test("the database: one pool, or the connection the tests give", () => {
  const given = { given: true } as unknown as Sql;
  provide(given);
  assert.equal(db(), given);
  provide(undefined);
});

test("the bell's texts are cut at a number of characters (not UTF-16 units), with an ellipsis", () => {
  assert.equal(cut("Congés  payés", 40), "Congés payés");
  assert.equal(cut("é".repeat(10), 5), "éééé…");
  assert.equal(cut("👍".repeat(10), 3), "👍👍…");
});

test("a person in words: a member's name; who left, lost access or was erased says so — never in payroll's files", () => {
  const person = (status: Person["status"], name = "Léa Dubois"): Person => ({ id: "mbr_" + "a".repeat(26), name, photo: null, status, locale: "fr" });
  assert.equal(nameOf(person("member"), "en"), "Léa Dubois");
  assert.equal(nameOf(person("former"), "en"), "Léa Dubois (former member)");
  assert.equal(nameOf(person("no_access"), "en"), "Léa Dubois (no access)");
  assert.equal(nameOf(person("no_access"), "fr"), "Léa Dubois (sans accès)");
  assert.equal(nameOf(person("erased", ""), "fr"), catalogue("fr").people.erased);
  assert.equal(nameOf(undefined, "de"), catalogue("en").people.unknown, "a language Leave does not speak is English");
  assert.equal(plainName(person("former"), "en"), "Léa Dubois");
  assert.equal(plainName(person("no_access"), "en"), "Léa Dubois");
});
