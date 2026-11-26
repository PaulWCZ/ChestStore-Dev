// Safe in the browser: the logic engine. The respondent's page runs it to
// know which question comes next; the server runs it again on what was
// sent, and keeps only the answers to questions that were really asked.
//
// Rules (tested in test/logic.test.ts):
// - a question with showIf is asked only when its condition matches the
//   answers kept so far (conditions point at earlier questions only);
// - after a page, its jumps are read in order: the first that matches
//   sends to its page (always a later one) or to the end; none, the next
//   page;
// - an answer to a question that was not asked is dropped, never stored.
import { readEmail } from "@argentic/chest-app/client";
import { END, clausesOf, limits, manyPicks, withOptions, type Clause, type Condition, type Definition, type Page, type Question } from "./model.ts";

// What an answer is, once read:
// short, long, email, phone → string; number → number; choice, choices,
// dropdown, picture → Pick; yesno → boolean; rating, scale → integer; date
// → "YYYY-MM-DD"; ranking → the item ids, first to last; matrix → Grid
// (row id → column id); file → FileRef (sent) or StoredFile (kept), or a
// list of them when the question takes several files.
export type Pick = { ids: string[]; other?: string };
export type FileRef = { ref: string; name: string };
export type StoredFile = { file: string; name: string; type: string; size: number };
export type Grid = { rows: Record<string, string> };
export type Value = string | number | boolean | Pick | FileRef | StoredFile | string[] | Grid | (FileRef | StoredFile)[];
export type Answers = Record<string, Value>;

export const isPick = (v: unknown): v is Pick => v !== null && typeof v === "object" && Array.isArray((v as Pick).ids);
export const isGrid = (v: unknown): v is Grid => v !== null && typeof v === "object" && !Array.isArray(v) && (v as Grid).rows !== null && typeof (v as Grid).rows === "object" && !Array.isArray((v as Grid).rows);
export const isFile = (v: unknown): v is FileRef | StoredFile => v !== null && typeof v === "object" && !Array.isArray(v) && typeof (v as FileRef).name === "string" && ("ref" in (v as object) || "file" in (v as object));
// The files of an answer to a file question, one or several.
export const filesIn = (v: unknown): (FileRef | StoredFile)[] => (Array.isArray(v) ? v.filter(isFile) : isFile(v) ? [v] : []);
export const isRanking = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");

// has: whether a value counts as answered.
export function has(value: Value | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (isPick(value)) return value.ids.length > 0 || (value.other ?? "").trim() !== "";
  if (isGrid(value)) return Object.keys(value.rows).length > 0;
  return true;
}

const lower = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "").trim();

// matches: a rule against the answers — its one comparison, or all (or
// any) of the ones it joins.
export function matches(rule: Condition, answers: Answers): boolean {
  if (!rule.more || rule.more.length === 0) return holds(rule, answers);
  const all = clausesOf(rule);
  return rule.join === "any" ? all.some(c => holds(c, answers)) : all.every(c => holds(c, answers));
}

function holds(c: Clause, answers: Answers): boolean {
  const v = answers[c.question];
  if (c.op === "answered") return has(v);
  if (c.op === "empty") return !has(v);
  if (!has(v)) return false;
  const want = c.value;
  if (isPick(v)) {
    const chosen = (id: unknown) => (id === "other" ? (v.other ?? "") !== "" : typeof id === "string" && v.ids.includes(id));
    if (c.op === "is" || c.op === "includes") return chosen(want);
    if (c.op === "is_not" || c.op === "excludes") return !chosen(want);
    return false;
  }
  if (typeof v === "boolean") return c.op === "is" ? v === want : c.op === "is_not" ? v !== want : false;
  if (typeof v === "number") {
    const n = typeof want === "number" ? want : Number(want);
    if (!Number.isFinite(n)) return false;
    return c.op === "is" ? v === n : c.op === "is_not" ? v !== n : c.op === "gt" ? v > n : c.op === "lt" ? v < n : false;
  }
  if (typeof v === "string") {
    const w = lower(String(want ?? ""));
    const s = lower(v);
    return c.op === "is" ? s === w : c.op === "is_not" ? s !== w : c.op === "includes" ? w !== "" && s.includes(w) : false;
  }
  return false;
}

// walk follows the form with these answers: the pages visited, in order,
// with the questions asked on each, and the answers kept (those to
// questions asked). `until` stops after that page (the respondent's page
// knows no more yet).
export type Walk = { pages: { page: Page; questions: Question[] }[]; kept: Answers };

export function walk(def: Definition, answers: Answers): Walk {
  const kept: Answers = {};
  const visited: Walk["pages"] = [];
  let i = 0;
  let guard = 0;
  while (i < def.pages.length && guard++ <= def.pages.length) {
    const page = def.pages[i]!;
    const asked: Question[] = [];
    for (const q of page.questions) {
      if (q.showIf && !matches(q.showIf, kept)) continue;
      asked.push(q);
      const v = answers[q.id];
      if (q.kind !== "statement" && v !== undefined && has(v)) kept[q.id] = v;
    }
    visited.push({ page, questions: asked });
    const jump = page.jumps.find(j => matches(j.when, kept));
    if (!jump) {
      i++;
      continue;
    }
    if (jump.to === END) break;
    const next = def.pages.findIndex(p => p.id === jump.to);
    // Forward only (problems() refuses the others): a broken jump goes on.
    i = next > i ? next : i + 1;
  }
  return { pages: visited, kept };
}

// The questions asked, in order (statements included).
export const asked = (w: Walk): Question[] => w.pages.flatMap(p => p.questions);

// ---- Reading one answer -------------------------------------------------------

export type AnswerError = "required" | "invalid" | "too_short" | "too_long" | "too_small" | "too_large" | "too_few" | "too_many" | "email" | "phone" | "date" | "rank_all" | "every_row";

const chars = (s: string) => [...s].length;
// Control characters go, and the invisible format ones (\p{Cf}: bidi
// overrides that turn a text around, zero-width spaces that hide words)
// — all but the joiner that holds an emoji together (U+200D).
const invisible = /(?!\u200d)\p{Cf}/gu;
const oneLine = (s: string) => s.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "").replace(invisible, "").trim();
const lines = (s: string) => s.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]/gu, "").replace(invisible, "").trim();

export function validDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && y <= 2200 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// read turns what was sent for a question into its answer, or says why
// not. Undefined: nothing was answered.
export function read(q: Question, raw: unknown): { value?: Value; error?: AnswerError } {
  if (raw === undefined || raw === null || raw === "") return {};
  switch (q.kind) {
    case "statement":
      return {};
    case "short":
    case "long":
    case "email":
    case "phone": {
      if (typeof raw !== "string") return { error: "invalid" };
      const text = q.kind === "long" ? lines(raw) : oneLine(raw);
      if (text === "") return {};
      const cap = q.kind === "long" ? limits.long : q.kind === "short" ? limits.short : q.kind === "email" ? limits.email : limits.phone;
      if (chars(text) > Math.min(cap, q.max ?? cap)) return { error: "too_long" };
      if (q.min !== undefined && chars(text) < q.min) return { error: "too_short" };
      if (q.kind === "email") {
        // @argentic/chest-app's readEmail — field.email()'s rule, the same
        // in the browser and on the server — read from what was typed (a
        // hidden character refuses it rather than being removed).
        const address = readEmail(raw);
        return address.ok ? { value: address.value } : { error: address.code === "too_long" ? "too_long" : "email" };
      }
      if (q.kind === "phone" && (!/^[+0-9 ().-]{4,30}$/u.test(text) || (text.match(/[0-9]/gu)?.length ?? 0) < 4)) return { error: "phone" };
      return { value: text };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*-?\d+([.,]\d+)?\s*$/u.test(raw) ? Number(raw.replace(",", ".")) : NaN;
      if (!Number.isFinite(n) || Math.abs(n) > limits.number) return { error: "invalid" };
      if (q.min !== undefined && n < q.min) return { error: "too_small" };
      if (q.max !== undefined && n > q.max) return { error: "too_large" };
      return { value: n };
    }
    case "choice":
    case "dropdown":
    case "choices":
    case "picture": {
      if (!isPick(raw) || raw.ids.length > limits.options) return { error: "invalid" };
      const known = new Set((q.options ?? []).map(o => o.id));
      const ids = [...new Set(raw.ids)];
      if (!ids.every(i => typeof i === "string" && known.has(i))) return { error: "invalid" };
      const other = typeof raw.other === "string" && q.other ? oneLine(raw.other) : "";
      if (typeof raw.other === "string" && raw.other.trim() !== "" && !q.other) return { error: "invalid" };
      if (chars(other) > limits.option) return { error: "too_long" };
      const count = ids.length + (other ? 1 : 0);
      if (count === 0) return {};
      const many = manyPicks(q);
      if (!many && count > 1) return { error: "invalid" };
      if (many && q.min !== undefined && count < q.min) return { error: "too_few" };
      if (many && q.max !== undefined && count > q.max) return { error: "too_many" };
      // Kept in the order of the options, whatever order they were ticked in.
      const order = (q.options ?? []).map(o => o.id);
      return { value: { ids: ids.sort((a, b) => order.indexOf(a) - order.indexOf(b)), ...(other ? { other } : {}) } };
    }
    case "ranking": {
      // The items in the respondent's order; a required ranking orders them all.
      if (!isRanking(raw) || raw.length > limits.rankItems) return { error: "invalid" };
      const known = new Set((q.options ?? []).map(o => o.id));
      if (new Set(raw).size !== raw.length || !raw.every(i => known.has(i))) return { error: "invalid" };
      if (raw.length === 0) return {};
      if (q.required && raw.length < known.size) return { error: "rank_all" };
      return { value: [...raw] };
    }
    case "matrix": {
      // One column per row; a required matrix answers every row.
      if (!isGrid(raw)) return { error: "invalid" };
      const rows = new Set((q.rows ?? []).map(r => r.id)), columns = new Set((q.options ?? []).map(o => o.id));
      const entries = Object.entries(raw.rows);
      if (entries.length > limits.rows || !entries.every(([r, c]) => rows.has(r) && typeof c === "string" && columns.has(c))) return { error: "invalid" };
      if (entries.length === 0) return {};
      if (q.required && entries.length < rows.size) return { error: "every_row" };
      const order = (q.rows ?? []).map(r => r.id);
      return { value: { rows: Object.fromEntries(entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) } };
    }
    case "yesno":
      return typeof raw === "boolean" ? { value: raw } : { error: "invalid" };
    case "rating":
    case "scale": {
      const low = q.kind === "rating" ? 1 : (q.from ?? 0);
      const high = q.kind === "rating" ? (q.steps ?? 5) : (q.to ?? 10);
      return typeof raw === "number" && Number.isInteger(raw) && raw >= low && raw <= high ? { value: raw } : { error: "invalid" };
    }
    case "date":
      return typeof raw === "string" && validDate(raw) ? { value: raw } : { error: "date" };
    case "file": {
      // One file, or up to the question's number of files (a list).
      const many = (q.max ?? 1) > 1;
      const sent = Array.isArray(raw) ? raw : [raw];
      if (sent.length === 0) return {};
      if (!many && sent.length > 1) return { error: "invalid" };
      if (sent.length > (q.max ?? 1)) return { error: "too_many" };
      const refs: FileRef[] = [];
      for (const one of sent) {
        if (!isFile(one)) return { error: "invalid" };
        const ref = (one as FileRef).ref;
        if (typeof ref !== "string" || ref.length === 0 || ref.length > 300) return { error: "invalid" };
        refs.push({ ref, name: oneLine(one.name).slice(0, limits.fileName) || "file" });
      }
      if (new Set(refs.map(r => r.ref)).size !== refs.length) return { error: "invalid" };
      return { value: many ? refs : refs[0]! };
    }
  }
}

// check reads every answer against the form: only the questions asked are
// kept; each is read by its kind; a required question asked and not
// answered is an error. Errors are per question id.
export function check(def: Definition, raw: unknown): { answers: Answers; errors: Record<string, AnswerError> } {
  const given: Answers = {};
  const errors: Record<string, AnswerError> = {};
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const questions = def.pages.flatMap(p => p.questions);
  for (const q of questions) {
    if (!Object.hasOwn(source, q.id)) continue;
    const { value, error } = read(q, source[q.id]);
    if (error) errors[q.id] = error;
    else if (value !== undefined) given[q.id] = value;
  }
  const w = walk(def, given);
  const askedIds = new Set(asked(w).map(q => q.id));
  for (const id of Object.keys(errors)) if (!askedIds.has(id)) delete errors[id];
  for (const q of asked(w)) {
    if (q.required && !has(w.kept[q.id]) && !errors[q.id]) errors[q.id] = "required";
  }
  return { answers: w.kept, errors };
}

// The text of an answer for a table, an email or a CSV: option labels, not
// ids; "Yes"/"No", files by name, a ranking in order, a matrix row by row.
// The words come from the caller.
export function answerText(q: Question, v: Value | undefined, words: { yes: string; no: string; other: string }): string {
  if (v === undefined) return "";
  const label = (id: string, list = q.options) => list?.find(o => o.id === id)?.label ?? "";
  if (isPick(v)) {
    const labels = v.ids.map(id => label(id)).filter(Boolean);
    if (v.other) labels.push(`${words.other}: ${v.other}`);
    return labels.join(", ");
  }
  if (typeof v === "boolean") return v ? words.yes : words.no;
  if (q.kind === "ranking" && isRanking(v)) return v.map((id, i) => `${i + 1}. ${label(id)}`).join(", ");
  if (isGrid(v)) return (q.rows ?? []).filter(r => v.rows[r.id]).map(r => `${r.label}: ${label(v.rows[r.id]!)}`).join("; ");
  if (typeof v === "object") return filesIn(v).map(f => f.name).join(", ");
  return String(v);
}

// recall: a text with {name} in it says the answer to the question of that
// name in links (or what the link gave a hidden field of that name):
// "Thanks, {first_name}!". A name nothing answers yet says nothing; braces
// around anything else stay as written.
const recallPattern = /\{([a-z][a-z0-9_]{0,29})\}/gu;
export function recall(text: string, def: Definition, answers: Answers, words: { yes: string; no: string; other: string }, hidden: Readonly<Record<string, string>> = {}): string {
  if (!text.includes("{")) return text;
  const byKey = new Map(def.pages.flatMap(p => p.questions).filter(q => q.key).map(q => [q.key!, q]));
  return text.replace(recallPattern, (whole: string, key: string) => {
    const q = byKey.get(key);
    if (q) return q.kind === "file" ? "" : answerText(q, answers[q.id], words);
    return Object.hasOwn(hidden, key) ? hidden[key]! : whole;
  });
}

// prefill reads the link's parameters (?<question id>=value) into answers a
// respondent starts from: a choice by its label or id, a number, yes/no.
export function prefill(def: Definition, params: Record<string, string | undefined>): Answers {
  const found: Answers = {};
  for (const q of def.pages.flatMap(p => p.questions)) {
    const text = (q.key ? params[q.key] : undefined) ?? params[q.id];
    if (typeof text !== "string" || text === "" || text.length > 1000) continue;
    let raw: unknown = text;
    if (withOptions(q.kind)) {
      const wanted = text.split(manyPicks(q) ? "," : "\u0000").map(lower);
      const ids = (q.options ?? []).filter(o => wanted.includes(lower(o.label)) || wanted.includes(o.id)).map(o => o.id);
      raw = { ids: manyPicks(q) ? ids : ids.slice(0, 1) };
    } else if (q.kind === "yesno") raw = ["yes", "oui", "true", "1"].includes(lower(text)) ? true : ["no", "non", "false", "0"].includes(lower(text)) ? false : undefined;
    else if (q.kind === "rating" || q.kind === "scale") raw = /^\d{1,2}$/u.test(text) ? Number(text) : undefined;
    else if (q.kind === "file" || q.kind === "matrix" || q.kind === "ranking") raw = undefined;
    const { value } = read(q, raw);
    if (value !== undefined) found[q.id] = value;
  }
  return found;
}
