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
import { END, limits, withOptions, type Condition, type Definition, type Page, type Question } from "./model.ts";

// What an answer is, once read:
// short, long, email, phone → string; number → number; choice, choices,
// dropdown → Pick; yesno → boolean; rating, scale → integer; date →
// "YYYY-MM-DD"; file → FileRef (sent) or StoredFile (kept).
export type Pick = { ids: string[]; other?: string };
export type FileRef = { ref: string; name: string };
export type StoredFile = { file: string; name: string; type: string; size: number };
export type Value = string | number | boolean | Pick | FileRef | StoredFile;
export type Answers = Record<string, Value>;

export const isPick = (v: unknown): v is Pick => v !== null && typeof v === "object" && Array.isArray((v as Pick).ids);
const isFile = (v: unknown): v is FileRef | StoredFile => v !== null && typeof v === "object" && typeof (v as FileRef).name === "string" && ("ref" in (v as object) || "file" in (v as object));

// has: whether a value counts as answered.
export function has(value: Value | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (isPick(value)) return value.ids.length > 0 || (value.other ?? "").trim() !== "";
  return true;
}

const lower = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/gu, "").trim();

export function matches(c: Condition, answers: Answers): boolean {
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

export type AnswerError = "required" | "invalid" | "too_short" | "too_long" | "too_small" | "too_large" | "too_few" | "too_many" | "email" | "phone" | "date";

const emailPattern = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
const chars = (s: string) => [...s].length;
const oneLine = (s: string) => s.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "").trim();
const lines = (s: string) => s.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]/gu, "").trim();

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
      if (q.kind === "email" && !emailPattern.test(text)) return { error: "email" };
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
    case "choices": {
      if (!isPick(raw) || raw.ids.length > limits.options) return { error: "invalid" };
      const known = new Set((q.options ?? []).map(o => o.id));
      const ids = [...new Set(raw.ids)];
      if (!ids.every(i => typeof i === "string" && known.has(i))) return { error: "invalid" };
      const other = typeof raw.other === "string" && q.other ? oneLine(raw.other) : "";
      if (typeof raw.other === "string" && raw.other.trim() !== "" && !q.other) return { error: "invalid" };
      if (chars(other) > limits.option) return { error: "too_long" };
      const count = ids.length + (other ? 1 : 0);
      if (count === 0) return {};
      if (q.kind !== "choices" && count > 1) return { error: "invalid" };
      if (q.kind === "choices" && q.min !== undefined && count < q.min) return { error: "too_few" };
      if (q.kind === "choices" && q.max !== undefined && count > q.max) return { error: "too_many" };
      // Kept in the order of the options, whatever order they were ticked in.
      const order = (q.options ?? []).map(o => o.id);
      return { value: { ids: ids.sort((a, b) => order.indexOf(a) - order.indexOf(b)), ...(other ? { other } : {}) } };
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
      if (!isFile(raw)) return { error: "invalid" };
      const ref = (raw as FileRef).ref;
      if (typeof ref !== "string" || ref.length === 0 || ref.length > 300) return { error: "invalid" };
      return { value: { ref, name: oneLine(raw.name).slice(0, limits.fileName) || "file" } };
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
// ids; "Yes"/"No", files by name. The words come from the caller.
export function answerText(q: Question, v: Value | undefined, words: { yes: string; no: string; other: string }): string {
  if (v === undefined) return "";
  if (isPick(v)) {
    const labels = v.ids.map(id => q.options?.find(o => o.id === id)?.label ?? "").filter(Boolean);
    if (v.other) labels.push(`${words.other}: ${v.other}`);
    return labels.join(", ");
  }
  if (typeof v === "boolean") return v ? words.yes : words.no;
  if (typeof v === "object") return v.name;
  return String(v);
}

// prefill reads the link's parameters (?<question id>=value) into answers a
// respondent starts from: a choice by its label or id, a number, yes/no.
export function prefill(def: Definition, params: Record<string, string | undefined>): Answers {
  const found: Answers = {};
  for (const q of def.pages.flatMap(p => p.questions)) {
    const text = params[q.id];
    if (typeof text !== "string" || text === "" || text.length > 1000) continue;
    let raw: unknown = text;
    if (withOptions(q.kind)) {
      const wanted = text.split(q.kind === "choices" ? "," : "\u0000").map(lower);
      const ids = (q.options ?? []).filter(o => wanted.includes(lower(o.label)) || wanted.includes(o.id)).map(o => o.id);
      raw = { ids: q.kind === "choices" ? ids : ids.slice(0, 1) };
    } else if (q.kind === "yesno") raw = ["yes", "oui", "true", "1"].includes(lower(text)) ? true : ["no", "non", "false", "0"].includes(lower(text)) ? false : undefined;
    else if (q.kind === "rating" || q.kind === "scale") raw = /^\d{1,2}$/u.test(text) ? Number(text) : undefined;
    else if (q.kind === "file") raw = undefined;
    const { value } = read(q, raw);
    if (value !== undefined) found[q.id] = value;
  }
  return found;
}
