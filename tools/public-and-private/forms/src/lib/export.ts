import type { Answer } from "./answers.ts";
import type { Form } from "./forms.ts";
import { formatDate, type Catalogue } from "../i18n/index.ts";
import { answerText, isGrid } from "../shared/logic.ts";
import type { Definition, Question } from "../shared/model.ts";
import { nameOf, type Person } from "./people.ts";
import { columnsOf, optionLabels, summarise, type Stats } from "../shared/summary.ts";

// The rows of a form's CSV: one line per answer, one column per question
// ever asked (the latest wording; removed questions marked) — a matrix one
// column per row —, numbers as numbers, choices by their labels, then where
// the answer stands (new, in progress, done) and its note. An anonymous
// form never gets this export: see summaryRows.
type Cell = { question: Question; removed: boolean; row?: { id: string; label: string } };

function cells(form: Pick<Form, "draft">, versions: Map<number, Definition>, t: Catalogue): { cells: Cell[]; header: string[] } {
  const labels = optionLabels(versions);
  const list: Cell[] = [];
  for (const c of columnsOf(versions, form.draft)) {
    if (c.question.kind === "matrix") for (const r of c.question.rows ?? []) list.push({ ...c, row: { id: r.id, label: labels.get(r.id) ?? r.label } });
    else list.push(c);
  }
  const header = list.map(c => {
    const title = c.row ? `${c.question.title} — ${c.row.label}` : c.question.title;
    return c.removed ? `${title} (${t.answers.removedQuestion})` : title;
  });
  return { cells: list, header };
}

type Row = { form: Pick<Form, "draft">; versions: Map<number, Definition>; t: Catalogue; locale: "en" | "fr"; zone: string; names: Map<string, Person> };

// The header and the cells of one answer: the export is written a few
// hundred answers at a time (answersCsv), whatever their number.
export function exportPlan(input: Pick<Row, "form" | "versions" | "t">): { header: unknown[]; row: (a: Answer, r: Row) => unknown[] } {
  const { form, versions, t } = input;
  const labels = optionLabels(versions);
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const { cells: list, header: titles } = cells(form, versions, t);
  const header: unknown[] = [t.csv.when, t.csv.who, ...titles, t.csv.status, t.csv.note, t.csv.version];
  // Each question with its options' latest labels, made once.
  const asked = list.map(c => ({ ...c, q: { ...c.question, options: (c.question.options ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })) } }));
  const row = (a: Answer, { locale, zone, names }: Row) => {
    const when = a.createdAt ? formatDate(a.createdAt, locale, zone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : a.month.slice(0, 7);
    const who = a.respondent ? nameOf(names.get(a.respondent), locale) : (a.email ?? t.csv.visitor);
    const values = asked.map(c => {
      const v = a.data[c.question.id];
      if (typeof v === "number") return v;
      if (c.row) return isGrid(v) && v.rows[c.row.id] ? (c.q.options.find(o => o.id === v.rows[c.row!.id])?.label ?? "") : "";
      return answerText(c.q, v, words);
    });
    return [when, who, ...values, t.follow.states[a.status], a.note, a.version];
  };
  return { header, row };
}

// Every row at once (a test, a small form): the header, then each answer.
export function exportRows(input: Row & { form: Form; answers: Answer[] }): unknown[][] {
  const plan = exportPlan(input);
  return [plan.header, ...input.answers.map(a => plan.row(a, input))];
}

// An anonymous form's export: what the summary says, never one person's
// row — each choice with its count and share, averages, and the written
// answers each on its own line, shuffled (the order the summary got them
// in is already random).
export function summaryRows(input: { stats: Stats; versions: Map<number, Definition>; t: Catalogue }): unknown[][] {
  const { stats, versions, t } = input;
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const rows: unknown[][] = [[t.csv.question, t.csv.answer, t.csv.count, t.csv.share]];
  rows.push([t.csv.total, "", stats.total, ""]);
  for (const s of summarise(versions, stats, words)) {
    const title = s.column.removed ? `${s.column.question.title} (${t.answers.removedQuestion})` : s.column.question.title;
    const st = s.stat;
    switch (st.type) {
      case "bars":
        for (const b of st.bars) rows.push([title, b.label, b.count, b.share]);
        break;
      case "average":
        rows.push([title, t.summary.average, st.average, ""]);
        if (st.nps) rows.push([title, t.summary.nps, st.nps.score, ""]);
        for (const b of st.bars) rows.push([title, b.label, b.count, b.share]);
        break;
      case "number":
        if (st.answered) rows.push([title, t.summary.average, st.average, ""], [title, t.summary.min, st.min, ""], [title, t.summary.max, st.max, ""]);
        break;
      case "dates":
        if (st.answered) rows.push([title, t.summary.first, st.first, ""], [title, t.summary.last, st.last, ""]);
        break;
      case "ranks":
        for (const i of st.items) rows.push([title, i.label, i.average, ""]);
        break;
      case "grid":
        for (const r of st.rows) for (const [k, c] of st.columns.entries()) rows.push([`${title} — ${r.label}`, c.label, r.cells[k]!.count, r.cells[k]!.share]);
        break;
      case "files":
        break;
      case "texts":
        break;
    }
  }
  return rows;
}

// The written answers of an anonymous form for its export: question by
// question, each list shuffled on its own by the caller.
export function textRows(texts: { question: Question; texts: string[] }[]): unknown[][] {
  return texts.flatMap(x => x.texts.map(text => [x.question.title, text, "", ""]));
}
