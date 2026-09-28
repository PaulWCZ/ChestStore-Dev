// Safe in the browser: no SDK here.
// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.
import { AppError } from "./app-error.ts";

export const limits = {
  title: 140,
  body: 20000,
  comment: 2000,
  place: 200,
  fileName: 200,
  attachmentsPerPost: 10,
  attachmentSize: 25 << 20,
  coverSize: 15 << 20,
  commentsPerPost: 1000,
  page: 20,
  // How far ahead a post may be scheduled, in days.
  scheduleDays: 366,
  // An Important post asks for confirmation this many days (then it stops
  // counting on the tile).
  confirmDays: 90,
} as const;

// The four kinds of post, in the order the composer offers them.
export const kinds = ["announcement", "event", "welcome", "info"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

// The reactions: a small fixed set, stored by name.
export const emojis = { thumbs: "👍", heart: "❤️", party: "🎉", clap: "👏", smile: "😄" } as const;
export type Emoji = keyof typeof emojis;
export const emojiNames = Object.keys(emojis) as Emoji[];
export const isEmoji = (value: unknown): value is Emoji => typeof value === "string" && Object.hasOwn(emojis, value);

// Picture types the Chest makes thumbnails of: the only covers accepted.
export const coverTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const isCoverType = (type: string): boolean => (coverTypes as readonly string[]).includes(type);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = options.multiline ? text.replace(/\n{3,}/gu, "\n\n").trim() : text.trim();
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

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export function memberId(value: unknown): string {
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("no_person");
  return value;
}

// ids reads a list of row identifiers, each once, at most max.
export function ids(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  const list = [...new Set(value.map(v => id(v)))];
  if (list.length > max) throw new AppError("too_many", { max });
  return list;
}

// A file name as a person may see it: no path, no control characters.
export function fileName(value: unknown): string {
  return clean(typeof value === "string" ? value.replace(/[/\\]/gu, "_") : value, limits.fileName);
}
