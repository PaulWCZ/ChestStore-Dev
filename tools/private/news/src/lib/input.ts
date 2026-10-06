import { AppError } from "@argentic/chest-app";
import { groupPattern, idPattern, limits, memberPattern } from "../shared/model.ts";

// What a person sends, read and refused with a code: texts, row ids,
// member ids, file names, the groups and people a post is kept to. The
// bounds are src/shared/model.ts's (the browser shows them too).

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/[^\S\u00a0\u202f]+/gu, " ").replace(/\p{Cc}/gu, "");
  text = options.multiline ? text.replace(/\n{3,}/gu, "\n\n").trim() : text.trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

// id reads an identifier of a row; anything else names nothing.
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

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

// groupIds reads the groups a post is kept to: each once, sorted, at most
// limits.groupsPerPost; anything else is no group.
export function groupIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  if (value.some(v => typeof v !== "string" || !groupPattern.test(v))) throw new AppError("no_group");
  const list = [...new Set(value as string[])].sort();
  if (list.length > limits.groupsPerPost) throw new AppError("too_many", { max: limits.groupsPerPost });
  return list;
}

// peopleIds reads the people a post is kept to: member ids, each once,
// sorted, at most limits.peoplePerPost.
export function peopleIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  if (value.some(v => typeof v !== "string" || !memberPattern.test(v))) throw new AppError("no_person");
  const list = [...new Set(value as string[])].sort();
  if (list.length > limits.peoplePerPost) throw new AppError("too_many", { max: limits.peoplePerPost });
  return list;
}
