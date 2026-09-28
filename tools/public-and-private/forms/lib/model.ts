// Safe in the browser: no SDK, no database. The shape of a form and the
// rules of what an editor may write, pure — the builder runs them live, the
// server runs them again on everything it receives.
import { AppError } from "./app-error.ts";

export const limits = {
  title: 200,
  intro: 2000,
  pages: 20,
  pageTitle: 200,
  questions: 100,
  questionTitle: 300,
  help: 1000,
  options: 50,
  option: 200,
  jumps: 20,
  definitionBytes: 256 * 1024,
  short: 500,
  long: 5000,
  email: 254,
  phone: 30,
  number: 1e12,
  thanksTitle: 120,
  thanksBody: 1000,
  url: 2000,
  maxAnswers: 100000,
  fileSize: 10 << 20,
  fileName: 200,
  forms: 2000,
  collaborators: 50,
  answerBytes: 96 * 1024,
  page: 50,
  // Anonymous answers are shown only from this many on (tool README).
  anonymousFloor: 5,
} as const;

export const kinds = ["short", "long", "email", "phone", "number", "choice", "choices", "dropdown", "yesno", "rating", "scale", "date", "file", "statement"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

// Kinds that take a list of options, and those whose answer is a choice.
export const withOptions = (kind: Kind) => kind === "choice" || kind === "choices" || kind === "dropdown";
export const textKinds: readonly Kind[] = ["short", "long", "email", "phone"];

export const accepts = ["any", "images", "documents"] as const;
export type Accept = (typeof accepts)[number];

export const ops = ["answered", "empty", "is", "is_not", "includes", "excludes", "gt", "lt"] as const;
export type Op = (typeof ops)[number];

// The comparisons that make sense for a question of a kind.
export function opsFor(kind: Kind): Op[] {
  switch (kind) {
    case "choice":
    case "dropdown":
      return ["is", "is_not", "answered", "empty"];
    case "choices":
      return ["includes", "excludes", "answered", "empty"];
    case "yesno":
      return ["is", "answered", "empty"];
    case "number":
    case "rating":
    case "scale":
      return ["is", "is_not", "gt", "lt", "answered", "empty"];
    case "file":
    case "date":
      return ["answered", "empty"];
    case "statement":
      return [];
    default:
      return ["is", "is_not", "includes", "answered", "empty"];
  }
}
export const needsValue = (op: Op) => op !== "answered" && op !== "empty";

export type Option = { id: string; label: string };
export type ConditionValue = string | number | boolean;
export type Condition = { question: string; op: Op; value?: ConditionValue };
export type Question = {
  id: string;
  kind: Kind;
  title: string;
  help: string;
  required: boolean;
  // Length (short, long), value (number), picks (choices).
  min?: number;
  max?: number;
  options?: Option[];
  other?: boolean;
  // Stars of a rating (3 to 10).
  steps?: number;
  // An opinion scale: from 0 or 1 to 5…10, words under both ends.
  from?: number;
  to?: number;
  left?: string;
  right?: string;
  accept?: Accept;
  showIf?: Condition;
};
export type Jump = { when: Condition; to: string };
export type Page = { id: string; title: string; questions: Question[]; jumps: Jump[] };
export type Definition = { title: string; intro: string; pages: Page[] };

export const END = "end";
const idPattern = /^[a-z0-9]{6,12}$/u;
export const isItemId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);

// newId names a page, question or option: random, readable in a link
// (prefill), the same in every version of the form.
export function newId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

// ---- Texts -----------------------------------------------------------------

// clean trims a text and bounds it; control characters go, line breaks stay
// only where the text may hold several lines.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "").replace(/\n{4,}/gu, "\n\n\n") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.replace(/[‪-‮⁦-⁩]/gu, "").trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}
const soft = (value: unknown, max: number, multiline = false) => clean(value, max, { optional: true, multiline });

// ---- Reading a definition --------------------------------------------------
// definition() reads what the builder sends: structure and bounds always —
// a draft may be unfinished (a question without a title), never malformed.
// problems() says what stops it from being published.

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown, max: number): unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new AppError("invalid");
  return value;
};
const whole = (value: unknown, min: number, max: number): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new AppError("invalid");
  return value;
};
const decimal = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limits.number) throw new AppError("invalid");
  return value;
};

function condition(value: unknown): Condition | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) throw new AppError("invalid");
  const { question, op } = value;
  if (!isItemId(question) || typeof op !== "string" || !(ops as readonly string[]).includes(op)) throw new AppError("invalid");
  const v = value["value"];
  let kept: ConditionValue | undefined;
  if (typeof v === "string") kept = soft(v, limits.option);
  else if (typeof v === "boolean") kept = v;
  else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limits.number) kept = v;
  else if (v !== undefined && v !== null) throw new AppError("invalid");
  return { question, op: op as Op, ...(kept !== undefined ? { value: kept } : {}) };
}

function question(value: unknown): Question {
  if (!isObject(value) || !isItemId(value["id"]) || !isKind(value["kind"])) throw new AppError("invalid");
  const kind = value["kind"];
  const q: Question = {
    id: value["id"],
    kind,
    title: soft(value["title"], limits.questionTitle, kind === "statement"),
    help: soft(value["help"], limits.help, true),
    required: kind === "statement" ? false : value["required"] === true,
  };
  if (kind === "short" || kind === "long") {
    const cap = kind === "short" ? limits.short : limits.long;
    const min = whole(value["min"], 1, cap), max = whole(value["max"], 1, cap);
    if (min !== undefined) q.min = min;
    if (max !== undefined) q.max = max;
  }
  if (kind === "number") {
    const min = decimal(value["min"]), max = decimal(value["max"]);
    if (min !== undefined) q.min = min;
    if (max !== undefined) q.max = max;
  }
  if (withOptions(kind)) {
    const seen = new Set<string>();
    q.options = list(value["options"], limits.options).map(o => {
      if (!isObject(o) || !isItemId(o["id"]) || seen.has(o["id"])) throw new AppError("invalid");
      seen.add(o["id"]);
      return { id: o["id"], label: soft(o["label"], limits.option) };
    });
    if (kind !== "dropdown" && value["other"] === true) q.other = true;
    if (kind === "choices") {
      const min = whole(value["min"], 1, limits.options), max = whole(value["max"], 1, limits.options);
      if (min !== undefined) q.min = min;
      if (max !== undefined) q.max = max;
    }
  }
  if (kind === "rating") q.steps = whole(value["steps"], 3, 10) ?? 5;
  if (kind === "scale") {
    q.from = whole(value["from"], 0, 1) ?? 0;
    q.to = whole(value["to"], 5, 10) ?? 10;
    q.left = soft(value["left"], 60);
    q.right = soft(value["right"], 60);
  }
  if (kind === "file") q.accept = (accepts as readonly unknown[]).includes(value["accept"]) ? (value["accept"] as Accept) : "any";
  const showIf = condition(value["showIf"]);
  if (showIf) q.showIf = showIf;
  return q;
}

export function definition(value: unknown): Definition {
  if (!isObject(value)) throw new AppError("invalid");
  const pages = list(value["pages"], limits.pages);
  if (pages.length === 0) throw new AppError("invalid");
  const ids = new Set<string>();
  let count = 0;
  const def: Definition = {
    title: soft(value["title"], limits.title),
    intro: soft(value["intro"], limits.intro, true),
    pages: pages.map(p => {
      if (!isObject(p) || !isItemId(p["id"]) || ids.has(p["id"])) throw new AppError("invalid");
      ids.add(p["id"]);
      const questions = list(p["questions"], limits.questions).map(question);
      count += questions.length;
      for (const q of questions) {
        if (ids.has(q.id)) throw new AppError("invalid");
        ids.add(q.id);
      }
      const jumps = list(p["jumps"], limits.jumps).map(j => {
        if (!isObject(j)) throw new AppError("invalid");
        const when = condition(j["when"]);
        const to = j["to"];
        if (!when || !(to === END || isItemId(to))) throw new AppError("invalid");
        return { when, to: to as string };
      });
      return { id: p["id"], title: soft(p["title"], limits.pageTitle), questions, jumps };
    }),
  };
  if (count > limits.questions) throw new AppError("too_long", { max: limits.questions });
  return def;
}

// definitionFromText reads the builder's JSON, bounded before it is parsed.
export function definitionFromText(text: unknown): Definition {
  if (typeof text !== "string" || text.length > limits.definitionBytes) throw new AppError("too_long", { max: limits.definitionBytes });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError("invalid");
  }
  return definition(parsed);
}

// ---- What stops a form from being published ---------------------------------

export type ProblemCode =
  | "no_title"
  | "no_questions"
  | "question_title"
  | "few_options"
  | "empty_option"
  | "min_max"
  | "condition_later"
  | "condition_unknown"
  | "condition_value"
  | "jump_backward"
  | "jump_unknown";
export type Problem = { code: ProblemCode; question?: string; page?: string };

export function allQuestions(def: Definition): Question[] {
  return def.pages.flatMap(p => p.questions);
}

export function problems(def: Definition): Problem[] {
  const found: Problem[] = [];
  if (def.title === "") found.push({ code: "no_title" });
  const all = allQuestions(def);
  if (!all.some(q => q.kind !== "statement")) found.push({ code: "no_questions" });
  const order = new Map(all.map((q, i) => [q.id, i]));
  const byId = new Map(all.map(q => [q.id, q]));
  const checkCondition = (c: Condition, before: number, where: Problem) => {
    const target = byId.get(c.question);
    if (!target || !opsFor(target.kind).includes(c.op)) return found.push({ ...where, code: "condition_unknown" });
    if ((order.get(c.question) ?? Infinity) >= before) return found.push({ ...where, code: "condition_later" });
    if (needsValue(c.op)) {
      const v = c.value;
      const ok =
        withOptions(target.kind) ? typeof v === "string" && (v === "other" ? target.other === true : (target.options ?? []).some(o => o.id === v))
        : target.kind === "yesno" ? typeof v === "boolean"
        : target.kind === "number" || target.kind === "rating" || target.kind === "scale" ? typeof v === "number"
        : typeof v === "string" && v !== "";
      if (!ok) found.push({ ...where, code: "condition_value" });
    }
  };
  let index = 0;
  def.pages.forEach((page, pageIndex) => {
    for (const q of page.questions) {
      const where = { question: q.id };
      if (q.kind !== "statement" && q.title === "") found.push({ ...where, code: "question_title" });
      if (q.kind === "statement" && q.title === "" && q.help === "") found.push({ ...where, code: "question_title" });
      if (withOptions(q.kind)) {
        const options = q.options ?? [];
        if (options.length + (q.other ? 1 : 0) < 2) found.push({ ...where, code: "few_options" });
        if (options.some(o => o.label === "")) found.push({ ...where, code: "empty_option" });
      }
      if (q.min !== undefined && q.max !== undefined && q.min > q.max) found.push({ ...where, code: "min_max" });
      if (q.kind === "choices" && q.max !== undefined && q.max > (q.options?.length ?? 0) + (q.other ? 1 : 0)) found.push({ ...where, code: "min_max" });
      if (q.showIf) checkCondition(q.showIf, index, where);
      index++;
    }
    for (const jump of page.jumps) {
      const where = { page: page.id };
      checkCondition(jump.when, index, where);
      if (jump.to !== END) {
        const target = def.pages.findIndex(p => p.id === jump.to);
        if (target < 0) found.push({ ...where, code: "jump_unknown" });
        else if (target <= pageIndex) found.push({ ...where, code: "jump_backward" });
      }
    }
  });
  return found;
}

// ---- Settings (not versioned: how the form is shared and answered) ----------

export const audiences = ["public", "team"] as const;
export type Audience = (typeof audiences)[number];
export const layouts = ["steps", "classic"] as const;
export type Layout = (typeof layouts)[number];
export const accents = ["berry", "indigo", "teal", "tangerine", "forest", "ink"] as const;
export type Accent = (typeof accents)[number];
export const retentions = [1, 3, 6, 12, 24, 36] as const;
export type Status = "draft" | "published" | "closed";

export type Settings = {
  audience: Audience;
  anonymous: boolean;
  once: boolean;
  tellTeam: boolean;
  layout: Layout;
  accent: Accent;
  closesAt: string | null;
  maxAnswers: number | null;
  thanksTitle: string;
  thanksBody: string;
  redirectUrl: string | null;
  sendCopy: boolean;
  retentionMonths: number | null;
  watchers: string[];
};

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export const isMemberId = (value: unknown): value is string => typeof value === "string" && memberPattern.test(value);

// A redirect after answering: https only, no credentials, a real host.
export function redirectUrl(value: unknown): string | null {
  const text = soft(value, limits.url);
  if (text === "") return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("invalid_url");
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) throw new AppError("invalid_url");
  return url.href;
}

export function settings(value: unknown, closesAt: string | null): Settings {
  if (!isObject(value)) throw new AppError("invalid");
  const pick = <T extends string>(options: readonly T[], v: unknown): T => {
    if (typeof v !== "string" || !(options as readonly string[]).includes(v)) throw new AppError("invalid");
    return v as T;
  };
  const audience = pick(audiences, value["audience"]);
  const anonymous = audience === "team" && value["anonymous"] === true;
  const max = value["maxAnswers"];
  const retention = value["retentionMonths"];
  const watchers = list(value["watchers"], limits.collaborators + 1);
  if (!watchers.every(isMemberId)) throw new AppError("invalid");
  return {
    audience,
    anonymous,
    once: anonymous || (audience === "team" && value["once"] !== false),
    tellTeam: audience === "team" && value["tellTeam"] === true,
    layout: pick(layouts, value["layout"]),
    accent: pick(accents, value["accent"]),
    closesAt,
    maxAnswers: max === null || max === undefined || max === "" ? null : (whole(max, 1, limits.maxAnswers) ?? null),
    thanksTitle: soft(value["thanksTitle"], limits.thanksTitle),
    thanksBody: soft(value["thanksBody"], limits.thanksBody, true),
    redirectUrl: redirectUrl(value["redirectUrl"]),
    sendCopy: !anonymous && value["sendCopy"] === true,
    retentionMonths: retention === null || retention === undefined || retention === "" ? null : (retentions as readonly unknown[]).includes(retention) ? (retention as number) : (() => { throw new AppError("invalid"); })(),
    watchers: [...new Set(watchers as string[])],
  };
}

// ---- Small helpers ----------------------------------------------------------

const numericId = /^[1-9][0-9]{0,17}$/u;
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !numericId.test(value)) throw new AppError("not_found");
  return value;
}

// A form's public address: 8 letters and digits, never a word of the tool's
// own routes (these have other lengths or characters).
export const slugPattern = /^[a-z0-9]{8}$/u;
export const answerIdPattern = /^[a-z0-9]{16}$/u;

export function blank(title = ""): Definition {
  return { title, intro: "", pages: [{ id: newId(), title: "", questions: [], jumps: [] }] };
}

// A question of a kind, as the builder adds it.
export function newQuestion(kind: Kind, labels: { option: (n: number) => string } = { option: n => String(n) }): Question {
  const q: Question = { id: newId(), kind, title: "", help: "", required: false };
  if (withOptions(kind)) q.options = [1, 2].map(n => ({ id: newId(), label: labels.option(n) }));
  if (kind === "rating") q.steps = 5;
  if (kind === "scale") Object.assign(q, { from: 0, to: 10, left: "", right: "" });
  if (kind === "file") q.accept = "any";
  return q;
}

// copyQuestion gives a question new ids (its options too): a duplicate is a
// new question, whose answers are its own.
export function copyQuestion(q: Question): Question {
  const copy: Question = structuredClone(q);
  copy.id = newId();
  if (copy.options) copy.options = copy.options.map(o => ({ ...o, id: newId() }));
  return copy;
}

// copyDefinition renames every id of a form (duplicating a whole form),
// keeping its conditions and jumps pointing at the new ids.
export function copyDefinition(def: Definition): Definition {
  const map = new Map<string, string>();
  const rename = (old: string) => {
    if (!map.has(old)) map.set(old, newId());
    return map.get(old)!;
  };
  const copy: Definition = structuredClone(def);
  for (const p of copy.pages) {
    p.id = rename(p.id);
    for (const q of p.questions) {
      q.id = rename(q.id);
      if (q.options) for (const o of q.options) o.id = rename(o.id);
    }
  }
  const fix = (c: Condition) => {
    c.question = rename(c.question);
    if (typeof c.value === "string" && map.has(c.value)) c.value = map.get(c.value)!;
  };
  for (const p of copy.pages) {
    for (const q of p.questions) if (q.showIf) fix(q.showIf);
    for (const j of p.jumps) {
      fix(j.when);
      if (j.to !== END) j.to = rename(j.to);
    }
  }
  return copy;
}

// The files a file question accepts, by type, with the extension kept.
export const fileTypes: Record<string, { ext: string; family: "image" | "document" }> = {
  "image/png": { ext: "png", family: "image" },
  "image/jpeg": { ext: "jpg", family: "image" },
  "image/gif": { ext: "gif", family: "image" },
  "image/webp": { ext: "webp", family: "image" },
  "application/pdf": { ext: "pdf", family: "document" },
  "application/msword": { ext: "doc", family: "document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", family: "document" },
  "application/vnd.ms-excel": { ext: "xls", family: "document" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", family: "document" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", family: "document" },
  "application/vnd.oasis.opendocument.text": { ext: "odt", family: "document" },
  "application/vnd.oasis.opendocument.spreadsheet": { ext: "ods", family: "document" },
  "text/plain": { ext: "txt", family: "document" },
  "text/csv": { ext: "csv", family: "document" },
};
export function typesFor(accept: Accept): string[] {
  return Object.entries(fileTypes).filter(([, t]) => accept === "any" || (accept === "images" ? t.family === "image" : t.family === "document")).map(([type]) => type);
}

// What a file's first bytes say it is; the type the browser declared must
// agree. Office files are ZIP (new) or OLE (old) containers; text has no
// NUL byte.
export function sniff(head: Uint8Array, declared: string): boolean {
  const starts = (bytes: number[], at = 0) => bytes.every((b, i) => head[at + i] === b);
  switch (declared) {
    case "image/png":
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return starts([0xff, 0xd8, 0xff]);
    case "image/gif":
      return starts([0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8);
    case "application/pdf":
      return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "application/msword":
    case "application/vnd.ms-excel":
      return starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text/plain":
    case "text/csv":
      return head.length > 0 && !head.includes(0);
    default:
      return fileTypes[declared] !== undefined && starts([0x50, 0x4b, 0x03, 0x04]);
  }
}
