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

const oneOf = <T extends string>(list: readonly T[]) => (value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
export const isContract = oneOf(contracts);
export const isRemote = oneOf(remotes);
export const isJobState = oneOf(jobStates);
export const isCurrency = oneOf(currencies);
export const isPeriod = oneOf(periods);
export const isRejectReason = oneOf(rejectReasons);
export const isRecommendation = oneOf(recommendations);
export const isLanguage = oneOf(languages);

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
export const reservedSlugs = new Set(["chest", "lang", "api", "apply", "fonts", "icon", "favicon", "chest-events", "chest-jobs", "chest-mail", "not-found", "_next", "_chest", "_dev"]);
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

export const defaultStages = ["new", "screening", "interview", "offer", "hired"] as const;
