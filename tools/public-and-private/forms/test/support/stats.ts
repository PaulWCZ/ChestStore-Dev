import { filesIn, has, isGrid, isPick, isRanking, type Answers } from "../../src/shared/logic.ts";
import { allQuestions, type Definition, type Kind } from "../../src/shared/model.ts";
import { emptyQuestion, type Stats } from "../../src/shared/summary.ts";

// The summary's counts made in memory, one answer after the other — the
// way the tool made them before the database did (src/lib/stats.ts). The
// tests compare the two on the same answers, and use this one where no
// database is at hand. Answers newest first.
export function statsOf(answers: { data: Answers }[], versions: Map<number, Definition>): Stats {
  const kinds = new Map<string, Kind>();
  for (const [, d] of [...versions.entries()].sort((a, b) => b[0] - a[0])) for (const q of allQuestions(d)) if (!kinds.has(q.id)) kinds.set(q.id, q.kind);
  const stats: Stats = { total: answers.length, questions: {}, picks: {}, numbers: {}, ranks: {}, grids: {}, otherTexts: {}, latest: {} };
  const numbers = new Map<string, number[]>();
  for (const a of answers) {
    for (const [key, v] of Object.entries(a.data)) {
      const kind = kinds.get(key);
      const q = (stats.questions[key] ??= { ...emptyQuestion });
      if (has(v)) q.answered++;
      if (v === true) q.yes++;
      if (v === false) q.no++;
      if (typeof v === "number") (numbers.get(key) ?? numbers.set(key, []).get(key)!).push(v);
      if (kind === "choice" || kind === "choices" || kind === "dropdown" || kind === "picture") {
        if (isPick(v)) {
          for (const id of v.ids) (stats.picks[key] ??= {})[id] = (stats.picks[key]![id] ?? 0) + 1;
          if (v.other) {
            q.others++;
            const list = (stats.otherTexts[key] ??= []);
            if (list.length < 50) list.push(v.other);
          }
        }
      }
      if ((kind === "rating" || kind === "scale") && typeof v === "number") (stats.numbers[key] ??= {})[String(v)] = (stats.numbers[key]![String(v)] ?? 0) + 1;
      if (kind === "date" && typeof v === "string") {
        if (q.first === null || v < q.first) q.first = v;
        if (q.last === null || v > q.last) q.last = v;
      }
      if (kind === "file") {
        const n = filesIn(v).filter(f => "file" in f).length;
        if (n > 0) q.withFiles++;
        q.files += n;
      }
      if (kind === "ranking" && isRanking(v)) v.forEach((id, i) => {
        const r = ((stats.ranks[key] ??= {})[id] ??= { sum: 0, count: 0, firsts: 0 });
        r.sum += i + 1;
        r.count++;
        if (i === 0) r.firsts++;
      });
      if (kind === "matrix" && isGrid(v)) for (const [row, col] of Object.entries(v.rows)) ((stats.grids[key] ??= {})[row] ??= {})[col] = (stats.grids[key]![row]![col] ?? 0) + 1;
      if ((kind === "short" || kind === "long" || kind === "email" || kind === "phone") && typeof v === "string" && v.trim() !== "") {
        const list = (stats.latest[key] ??= []);
        if (list.length < 5) list.push(v);
      }
    }
  }
  for (const [key, list] of numbers) {
    const q = stats.questions[key]!;
    q.average = list.reduce((a, b) => a + b, 0) / list.length;
    q.min = Math.min(...list);
    q.max = Math.max(...list);
  }
  return stats;
}
