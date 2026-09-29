import { AppError } from "./app-error.ts";
import { day } from "./model.ts";

// Safe in the browser: no SDK here.
// The team's own fields — "Lead source", "Number of employees", "Contract
// end", "Segment" — on companies, contacts and deals. Four kinds: a text, a
// number, a day, one choice among a list. A record keeps its values in one
// object keyed by the field's id; an empty value is no key at all.

export const fieldObjects = ["companies", "contacts", "deals"] as const;
export type FieldObject = (typeof fieldObjects)[number];
export const isFieldObject = (value: unknown): value is FieldObject => typeof value === "string" && (fieldObjects as readonly string[]).includes(value);

export const fieldKinds = ["text", "number", "date", "choice"] as const;
export type FieldKind = (typeof fieldKinds)[number];
export const isFieldKind = (value: unknown): value is FieldKind => typeof value === "string" && (fieldKinds as readonly string[]).includes(value);

export type FieldDef = { id: string; object: FieldObject; label: string; kind: FieldKind; options: string[] };
export type Custom = Record<string, string | number>;

export const fieldLimits = { label: 60, text: 500, option: 60, options: 50, perObject: 30 } as const;

// parseNumber reads a number as people write it: "12 500", "12,5",
// "1.250,75", "-3". Up to 15 significant digits; never a thousand-separator
// guess taken for a decimal point when both are written.
export function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e15) throw new AppError("bad_number");
    return value;
  }
  if (typeof value !== "string") throw new AppError("bad_number");
  let text = value.normalize("NFKC").replace(/[\s'’]/gu, "");
  if (!/^[-+]?\d[\d.,]*$/u.test(text)) throw new AppError("bad_number");
  const dot = text.lastIndexOf("."), comma = text.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    text = text.split(group).join("").replace(decimal, ".");
  } else if (comma >= 0) {
    // One comma: a decimal comma ("12,5"), unless it groups thousands
    // ("12,500" twice or more: "1,250,000").
    text = text.split(",").length > 2 ? text.split(",").join("") : text.replace(",", ".");
  } else if (dot >= 0 && text.split(".").length > 2) text = text.split(".").join("");
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e15) throw new AppError("bad_number");
  return n;
}

// One value of a field, checked: a text, a number, a day, one of the
// choices. Empty is null (the field is left blank).
export function fieldValue(field: Pick<FieldDef, "kind" | "options">, value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  switch (field.kind) {
    case "number":
      return parseNumber(value);
    case "date":
      return day(typeof value === "string" ? value.trim() : value);
    case "choice": {
      if (typeof value !== "string") throw new AppError("invalid");
      const text = value.replace(/\s+/gu, " ").trim();
      const found = field.options.find(o => o.toLocaleLowerCase("en") === text.toLocaleLowerCase("en"));
      if (!found) throw new AppError("invalid");
      return found;
    }
    default: {
      if (typeof value !== "string" && typeof value !== "number") throw new AppError("invalid");
      const text = String(value).replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n]/gu, "").trim();
      if ([...text].length > fieldLimits.text) throw new AppError("too_long", { max: fieldLimits.text });
      return text === "" ? null : text;
    }
  }
}

// customValues checks what a form sends for a record's fields: only the
// fields of that kind of record; the given ones replace, the others stay.
// A refused value says which field (values.field).
export function customValues(fields: FieldDef[], current: Custom, input: unknown): Custom {
  if (input === undefined || input === null) return current;
  if (typeof input !== "object" || Array.isArray(input)) throw new AppError("invalid");
  const next: Custom = { ...current };
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const field = fields.find(f => f.id === key);
    if (!field) continue;
    let value: string | number | null;
    try {
      value = fieldValue(field, raw);
    } catch (error) {
      if (error instanceof AppError) throw new AppError(error.code, { ...error.values, field: field.label });
      throw error;
    }
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

// What kind of field a column of a file looks like: days, numbers, a few
// values repeated (a choice), or text.
export function guessKind(values: string[]): { kind: FieldKind; options: string[] } {
  const filled = values.map(v => v.trim()).filter(v => v !== "");
  if (filled.length === 0) return { kind: "text", options: [] };
  const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}/u.test(v) || /^\d{1,2}[/.]\d{1,2}[/.]\d{4}/u.test(v);
  if (filled.every(isDay)) return { kind: "date", options: [] };
  if (filled.every(v => { try { parseNumber(v); return true; } catch { return false; } })) return { kind: "number", options: [] };
  const distinct = [...new Map(filled.map(v => [v.toLocaleLowerCase("en"), v.slice(0, fieldLimits.option)])).values()];
  if (distinct.length <= 12 && filled.length >= distinct.length * 2) return { kind: "choice", options: distinct };
  return { kind: "text", options: [] };
}
