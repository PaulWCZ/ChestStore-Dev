import assert from "node:assert/strict";
import { test } from "node:test";
import type { Answer } from "../src/lib/answers.ts";
import { cell, toCsv } from "../src/lib/csv.ts";
import { exportRows, summaryRows } from "../src/lib/export.ts";
import type { Form } from "../src/lib/forms.ts";
import { catalogue } from "../src/i18n/index.ts";
import type { Definition } from "../src/shared/model.ts";
import type { Person } from "../src/lib/people.ts";
import { nps, summarise } from "../src/shared/summary.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { statsOf } from "./support/stats.ts";

test("CSV: a byte-order mark, quotes where needed, and no cell a spreadsheet would run", () => {
  const csv = toCsv([["Name", "Note"], ["=HYPERLINK(\"http://evil\")", "+1"], ["  @SUM(A1)", "-2"], ["\tTab", "line\nbreak"], [3.5, -4]], ",");
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  // A phone number or a signed number typed as text runs nothing: kept.
  assert.equal(lines[1], `"'=HYPERLINK(""http://evil"")",+1`);
  assert.equal(lines[2], "'  @SUM(A1),-2");
  assert.equal(lines[3], `'\tTab,"line\nbreak"`.replace("\n", "\n"));
  // Phone numbers stay as typed; a sign before anything else is still guarded.
  const more = toCsv([["+33 6 12 34 56 78", "-1+cmd|' /C calc'!A0", "+1 (555) 010-9999", "+SUM(1)"]], ";").slice(1).split("\r\n")[0];
  assert.equal(more, "+33 6 12 34 56 78;'-1+cmd|' /C calc'!A0;+1 (555) 010-9999;'+SUM(1)");
  assert.ok(csv.includes("\r\n3.5,-4\r\n"), "numbers stay numbers");
  assert.equal(cell(3.5, ";"), "3,5", "a French spreadsheet reads a decimal comma");
  assert.equal(cell("a;b", ";"), '"a;b"');
  assert.equal(cell("a,b", ";"), "a,b");
});

function setup(anonymous: boolean) {
  const colour = q("choice", "Colour", { options: opts("Red", "Blue") });
  const score = q("scale", "Score", { from: 0, to: 10 });
  const gone = q("short", "Old question");
  const v1: Definition = form([colour, score, gone], "Survey");
  const v2: Definition = { ...structuredClone(v1), pages: [{ ...structuredClone(v1.pages[0]!), questions: [structuredClone(colour), structuredClone(score)] }] };
  v2.pages[0]!.questions[0]!.title = "Favourite colour";
  const versions = new Map([[1, v1], [2, v2]]);
  const [red, blue] = colour.options!.map(o => o.id) as [string, string];
  const a = (id: string, version: number, data: Answer["data"], respondent: string | null, createdAt: string | null): Answer => ({ id, version, data, respondent, email: null, createdAt, month: "2026-09-01", language: "en", status: "new", note: "", handledAt: null, sent: [], hidden: {} });
  const answers = [
    a("aaaaaaaaaaaaaaaa", 1, { [colour.id]: { ids: [red] }, [score.id]: 10, [gone.id]: "=cmd" }, anonymous ? null : "mbr_hugoaaaaaaaaaaaaaaaaaaaaaa", anonymous ? null : "2026-09-20T10:00:00Z"),
    a("bbbbbbbbbbbbbbbb", 2, { [colour.id]: { ids: [blue] }, [score.id]: 3 }, null, anonymous ? null : "2026-09-21T10:00:00Z"),
    a("cccccccccccccccc", 2, { [colour.id]: { ids: [red] }, [score.id]: 8 }, null, anonymous ? null : "2026-09-22T10:00:00Z"),
  ];
  const f = { anonymous, draft: v2 } as unknown as Form;
  return { f, versions, answers, colour, score, gone };
}

test("the export: the latest wording, removed questions marked, labels not ids, numbers as numbers", () => {
  const { f, versions, answers } = setup(false);
  const names = new Map<string, Person>([["mbr_hugoaaaaaaaaaaaaaaaaaaaaaa", { id: "mbr_hugoaaaaaaaaaaaaaaaaaaaaaa", name: "Hugo Bernard", photo: null, status: "member", locale: "en" }]]);
  const rows = exportRows({ form: f, answers, versions, t: catalogue("en"), locale: "en", zone: "Europe/Paris", names });
  assert.deepEqual(rows[0], ["Date", "Who", "Favourite colour", "Score", "Old question (Removed from the form)", "Follow-up", "Note", "Form version"]);
  assert.deepEqual(rows[1], ["20/09/2026, 12:00", "Hugo Bernard", "Red", 10, "=cmd", "New", "", 1]);
  assert.deepEqual(rows[2]!.slice(1), ["Visitor", "Blue", 3, "", "New", "", 2]);
  assert.ok(toCsv(rows).includes("'=cmd"));
});

test("an anonymous form's export is its summary: counts and shares, never one person's row", () => {
  const { f, versions, answers } = setup(true);
  assert.equal(f.anonymous, true);
  const rows = summaryRows({ stats: statsOf(answers, versions), versions, t: catalogue("fr") });
  assert.deepEqual(rows[0], ["Question", "Réponse", "Nombre", "Part (%)"]);
  assert.deepEqual(rows[1], ["Réponses", "", 3, ""]);
  assert.ok(rows.some(r => r[0] === "Favourite colour" && r[1] === "Red" && r[2] === 2));
  assert.ok(!JSON.stringify(rows).includes("mbr_"));
  assert.ok(!JSON.stringify(rows).includes("=cmd"), "no free text in the summary rows");
  // No line holds two answers of one person: every line is one question.
  assert.ok(rows.slice(2).every(r => r.length === 4));
});

test("the summary: bars across versions, averages, and the NPS", () => {
  const { versions, answers, colour, score } = setup(false);
  const s = summarise(versions, statsOf(answers, versions), { yes: "Yes", no: "No", other: "Other" });
  const c = s.find(x => x.column.question.id === colour.id)!;
  assert.equal(c.column.question.title, "Favourite colour");
  assert.deepEqual(c.stat.type === "bars" && c.stat.bars.map(b => [b.label, b.count, b.share]), [["Red", 2, 66.7], ["Blue", 1, 33.3]]);
  const n = s.find(x => x.column.question.id === score.id)!;
  assert.ok(n.stat.type === "average");
  if (n.stat.type === "average") {
    assert.equal(n.stat.average, 7);
    assert.deepEqual(n.stat.nps, { score: 0, promoters: 1, passives: 1, detractors: 1 });
  }
  assert.ok(s.some(x => x.column.removed && x.column.question.title === "Old question"));
  assert.deepEqual(nps([10, 9, 9, 7, 2]), { score: 40, promoters: 3, passives: 1, detractors: 1 });
  assert.equal(nps([]), null);
});
