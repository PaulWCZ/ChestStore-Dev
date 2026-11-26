// Safe in the browser: the summary of a form's answers, pure. The counts
// come from the database, computed there whatever the number of answers
// (src/lib/stats.ts, Stats); this file turns them into what each question
// shows. Questions are matched across versions by their id (a question
// keeps its id when a form is edited); the latest wording names them,
// questions removed since come last, marked as such.
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
  for (const [, d] of [...versions.entries()].sort((a, b) => a[0] - b[0])) for (const q of d.pages.flatMap(p => p.questions)) for (const o of [...(q.options ?? []), ...(q.rows ?? [])]) labels.set(o.id, o.label);
  return labels;
}

export type Bar = { key: string; label: string; count: number; share: number };
export type Stat =
  | { type: "bars"; answered: number; bars: Bar[]; others: string[] }
  | { type: "average"; answered: number; average: number; bars: Bar[]; max: number; nps: Nps | null }
  | { type: "number"; answered: number; average: number; min: number; max: number }
  | { type: "texts"; answered: number; latest: string[] }
  | { type: "dates"; answered: number; first: string; last: string }
  | { type: "files"; answered: number; files: number }
  // A ranking: each item's average place (1 is first), best first.
  | { type: "ranks"; answered: number; items: { key: string; label: string; average: number; firsts: number }[] }
  // A matrix: for each row, the count and share of each column.
  | { type: "grid"; answered: number; columns: { key: string; label: string }[]; rows: { key: string; label: string; answered: number; cells: { count: number; share: number }[] }[] };
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

// What the database counted over a form's answers (src/lib/stats.ts),
// by question id. Only what a question's kind shows is read.
export type QuestionStats = {
  // Answers that hold something for it (logic.ts has()).
  answered: number;
  yes: number;
  no: number;
  // Picks with an "Other" text.
  others: number;
  // Over its numbers (a number, a rating, a scale).
  average: number | null;
  min: number | null;
  max: number | null;
  // Over its texts (a date: "YYYY-MM-DD").
  first: string | null;
  last: string | null;
  // Answers holding a stored file, and those files.
  withFiles: number;
  files: number;
};
export type Stats = {
  total: number;
  questions: Record<string, QuestionStats>;
  // Choices: how many picked each option.
  picks: Record<string, Record<string, number>>;
  // Ratings and scales: how many gave each number.
  numbers: Record<string, Record<string, number>>;
  // Rankings: each item's places (their sum and count) and first places.
  ranks: Record<string, Record<string, { sum: number; count: number; firsts: number }>>;
  // Matrices: for each row, how many chose each column.
  grids: Record<string, Record<string, Record<string, number>>>;
  // The "Other" texts (the newest 50) and the newest texts (5).
  otherTexts: Record<string, string[]>;
  latest: Record<string, string[]>;
};
export const emptyQuestion: QuestionStats = { answered: 0, yes: 0, no: 0, others: 0, average: null, min: null, max: null, first: null, last: null, withFiles: 0, files: 0 };

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function summarise(versions: Map<number, Definition>, stats: Stats, words: { yes: string; no: string; other: string }): Summary[] {
  const labels = optionLabels(versions);
  return columnsOf(versions).map(column => {
    const q = column.question;
    const st = stats.questions[q.id] ?? emptyQuestion;
    const answered = st.answered;
    switch (q.kind) {
      case "choice":
      case "choices":
      case "dropdown":
      case "picture": {
        const counts = stats.picks[q.id] ?? {};
        const keys = [...(q.options ?? []).map(o => o.id), ...Object.keys(counts).filter(k => !(q.options ?? []).some(o => o.id === k)).sort()];
        const bars: Bar[] = keys.map(k => ({ key: k, label: labels.get(k) ?? k, count: counts[k] ?? 0, share: share(counts[k] ?? 0, answered) }));
        if (q.other || st.others > 0) bars.push({ key: "other", label: words.other, count: st.others, share: share(st.others, answered) });
        return { column, stat: { type: "bars", answered, bars, others: stats.otherTexts[q.id] ?? [] } };
      }
      case "yesno":
        return { column, stat: { type: "bars", answered, bars: [{ key: "yes", label: words.yes, count: st.yes, share: share(st.yes, answered) }, { key: "no", label: words.no, count: st.no, share: share(st.no, answered) }], others: [] } };
      case "rating":
      case "scale": {
        const given = stats.numbers[q.id] ?? {};
        const low = q.kind === "rating" ? 1 : (q.from ?? 0), high = q.kind === "rating" ? (q.steps ?? 5) : (q.to ?? 10);
        const counted = Object.values(given).reduce((a, b) => a + b, 0);
        const bars: Bar[] = [];
        for (let n = low; n <= high; n++) bars.push({ key: String(n), label: String(n), count: given[String(n)] ?? 0, share: share(given[String(n)] ?? 0, counted) });
        const average = st.average === null ? 0 : round(st.average, 1);
        return { column, stat: { type: "average", answered, average, bars, max: high, nps: q.kind === "scale" && low === 0 && high === 10 ? npsOf(given) : null } };
      }
      case "number":
        if (st.average === null) return { column, stat: { type: "number", answered: 0, average: 0, min: 0, max: 0 } };
        return { column, stat: { type: "number", answered, average: round(st.average, 2), min: st.min ?? 0, max: st.max ?? 0 } };
      case "date":
        return { column, stat: { type: "dates", answered, first: st.first ?? "", last: st.last ?? "" } };
      case "file":
        return { column, stat: { type: "files", answered: st.withFiles, files: st.files } };
      case "ranking": {
        const places = stats.ranks[q.id] ?? {};
        const items = (q.options ?? []).map(o => {
          const p = places[o.id];
          return { key: o.id, label: labels.get(o.id) ?? o.label, average: p && p.count > 0 ? round(p.sum / p.count, 1) : 0, firsts: p?.firsts ?? 0 };
        });
        items.sort((a, b) => (a.average || Infinity) - (b.average || Infinity));
        return { column, stat: { type: "ranks", answered, items } };
      }
      case "matrix": {
        const grid = stats.grids[q.id] ?? {};
        const columns = (q.options ?? []).map(o => ({ key: o.id, label: labels.get(o.id) ?? o.label }));
        const rows = (q.rows ?? []).map(r => {
          const cells = grid[r.id] ?? {};
          const picked = Object.values(cells).reduce((a, b) => a + b, 0);
          return { key: r.id, label: labels.get(r.id) ?? r.label, answered: picked, cells: columns.map(c => ({ count: cells[c.key] ?? 0, share: share(cells[c.key] ?? 0, picked) })) };
        });
        return { column, stat: { type: "grid", answered, columns, rows } };
      }
      default:
        return { column, stat: { type: "texts", answered, latest: stats.latest[q.id] ?? [] } };
    }
  });
}

// The NPS of a 0–10 scale's numbers, from how many gave each.
function npsOf(given: Record<string, number>): Nps | null {
  let promoters = 0, detractors = 0, all = 0;
  for (const [value, count] of Object.entries(given)) {
    const v = Number(value);
    all += count;
    if (v >= 9) promoters += count;
    else if (v <= 6) detractors += count;
  }
  if (all === 0) return null;
  return { score: Math.round(((promoters - detractors) / all) * 100), promoters, passives: all - promoters - detractors, detractors };
}
