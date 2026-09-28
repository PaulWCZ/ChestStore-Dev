// Safe in the browser: the summary of a form's answers, pure. Questions are
// matched across versions by their id (a question keeps its id when a form
// is edited); the latest wording names them, questions removed since come
// last, marked as such.
import { has, isPick, type Answers, type StoredFile } from "./logic.ts";
import type { Definition, Question } from "./model.ts";

export type Column = { question: Question; removed: boolean };

// columns: every question that was ever asked (statements aside), the
// latest version's first, in its order.
export function columnsOf(versions: Map<number, Definition>, current?: Definition): Column[] {
  const ordered = [...versions.entries()].sort((a, b) => b[0] - a[0]).map(([, d]) => d);
  const latest = current ?? ordered[0];
  const seen = new Map<string, Column>();
  for (const q of latest?.pages.flatMap(p => p.questions) ?? []) if (q.kind !== "statement") seen.set(q.id, { question: q, removed: false });
  for (const d of ordered) for (const q of d.pages.flatMap(p => p.questions)) if (q.kind !== "statement" && !seen.has(q.id)) seen.set(q.id, { question: q, removed: true });
  return [...seen.values()];
}

// An option's label as the latest version that has it wrote it.
export function optionLabels(versions: Map<number, Definition>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const [, d] of [...versions.entries()].sort((a, b) => a[0] - b[0])) for (const q of d.pages.flatMap(p => p.questions)) for (const o of q.options ?? []) labels.set(o.id, o.label);
  return labels;
}

export type Bar = { key: string; label: string; count: number; share: number };
export type Stat =
  | { type: "bars"; answered: number; bars: Bar[]; others: string[] }
  | { type: "average"; answered: number; average: number; bars: Bar[]; max: number; nps: Nps | null }
  | { type: "number"; answered: number; average: number; min: number; max: number }
  | { type: "texts"; answered: number; latest: string[] }
  | { type: "dates"; answered: number; first: string; last: string }
  | { type: "files"; answered: number };
export type Nps = { score: number; promoters: number; passives: number; detractors: number };
export type Summary = { column: Column; stat: Stat };

const share = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);

// nps: the Net Promoter Score of 0–10 answers: % of 9–10 minus % of 0–6.
export function nps(values: number[]): Nps | null {
  if (values.length === 0) return null;
  const promoters = values.filter(v => v >= 9).length, detractors = values.filter(v => v <= 6).length;
  const passives = values.length - promoters - detractors;
  return { score: Math.round(((promoters - detractors) / values.length) * 100), promoters, passives, detractors };
}

export function summarise(versions: Map<number, Definition>, answers: { data: Answers }[], words: { yes: string; no: string; other: string }): Summary[] {
  const labels = optionLabels(versions);
  return columnsOf(versions).map(column => {
    const q = column.question;
    const values = answers.map(a => a.data[q.id]).filter(v => v !== undefined && has(v));
    const answered = values.length;
    switch (q.kind) {
      case "choice":
      case "choices":
      case "dropdown": {
        const counts = new Map<string, number>();
        const others: string[] = [];
        for (const v of values) {
          if (!isPick(v)) continue;
          for (const id of v.ids) counts.set(id, (counts.get(id) ?? 0) + 1);
          if (v.other) others.push(v.other);
        }
        const keys = [...(q.options ?? []).map(o => o.id), ...[...counts.keys()].filter(k => !(q.options ?? []).some(o => o.id === k))];
        const bars: Bar[] = keys.map(k => ({ key: k, label: labels.get(k) ?? k, count: counts.get(k) ?? 0, share: share(counts.get(k) ?? 0, answered) }));
        if (q.other || others.length > 0) bars.push({ key: "other", label: words.other, count: others.length, share: share(others.length, answered) });
        return { column, stat: { type: "bars", answered, bars, others: others.slice(0, 50) } };
      }
      case "yesno": {
        const yes = values.filter(v => v === true).length, no = values.filter(v => v === false).length;
        return { column, stat: { type: "bars", answered, bars: [{ key: "yes", label: words.yes, count: yes, share: share(yes, answered) }, { key: "no", label: words.no, count: no, share: share(no, answered) }], others: [] } };
      }
      case "rating":
      case "scale": {
        const numbers = values.filter((v): v is number => typeof v === "number");
        const low = q.kind === "rating" ? 1 : (q.from ?? 0), high = q.kind === "rating" ? (q.steps ?? 5) : (q.to ?? 10);
        const bars: Bar[] = [];
        for (let n = low; n <= high; n++) {
          const c = numbers.filter(v => v === n).length;
          bars.push({ key: String(n), label: String(n), count: c, share: share(c, numbers.length) });
        }
        const average = numbers.length ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10 : 0;
        return { column, stat: { type: "average", answered, average, bars, max: high, nps: q.kind === "scale" && low === 0 && high === 10 ? nps(numbers) : null } };
      }
      case "number": {
        const numbers = values.filter((v): v is number => typeof v === "number");
        if (numbers.length === 0) return { column, stat: { type: "number", answered: 0, average: 0, min: 0, max: 0 } };
        return { column, stat: { type: "number", answered, average: Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 100) / 100, min: Math.min(...numbers), max: Math.max(...numbers) } };
      }
      case "date": {
        const days = values.filter((v): v is string => typeof v === "string").sort();
        return { column, stat: { type: "dates", answered, first: days[0] ?? "", last: days.at(-1) ?? "" } };
      }
      case "file":
        return { column, stat: { type: "files", answered: values.filter(v => typeof v === "object" && v !== null && "file" in (v as StoredFile)).length } };
      default:
        return { column, stat: { type: "texts", answered, latest: values.filter((v): v is string => typeof v === "string").slice(0, 5) } };
    }
  });
}
