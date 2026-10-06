// The rules of what a person writes, the browser's side too (the bounds,
// the editor's timings, the links of a comment): pure, no server code.
// src/lib/model.ts adds the readers that refuse (AppError) and
// re-exports these.

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
  importHtml: 8 << 20,
  versionsShown: 200,
  comment: 5000,
  quote: 300,
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

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export const groupPattern = /^grp_[a-z2-7]{26}$/u;

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
