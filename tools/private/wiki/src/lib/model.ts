import { AppError } from "./errors.ts";
import { groupPattern, limits, memberPattern } from "../shared/model.ts";

export * from "../shared/model.ts";

// The readers of what a person sends: each refuses with a code.

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
