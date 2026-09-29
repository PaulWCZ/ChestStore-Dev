import { AppError } from "./app-error.ts";

// The rules of what people write, pure (tested alone, used in the browser
// too): bounds, the lists a field chooses from, ids, slugs.
export const limits = {
  title: 120,
  team: 80,
  place: 120,
  description: 20000,
  stageName: 40,
  stages: 12,
  name: 120,
  email: 254,
  phone: 40,
  link: 500,
  coverLetter: 10000,
  note: 5000,
  feedbackText: 3000,
  rejectNote: 500,
  emailText: 5000,
  companyName: 80,
  intro: 600,
  fileName: 200,
  cvSize: 10 << 20,
  interviewers: 50,
  jobs: 500,
  page: 500,
  postalCode: 20,
  street: 200,
  questions: 5,
  questionLabel: 200,
  questionOptions: 8,
  optionLabel: 80,
  answer: 1000,
  subject: 200,
  templateName: 80,
  templates: 100,
  interviewPlace: 200,
  interviewNote: 2000,
  interviewPeople: 10,
  searchResults: 50,
  bulk: 200,
  importRows: 2000,
  website: 300,
  photos: 3,
} as const;

export const contracts = ["permanent", "fixed_term", "internship", "apprenticeship", "freelance"] as const;
export type Contract = (typeof contracts)[number];
export const remotes = ["onsite", "hybrid", "remote"] as const;
export type Remote = (typeof remotes)[number];
export const jobStates = ["draft", "open", "closed"] as const;
export type JobState = (typeof jobStates)[number];
export const currencies = ["EUR", "GBP", "USD", "CHF", "CAD"] as const;
export type Currency = (typeof currencies)[number];
export const periods = ["year", "month", "hour"] as const;
export type Period = (typeof periods)[number];
export const rejectReasons = ["experience", "skills", "salary", "location", "filled", "withdrew", "no_answer", "other"] as const;
export type RejectReason = (typeof rejectReasons)[number];
export const recommendations = ["strong_no", "no", "yes", "strong_yes"] as const;
export type Recommendation = (typeof recommendations)[number];
export const languages = ["en", "fr"] as const;
export type Language = (typeof languages)[number];
export const retentionChoices = [6, 12, 24] as const;
export const hoursKinds = ["full_time", "part_time"] as const;
export type Hours = (typeof hoursKinds)[number];
// The reasons the company decides; the others say the candidate stepped
// back (they withdrew, never answered): no rejection email by default.
export const companyReasons = ["experience", "skills", "salary", "location", "filled", "other"] as const;
export const candidateReasons = ["withdrew", "no_answer"] as const;
export const isCandidateReason = (value: unknown): boolean => (candidateReasons as readonly unknown[]).includes(value);
// The countries a job may be in (ISO 3166-1 alpha-2): their names come
// from Intl.DisplayNames in the reader's language.
export const countries = ["FR", "BE", "CH", "LU", "MC", "DE", "AT", "NL", "ES", "PT", "IT", "IE", "GB", "DK", "SE", "NO", "FI", "PL", "CZ", "RO", "GR", "US", "CA", "MA", "TN", "DZ", "SN", "CI", "CM", "RE", "GP", "MQ", "GF", "YT", "NC", "PF", "MU", "AE", "SG", "AU"] as const;
export const isCountry = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{2}$/u.test(value) && (countries as readonly string[]).includes(value);
// Screening questions: a short text, yes or no, or one choice.
export const questionKinds = ["text", "yesno", "choice"] as const;
export type QuestionKind = (typeof questionKinds)[number];
export type Question = { id: string; kind: QuestionKind; label: string; options: string[]; required: boolean };
export type Answer = { id: string; label: string; answer: string };

const oneOf = <T extends string>(list: readonly T[]) => (value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
export const isContract = oneOf(contracts);
export const isRemote = oneOf(remotes);
export const isJobState = oneOf(jobStates);
export const isCurrency = oneOf(currencies);
export const isPeriod = oneOf(periods);
export const isRejectReason = oneOf(rejectReasons);
export const isRecommendation = oneOf(recommendations);
export const isLanguage = oneOf(languages);
export const isHours = oneOf(hoursKinds);
export const isQuestionKind = oneOf(questionKinds);

// The CVs a candidate may send: PDF, Word (old and new), 10 MiB at most.
export const cvTypes = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export type CvType = keyof typeof cvTypes;
export const isCvType = (value: unknown): value is CvType => typeof value === "string" && Object.hasOwn(cvTypes, value);

// What a file's first bytes say it is: a PDF starts with "%PDF-", an old
// Word file is an OLE compound file, a new one a ZIP. The type the browser
// declared must agree with them.
export function sniff(head: Uint8Array): CvType | null {
  const starts = (bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "application/msword";
  if (starts([0x50, 0x4b, 0x03, 0x04])) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "").replace(/\n{4,}/gu, "\n\n\n") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

// A plain email address, as the Chest's mail sends to.
const address = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
export function email(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_email");
  const text = value.trim();
  if (text.length > limits.email || !address.test(text)) throw new AppError("invalid_email");
  return text;
}

// A web address a candidate gives (LinkedIn, a portfolio): http or https
// only, so a page never links to javascript: or data:. "www.x.com" is read
// as https.
export function link(value: unknown): string {
  const text = clean(value, limits.link, { optional: true });
  if (text === "") return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/iu.test(text) ? text : "https://" + text;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AppError("invalid_link");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".") || url.username || url.password) throw new AppError("invalid_link");
  return url.href;
}

// A phone number as people write it: digits, spaces, + ( ) . - only.
export function phone(value: unknown): string {
  const text = clean(value, limits.phone, { optional: true });
  if (text !== "" && (!/^[+0-9 ().-]{6,40}$/u.test(text) || (text.match(/[0-9]/gu)?.length ?? 0) < 6)) throw new AppError("invalid");
  return text;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export const isMemberId = (value: unknown): value is string => typeof value === "string" && memberPattern.test(value);

// The address of a job on the careers page: its title in lowercase ASCII,
// words joined by "-". Names of the tool's own routes are never slugs.
export const reservedSlugs = new Set(["chest", "lang", "api", "interview", "apply", "fonts", "icon", "favicon", "chest-events", "chest-jobs", "chest-mail", "not-found", "_next", "_chest", "_dev"]);
export function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/œ/giu, "oe")
    .replace(/æ/giu, "ae")
    .replace(/ß/gu, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/u, "");
  return base === "" || reservedSlugs.has(base) ? "job" + (base ? "-" + base : "") : base;
}
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
export const isSlug = (value: unknown): value is string => typeof value === "string" && value.length <= 80 && slugPattern.test(value) && !reservedSlugs.has(value);

// A salary bound as typed: "45000", "45 000", "45,000" → 45000; empty → null.
export function amount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 100000000) throw new AppError("invalid");
    return value;
  }
  if (typeof value !== "string") throw new AppError("invalid");
  const digits = value.replace(/[\s  ,.'’]/gu, "");
  if (digits === "") return null;
  if (!/^[0-9]{1,9}$/u.test(digits)) throw new AppError("invalid");
  const n = Number(digits);
  if (n > 100000000) throw new AppError("invalid");
  return n;
}

// Whole days between two instants (days in a stage).
export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

// The default stages: keys each reader sees in their language until the
// team renames them.
export const defaultStages = ["new", "screening", "interview", "offer", "hired"] as const;
export type StagePreset = (typeof defaultStages)[number];
export const isStagePreset = oneOf(defaultStages);

// questions reads a job's screening questions as the form sends them:
// at most five; a choice has 2 to 8 options; each gets a short id that
// stays when it is edited (answers point to it).
export function questions(value: unknown): Question[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > limits.questions) throw new AppError("invalid");
  const seen = new Set<string>();
  return value.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) throw new AppError("invalid");
    const q = raw as Record<string, unknown>;
    if (!isQuestionKind(q["kind"])) throw new AppError("invalid");
    const label = clean(q["label"], limits.questionLabel);
    const options = q["kind"] === "choice" ? (Array.isArray(q["options"]) ? q["options"] : []).map(o => clean(o, limits.optionLabel, { optional: true })).filter(o => o !== "") : [];
    if (q["kind"] === "choice" && (options.length < 2 || options.length > limits.questionOptions || new Set(options).size !== options.length)) throw new AppError("invalid");
    let key = typeof q["id"] === "string" && /^q[a-z0-9]{1,12}$/u.test(q["id"]) ? q["id"] : "";
    if (!key || seen.has(key)) key = "q" + (i + 1) + Math.random().toString(36).slice(2, 8);
    seen.add(key);
    return { id: key, kind: q["kind"], label, options, required: q["required"] === true };
  });
}

// answers checks a candidate's answers against the job's questions: a
// required question answered, yes/no as "yes" or "no", a choice among the
// options. Keeps the question's words (a later edit does not change what
// the candidate was asked).
export function answers(asked: Question[], given: unknown): Answer[] {
  const found = typeof given === "object" && given !== null ? given as Record<string, unknown> : {};
  const out: Answer[] = [];
  for (const q of asked) {
    const raw = found[q.id];
    const text = typeof raw === "string" ? clean(raw, limits.answer, { multiline: q.kind === "text", optional: true }) : "";
    if (text === "") {
      if (q.required) throw new AppError("answer_missing");
      continue;
    }
    if (q.kind === "yesno" && text !== "yes" && text !== "no") throw new AppError("invalid");
    if (q.kind === "choice" && !q.options.includes(text)) throw new AppError("invalid");
    out.push({ id: q.id, label: q.label, answer: text });
  }
  return out;
}

// A day as the recruiter types it ("YYYY-MM-DD"), a real one, or null.
export function day(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid");
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw new AppError("invalid");
  return value;
}

// fold writes a text as the search compares it: lower case, no accents
// (the database's hiring_fold does the same).
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/ß/gu, "s").replace(/œ/gu, "o").replace(/æ/gu, "a").replace(/ł/gu, "l").replace(/ø/gu, "o").replace(/ı/gu, "i");
}
