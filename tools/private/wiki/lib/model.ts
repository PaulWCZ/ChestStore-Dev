import { AppError } from "./app-error.ts";

// The rules of what a person writes. No framework, no database: tested alone.

export const limits = {
  spaceName: 80,
  spaceDescription: 300,
  spaces: 200,
  groupsPerSpace: 16,
  editorsPerSpace: 100,
  title: 200,
  pages: 5000,
  depth: 12,
  fileName: 200,
  fileSize: 25 << 20,
  filesPerPage: 200,
  query: 100,
  importPages: 500,
  importBytes: 60 << 20,
  importFile: 2 << 20,
  versionsShown: 200,
  comment: 5000,
  commentsPerPage: 1000,
  watchedPerMember: 2000,
  templatesShown: 30,
} as const;

// How often a page's owner is asked to check it is still correct.
export const reviewEvery = [3, 6, 12] as const;
export type ReviewMonths = (typeof reviewEvery)[number];
export const isReviewMonths = (value: unknown): value is ReviewMonths => typeof value === "number" && (reviewEvery as readonly number[]).includes(value);

// Someone editing a page keeps it for themselves while they are active;
// idle this long, another editor may take it over.
export const lockIdleMinutes = 15;
// The editor saves the draft this often while typing, which keeps the lock.
export const draftEverySeconds = 2;
// An open editor says so this often; a lock not heard of for the lease
// (a closed tab, a crashed laptop) is free again — a tab that is closed
// properly gives it back at once.
export const heartbeatSeconds = 30;
export const lockLeaseSeconds = 120;

// The colours of spaces: names the design turns into tokens.
export const colors = ["green", "blue", "plum", "rust", "ochre", "slate"] as const;
export type Color = (typeof colors)[number];
export const isColor = (value: unknown): value is Color => typeof value === "string" && (colors as readonly string[]).includes(value);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.trim();
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
export const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export const groupPattern = /^grp_[a-z2-7]{26}$/u;

export function groupIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" && groupPattern.test(v))) throw new AppError("invalid");
  const ids = [...new Set(value as string[])];
  if (ids.length > limits.groupsPerSpace) throw new AppError("too_many", { max: limits.groupsPerSpace });
  return ids;
}

// The groups and people who edit a space kept to some editors.
export function editorIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" && (groupPattern.test(v) || memberPattern.test(v)))) throw new AppError("invalid");
  const ids = [...new Set(value as string[])];
  if (ids.length > limits.editorsPerSpace) throw new AppError("too_many", { max: limits.editorsPerSpace });
  return ids;
}

// A file name as a person sees it: no path, no control characters.
export function fileName(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const base = raw.split(/[\\/]/u).at(-1) ?? "";
  const text = base.replace(/\p{Cc}/gu, "").trim().slice(0, limits.fileName);
  return text || "file";
}

// The parts of a comment: plain text, and the web addresses in it (http,
// https), which become links. Punctuation that ends a sentence is not part
// of an address; a closing parenthesis is, when the address opened one.
export type TextPart = { text: string; href?: string };

export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const found of text.matchAll(/\bhttps?:\/\/[^\s<>"]+/giu)) {
    let url = found[0];
    for (;;) {
      const end = url.at(-1) ?? "";
      if (/[.,;:!?'’»]/u.test(end)) url = url.slice(0, -1);
      else if (end === ")" && (url.match(/\(/gu)?.length ?? 0) < (url.match(/\)/gu)?.length ?? 0)) url = url.slice(0, -1);
      else break;
    }
    if (!/^https?:\/\/[^/?#\s]+/iu.test(url)) continue;
    const at = found.index;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: url, href: url });
    last = at + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
