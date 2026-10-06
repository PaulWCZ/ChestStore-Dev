// Safe in the browser: no SDK here.
// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.
import { AppError } from "../core/tool.ts";
import { day as readDay, time as readTime, zoned } from "./time.ts";

export const limits = {
  title: 140,
  details: 1000,
  question: 200,
  option: 120,
  scaleEnd: 40,
  other: 200,
  text: 1000,
  choices: { min: 2, max: 20 },
  surveyChoices: { min: 2, max: 12 },
  dates: { min: 1, max: 40 },
  questions: { min: 1, max: 10 },
  groups: 20,
  people: 200,
  // A sign-up sheet: places per answer.
  slots: { min: 1, max: 999 },
  comment: 1000,
  // Comments on one poll, at most.
  comments: 300,
  // The organiser's reminder, at most this often (hours).
  nudgeHours: 12,
  // How far ahead a poll may close, and a date be proposed, in days.
  aheadDays: 400,
  // A poll closes at least this long after it is sent.
  minimumOpenMinutes: 10,
  // Closed polls stay on the home page this many days.
  recentDays: 60,
  // A deleted poll can be restored for this many days, then it is purged.
  purgeDays: 30,
  // Guests from outside the Chest on a date poll (lib/guests.ts): answers
  // per poll, a guest's name and email, answers per visitor and for
  // everyone per hour, and the seconds a person takes at least to fill
  // the form.
  guests: 300,
  guestName: 80,
  guestEmail: 254,
  guestsPerVisitorHour: 20,
  guestsPerHour: 600,
  guestSeconds: 2,
  // Replies to an anonymous free text: messages in one conversation.
  replies: 20,
  reply: 1000,
} as const;

export const kinds = ["choice", "date", "survey"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

export const questionKinds = ["choice", "scale", "text", "enps"] as const;
export type SurveyQuestionKind = (typeof questionKinds)[number];
export type QuestionKind = SurveyQuestionKind | "date";

// A date option's answer: yes, if need be, no.
export const dateValues = [2, 1, 0] as const;
export type DateValue = (typeof dateValues)[number];

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined || value === null) {
    if (options.optional) return "";
    throw new AppError("empty");
  }
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = options.multiline ? text.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim() : text.trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
// id reads an identifier of a row; anything else names nothing.
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

export const groupPattern = /^grp_[a-z2-7]{26}$/u;
export const memberPattern = /^mbr_[a-z2-7]{26}$/u;

// How often a pulse survey comes back.
export const repeats = ["week", "month"] as const;
export type Repeat = (typeof repeats)[number];

// eNPS (employee Net Promoter Score): "How likely are you to recommend
// working here to a friend?", 0 to 10. Promoters answer 9 or 10,
// detractors 0 to 6; the score is the share of promoters minus the share
// of detractors, from −100 to +100.
export function enps(counts: readonly number[]): { score: number; promoters: number; passives: number; detractors: number; total: number } | null {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return null;
  const detractors = counts.slice(0, 7).reduce((s, c) => s + c, 0);
  const passives = (counts[7] ?? 0) + (counts[8] ?? 0);
  const promoters = (counts[9] ?? 0) + (counts[10] ?? 0);
  return { score: Math.round(((promoters - detractors) * 100) / total), promoters, passives, detractors, total };
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid");
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AppError("invalid");
  return value;
};
const flag = (value: unknown): boolean => value === true;

// What the composer sends.
export type DateInput = { day: string; start?: string | null; end?: string | null };
export type QuestionInput = { kind: SurveyQuestionKind; text: string; options?: string[]; multiple?: boolean; low?: string; high?: string };
export type AudienceInput = { everyone: true } | { everyone: false; groups?: string[]; people?: string[] };
export type PollInput = {
  kind: Kind;
  title: string;
  details?: string;
  // A choice poll.
  options?: string[];
  multiple?: boolean;
  other?: boolean;
  // A date poll.
  dates?: DateInput[];
  // A survey.
  questions?: QuestionInput[];
  anonymous?: boolean;
  results?: "live" | "closed";
  audience?: AudienceInput;
  closes?: { day: string; time: string } | null;
  // A sign-up sheet: places per answer (choice and date polls, named).
  slots?: number | null;
  // A survey that comes back every week or month.
  repeat?: Repeat | null;
};

// What the database receives: the poll and its questions, checked.
export type OptionSpec = { label: string; day: string | null; start: string | null; end: string | null };
export type QuestionSpec = { kind: QuestionKind; text: string; multiple: boolean; other: boolean; low: string; high: string; options: OptionSpec[] };
export type PollSpec = {
  kind: Kind;
  title: string;
  details: string;
  anonymous: boolean;
  results: "live" | "closed";
  everyone: boolean;
  groups: string[];
  people: string[];
  closesAt: Date | null;
  slots: number | null;
  repeat: Repeat | null;
  questions: QuestionSpec[];
};

function labels(value: unknown, bounds: { min: number; max: number }): OptionSpec[] {
  const given = list(value).map(v => clean(v, limits.option, { optional: true })).filter(v => v !== "");
  if (given.length < bounds.min) throw new AppError("too_few", { min: bounds.min });
  if (given.length > bounds.max) throw new AppError("too_many", { max: bounds.max });
  const seen = new Set<string>();
  for (const label of given) {
    const key = label.toLocaleLowerCase("en").normalize("NFKD").replace(/\p{M}/gu, "");
    if (seen.has(key)) throw new AppError("duplicate", { label });
    seen.add(key);
  }
  return given.map(label => ({ label, day: null, start: null, end: null }));
}

const minutes = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));

// dateOptions reads the candidate days (and times) of a date poll: real
// days, from today on the Chest's clock, each option once, in time order.
export function dateOptions(value: unknown): OptionSpec[] {
  const given = list(value).map(v => {
    const o = record(v);
    const day = readDay(o["day"]);
    const start = o["start"] === undefined || o["start"] === null || o["start"] === "" ? null : readTime(o["start"]);
    const end = o["end"] === undefined || o["end"] === null || o["end"] === "" ? null : readTime(o["end"]);
    if (end !== null && start === null) throw new AppError("bad_times");
    if (start !== null && end !== null && minutes(end) <= minutes(start)) throw new AppError("bad_times");
    return { label: "", day, start, end };
  });
  if (given.length < limits.dates.min) throw new AppError("too_few", { min: limits.dates.min });
  if (given.length > limits.dates.max) throw new AppError("too_many", { max: limits.dates.max });
  const seen = new Set<string>();
  for (const o of given) {
    const key = `${o.day} ${o.start ?? ""} ${o.end ?? ""}`;
    if (seen.has(key)) throw new AppError("duplicate", { label: o.day });
    seen.add(key);
  }
  return given.sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? "").localeCompare(b.start ?? "") || (a.end ?? "").localeCompare(b.end ?? ""));
}

function surveyQuestions(value: unknown): QuestionSpec[] {
  const given = list(value);
  if (given.length < limits.questions.min) throw new AppError("too_few", { min: limits.questions.min });
  if (given.length > limits.questions.max) throw new AppError("too_many", { max: limits.questions.max });
  return given.map(v => {
    const q = record(v);
    const kind = q["kind"];
    if (kind !== "choice" && kind !== "scale" && kind !== "text" && kind !== "enps") throw new AppError("invalid");
    const text = clean(q["text"], limits.question);
    if (kind === "choice") return { kind, text, multiple: flag(q["multiple"]), other: false, low: "", high: "", options: labels(q["options"], limits.surveyChoices) };
    if (kind === "enps") return { kind, text, multiple: false, other: false, low: "", high: "", options: [] };
    if (kind === "scale") return { kind, text, multiple: false, other: false, low: clean(q["low"], limits.scaleEnd, { optional: true }), high: clean(q["high"], limits.scaleEnd, { optional: true }), options: [] };
    return { kind, text, multiple: false, other: false, low: "", high: "", options: [] };
  });
}

// readPoll checks everything the composer sends. `today` and `zone` are the
// Chest's; `known` the groups that give the tool, `knownPeople` the picked
// people who have it (null: the Chest could not say, the ids are only
// checked for their shape).
export function readPoll(input: unknown, context: { zone: string; now: Date; today: string; known: readonly string[] | null; knownPeople?: readonly string[] | null }): PollSpec {
  const o = record(input);
  const kind = o["kind"];
  if (!isKind(kind)) throw new AppError("invalid");
  const title = clean(o["title"], limits.title);
  const details = clean(o["details"], limits.details, { multiline: true, optional: true });
  let questions: QuestionSpec[];
  if (kind === "choice") questions = [{ kind: "choice", text: "", multiple: flag(o["multiple"]), other: flag(o["other"]), low: "", high: "", options: labels(o["options"], limits.choices) }];
  else if (kind === "date") questions = [{ kind: "date", text: "", multiple: true, other: false, low: "", high: "", options: dateOptions(o["dates"]) }];
  else questions = surveyQuestions(o["questions"]);

  const audience = o["audience"] === undefined ? { everyone: true } : record(o["audience"]);
  let everyone = true;
  let groups: string[] = [];
  let people: string[] = [];
  if (audience["everyone"] !== true) {
    everyone = false;
    groups = [...new Set(list(audience["groups"]).map(g => {
      if (typeof g !== "string" || !groupPattern.test(g)) throw new AppError("no_group");
      if (context.known !== null && !context.known.includes(g)) throw new AppError("no_group");
      return g;
    }))];
    people = [...new Set(list(audience["people"]).map(p => {
      if (typeof p !== "string" || !memberPattern.test(p)) throw new AppError("no_person");
      const known = context.knownPeople ?? null;
      if (known !== null && !known.includes(p)) throw new AppError("no_person");
      return p;
    }))];
    if (groups.length === 0 && people.length === 0) throw new AppError("no_group");
    if (groups.length > limits.groups) throw new AppError("too_many", { max: limits.groups });
    if (people.length > limits.people) throw new AppError("too_many", { max: limits.people });
  }

  let closesAt: Date | null = null;
  if (o["closes"] !== undefined && o["closes"] !== null) {
    const c = record(o["closes"]);
    closesAt = zoned(readDay(c["day"]), readTime(c["time"]), context.zone);
  }
  const anonymous = flag(o["anonymous"]);
  // Anonymous: results once closed, never live (lib/access.ts).
  const results = anonymous || o["results"] === "closed" ? "closed" : "live";
  let slots: number | null = null;
  if (o["slots"] !== undefined && o["slots"] !== null && o["slots"] !== "") {
    const n = o["slots"];
    if (typeof n !== "number" || !Number.isInteger(n) || n < limits.slots.min || n > limits.slots.max) throw new AppError("invalid");
    if (kind === "survey") throw new AppError("invalid");
    // A sign-up sheet says who took each place: it cannot be anonymous.
    if (anonymous) throw new AppError("slots_anonymous");
    slots = n;
  }
  let repeat: Repeat | null = null;
  if (o["repeat"] !== undefined && o["repeat"] !== null && o["repeat"] !== "") {
    if (kind !== "survey" || !(repeats as readonly unknown[]).includes(o["repeat"])) throw new AppError("invalid");
    repeat = o["repeat"] as Repeat;
    // Each round closes when the next one opens.
    closesAt = null;
  }
  return { kind, title, details, anonymous, results, everyone, groups, people, closesAt, slots, repeat, questions };
}

// checkOpening: what must hold when a poll is sent (not while it is a
// draft): the closing time ahead, candidate days not in the past.
export function checkOpening(spec: { closesAt: Date | null; questions: readonly { options: readonly { day: string | null }[] }[] }, context: { now: Date; today: string }): void {
  if (spec.closesAt) {
    if (spec.closesAt.getTime() < context.now.getTime() + limits.minimumOpenMinutes * 60_000) throw new AppError("too_soon");
    if (spec.closesAt.getTime() > context.now.getTime() + limits.aheadDays * 864e5) throw new AppError("bad_date");
  }
  for (const q of spec.questions) for (const o of q.options) if (o.day !== null && o.day < context.today) throw new AppError("past");
}

// An answer as the voting form sends it: per question id.
export type AnswerInput = Record<string, { options?: string[]; other?: string; value?: number; text?: string; dates?: Record<string, number> }>;

// The checked answer to one question.
export type Given =
  | { kind: "choice"; options: string[]; other: string }
  | { kind: "date"; values: Map<string, DateValue> }
  | { kind: "scale"; value: number }
  | { kind: "enps"; value: number }
  // replyKey: in an anonymous survey, the hash of a key only the author's
  // browser keeps, to read replies to the text (lib/replies.ts).
  | { kind: "text"; text: string; replyKey?: string };

export type QuestionShape = { id: string; kind: QuestionKind; multiple: boolean; other: boolean; options: { id: string }[] };

// readAnswer checks an answer against the poll's questions. A question left
// blank is skipped; at least one must be answered; a date poll's options
// not answered are "no". A sign-up sheet's dates take yes or no only.
export function readAnswer(input: unknown, questions: QuestionShape[], options: { slots?: boolean } = {}): Map<string, Given> {
  const o = record(input);
  const out = new Map<string, Given>();
  for (const key of Object.keys(o)) if (!questions.some(q => q.id === key)) throw new AppError("invalid");
  for (const q of questions) {
    const raw = o[q.id];
    if (raw === undefined || raw === null) continue;
    const a = record(raw);
    const known = new Set(q.options.map(opt => opt.id));
    if (q.kind === "choice") {
      const chosen = [...new Set(list(a["options"]).map(v => id(v)))];
      if (chosen.some(c => !known.has(c))) throw new AppError("invalid");
      const other = q.other ? clean(a["other"], limits.other, { optional: true }) : "";
      if (!q.other && typeof a["other"] === "string" && a["other"].trim() !== "") throw new AppError("invalid");
      const count = chosen.length + (other ? 1 : 0);
      if (count === 0) continue;
      if (!q.multiple && count > 1) throw new AppError("invalid");
      out.set(q.id, { kind: "choice", options: chosen, other });
    } else if (q.kind === "date") {
      const given = a["dates"] === undefined ? {} : record(a["dates"]);
      const values = new Map<string, DateValue>();
      for (const [k, v] of Object.entries(given)) {
        if (!known.has(k)) throw new AppError("invalid");
        if (v !== 0 && v !== 1 && v !== 2) throw new AppError("invalid");
        if (v === 1 && options.slots) throw new AppError("invalid");
        values.set(k, v);
      }
      for (const opt of q.options) if (!values.has(opt.id)) values.set(opt.id, 0);
      out.set(q.id, { kind: "date", values });
    } else if (q.kind === "scale") {
      const value = a["value"];
      if (value === undefined || value === null) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) throw new AppError("invalid");
      out.set(q.id, { kind: "scale", value });
    } else if (q.kind === "enps") {
      const value = a["value"];
      if (value === undefined || value === null) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) throw new AppError("invalid");
      out.set(q.id, { kind: "enps", value });
    } else {
      const text = clean(a["text"], limits.text, { multiline: true, optional: true });
      const replyKey = a["replyKey"];
      if (replyKey !== undefined && (typeof replyKey !== "string" || !/^[0-9a-f]{64}$/u.test(replyKey))) throw new AppError("invalid");
      if (text) out.set(q.id, { kind: "text", text, ...(typeof replyKey === "string" ? { replyKey } : {}) });
    }
  }
  if (out.size === 0) throw new AppError("no_answer");
  return out;
}
