// Safe in the browser: no SDK here.
// The results of a poll, computed from counts. A named poll's counts come
// from its answers (with who gave them); an anonymous poll's are the
// tallies themselves (with nobody). Pure, tested alone.
import { enps, type QuestionKind } from "./model.ts";

export type OptionRow = { id: string; label: string; day: string | null; start: string | null; end: string | null };
export type QuestionRow = { id: string; kind: QuestionKind; text: string; multiple: boolean; other: boolean; low: string; high: string; options: OptionRow[] };

// One named answer row, as the database keeps it.
export type AnswerRow = { participant: string; member: string; question: string; option: string | null; value: number | null; text: string | null };
export type TextRow = { question: string; body: string; member: string | null };

export type Counts = Map<string, Map<string, number>>;

export type ChoiceResult = {
  kind: "choice";
  id: string;
  text: string;
  multiple: boolean;
  answered: number;
  options: { id: string; label: string; count: number; percent: number; top: boolean; voters: string[] }[];
  other: { count: number; percent: number; texts: TextRow[] } | null;
};
export type DateResult = {
  kind: "date";
  id: string;
  text: string;
  answered: number;
  options: { id: string; day: string; start: string | null; end: string | null; yes: number; maybe: number; no: number; best: boolean }[];
  best: string | null;
  // Named polls: each participant's answer per option (2 yes, 1 if need be, 0 no).
  grid: { member: string; values: Record<string, number> }[];
};
export type ScaleResult = { kind: "scale"; id: string; text: string; low: string; high: string; answered: number; counts: { value: number; count: number; percent: number; voters: string[] }[]; average: number | null };
export type TextResult = { kind: "text"; id: string; text: string; answered: number; texts: TextRow[] };
// eNPS: the 0–10 answers in three bands, and the score (−100 to +100).
export type EnpsResult = {
  kind: "enps"; id: string; text: string; answered: number;
  counts: number[];
  score: number | null;
  bands: { detractors: number; passives: number; promoters: number };
  percents: { detractors: number; passives: number; promoters: number };
};
export type QuestionResult = ChoiceResult | DateResult | ScaleResult | TextResult | EnpsResult;

const percent = (count: number, of: number) => (of > 0 ? Math.round((count * 100) / of) : 0);

// fromAnswers turns a named poll's rows into counts, the voters of each
// count, the free texts (with their author) and the date grid.
export function fromAnswers(questions: QuestionRow[], rows: AnswerRow[]): { counts: Counts; voters: Map<string, string[]>; texts: TextRow[]; grid: Map<string, { member: string; values: Record<string, number> }[]> } {
  const counts: Counts = new Map(questions.map(q => [q.id, new Map<string, number>()]));
  const voters = new Map<string, string[]>();
  const texts: TextRow[] = [];
  const grid = new Map<string, Map<string, { member: string; values: Record<string, number> }>>();
  const answeredBy = new Map<string, Set<string>>();
  const add = (question: string, key: string, member: string) => {
    const c = counts.get(question);
    if (!c) return;
    c.set(key, (c.get(key) ?? 0) + 1);
    const k = question + "/" + key;
    voters.set(k, [...(voters.get(k) ?? []), member]);
  };
  for (const r of rows) {
    const q = questions.find(x => x.id === r.question);
    if (!q) continue;
    const who = answeredBy.get(q.id) ?? new Set<string>();
    who.add(r.participant);
    answeredBy.set(q.id, who);
    if (q.kind === "choice") {
      if (r.option !== null) add(q.id, "o" + r.option, r.member);
      else if (r.text) {
        add(q.id, "other", r.member);
        texts.push({ question: q.id, body: r.text, member: r.member });
      }
    } else if (q.kind === "date" && r.option !== null && r.value !== null) {
      add(q.id, `o${r.option}:${r.value}`, r.member);
      const byParticipant = grid.get(q.id) ?? new Map();
      const line = byParticipant.get(r.participant) ?? { member: r.member, values: {} };
      line.values[r.option] = r.value;
      byParticipant.set(r.participant, line);
      grid.set(q.id, byParticipant);
    } else if ((q.kind === "scale" || q.kind === "enps") && r.value !== null) add(q.id, "v" + r.value, r.member);
    else if (q.kind === "text" && r.text) texts.push({ question: q.id, body: r.text, member: r.member });
  }
  for (const [question, who] of answeredBy) counts.get(question)?.set("n", who.size);
  return { counts, voters, texts, grid: new Map([...grid].map(([k, v]) => [k, [...v.values()]])) };
}

// best is the date most people can make (yes or if need be), then the one
// with most yes, then the earliest; none when nobody can make any.
export function best(options: { id: string; yes: number; maybe: number }[]): string | null {
  let found: { id: string; yes: number; maybe: number } | null = null;
  for (const o of options) {
    if (o.yes + o.maybe === 0) continue;
    if (!found || o.yes + o.maybe > found.yes + found.maybe || (o.yes + o.maybe === found.yes + found.maybe && o.yes > found.yes)) found = o;
  }
  return found?.id ?? null;
}

export function results(questions: QuestionRow[], counts: Counts, extra: { voters?: Map<string, string[]>; texts?: TextRow[]; grid?: Map<string, { member: string; values: Record<string, number> }[]> } = {}): QuestionResult[] {
  const voters = extra.voters ?? new Map<string, string[]>();
  const texts = extra.texts ?? [];
  return questions.map((q): QuestionResult => {
    const c = counts.get(q.id) ?? new Map<string, number>();
    const answered = c.get("n") ?? 0;
    const who = (key: string) => voters.get(q.id + "/" + key) ?? [];
    const mine = texts.filter(t => t.question === q.id);
    if (q.kind === "choice") {
      const options = q.options.map(o => ({ id: o.id, label: o.label, count: c.get("o" + o.id) ?? 0, percent: percent(c.get("o" + o.id) ?? 0, answered), top: false, voters: who("o" + o.id) }));
      const most = Math.max(0, ...options.map(o => o.count));
      for (const o of options) o.top = most > 0 && o.count === most;
      const other = q.other ? { count: c.get("other") ?? 0, percent: percent(c.get("other") ?? 0, answered), texts: mine } : null;
      return { kind: "choice", id: q.id, text: q.text, multiple: q.multiple, answered, options, other };
    }
    if (q.kind === "date") {
      const options = q.options.map(o => ({ id: o.id, day: o.day ?? "", start: o.start, end: o.end, yes: c.get(`o${o.id}:2`) ?? 0, maybe: c.get(`o${o.id}:1`) ?? 0, no: c.get(`o${o.id}:0`) ?? 0, best: false }));
      const top = best(options);
      for (const o of options) o.best = o.id === top;
      return { kind: "date", id: q.id, text: q.text, answered, options, best: top, grid: extra.grid?.get(q.id) ?? [] };
    }
    if (q.kind === "scale") {
      const scale = [1, 2, 3, 4, 5].map(value => ({ value, count: c.get("v" + value) ?? 0, percent: percent(c.get("v" + value) ?? 0, answered), voters: who("v" + value) }));
      const total = scale.reduce((s, v) => s + v.count, 0);
      const average = total > 0 ? Math.round((scale.reduce((s, v) => s + v.value * v.count, 0) / total) * 10) / 10 : null;
      return { kind: "scale", id: q.id, text: q.text, low: q.low, high: q.high, answered, counts: scale, average };
    }
    if (q.kind === "enps") {
      const values = Array.from({ length: 11 }, (_, v) => c.get("v" + v) ?? 0);
      const e = enps(values);
      const bands = { detractors: e?.detractors ?? 0, passives: e?.passives ?? 0, promoters: e?.promoters ?? 0 };
      const total = e?.total ?? 0;
      return {
        kind: "enps", id: q.id, text: q.text, answered, counts: values, score: e?.score ?? null, bands,
        percents: { detractors: percent(bands.detractors, total), passives: percent(bands.passives, total), promoters: percent(bands.promoters, total) },
      };
    }
    return { kind: "text", id: q.id, text: q.text, answered, texts: mine };
  });
}
