// The rules of a form and of an answer, without storage or framework: what
// an editor may write, what a visitor may send. Every input is read as
// untrusted and bounded here, the one place that decides what is valid.

export const limits = { title: 200, description: 1000, fields: 50, label: 200, answer: 5000, responses: 10000 } as const;

export const kinds = ["text", "long", "email"] as const;
export type Kind = (typeof kinds)[number];
export type Field = { id: string; label: string; kind: Kind; required: boolean };
export type Definition = { title: string; description: string; fields: Field[] };
export type Status = "draft" | "published" | "closed";
export type Form = Definition & { id: string; slug: string; status: Status; updated: string; responses: number };
export type Answers = Record<string, string>;
export type Response = { id: string; at: string; answers: Answers };

export class FormsError extends Error {
  readonly code: "forbidden" | "invalid" | "not_found" | "conflict" | "full";
  constructor(code: FormsError["code"]) {
    super(code);
    this.code = code;
  }
}

function invalid(): never {
  throw new FormsError("invalid");
}

// Control characters never belong in a title or a label; a long answer or a
// description keeps its line breaks and tabs.
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const lineControls = /[\u0000-\u001f\u007f]/u;

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return invalid();
  const own = Object.keys(input);
  if (own.length !== keys.length || !keys.every(k => Object.hasOwn(input, k))) return invalid();
  return input as Record<string, unknown>;
}

function line(input: unknown, max: number): string {
  if (typeof input !== "string") return invalid();
  const value = input.trim();
  if (value === "" || value.length > max || lineControls.test(value)) return invalid();
  return value;
}

// definition reads what an editor saves: a title, a description (may be
// empty) and 1 to 50 fields, each a label, a kind and whether it is
// required. Fields are named by their place: a draft has no answers yet, so
// its fields are renamed at each save.
export function definition(input: unknown): Definition {
  const value = object(input, ["title", "description", "fields"]);
  if (typeof value["description"] !== "string") return invalid();
  const description = value["description"].trim();
  if (description.length > limits.description || controls.test(description)) return invalid();
  const fields = value["fields"];
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > limits.fields) return invalid();
  return {
    title: line(value["title"], limits.title),
    description,
    fields: fields.map((raw: unknown, i): Field => {
      const field = object(raw, ["label", "kind", "required"]);
      const kind = field["kind"];
      if (typeof kind !== "string" || !(kinds as readonly string[]).includes(kind) || typeof field["required"] !== "boolean") return invalid();
      return { id: "f" + (i + 1), label: line(field["label"], limits.label), kind: kind as Kind, required: field["required"] };
    }),
  };
}

// posted reads the one JSON text an editor's page posts, bounded before it
// is parsed; definition() then says whether it is a form.
export function posted(input: unknown): unknown {
  if (typeof input !== "string" || input.length > 64 * 1024) return invalid();
  try {
    return JSON.parse(input);
  } catch {
    return invalid();
  }
}

// A stored definition is read back as strictly as a new one: storage is not
// trusted to hold only what this code wrote.
export function storedFields(input: unknown): Field[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > limits.fields) return invalid();
  return input.map((raw: unknown, i): Field => {
    const field = object(raw, ["id", "label", "kind", "required"]);
    if (field["id"] !== "f" + (i + 1) || typeof field["kind"] !== "string" || !(kinds as readonly string[]).includes(field["kind"]) || typeof field["required"] !== "boolean") return invalid();
    return { id: field["id"], label: line(field["label"], limits.label), kind: field["kind"] as Kind, required: field["required"] };
  });
}

// A deliberately plain check: something@something.something, no spaces.
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

// What is wrong with an answer, as a code the interface puts in words.
export type AnswerError = "unreadable" | "too_long" | "characters" | "required" | "email";

export type Checked = { ok: true; answers: Answers } | { ok: false; errors: Record<string, AnswerError> };

// answers reads what a visitor sends for each field of the form, by the
// field's name, and nothing else: an answer is text of 5000 characters at
// most, present when required, an address for an email field.
export function answers(read: (id: string) => unknown, fields: readonly Field[]): Checked {
  const result: Answers = {};
  const errors: Record<string, AnswerError> = {};
  for (const field of fields) {
    const raw = read(field.id);
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      errors[field.id] = "unreadable";
      continue;
    }
    const value = (raw ?? "").trim();
    if (value.length > limits.answer) errors[field.id] = "too_long";
    else if ((field.kind === "long" ? controls : lineControls).test(value)) errors[field.id] = "characters";
    else if (field.required && value === "") errors[field.id] = "required";
    else if (field.kind === "email" && value !== "" && !email.test(value)) errors[field.id] = "email";
    else result[field.id] = value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers: result };
}

// storedAnswers reads a stored answer back against its form's fields.
export function storedAnswers(input: unknown, fields: readonly Field[]): Answers {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  const result: Answers = {};
  for (const field of fields) {
    const answer = Object.hasOwn(value, field.id) ? value[field.id] : "";
    if (typeof answer !== "string" || answer.length > limits.answer) return invalid();
    result[field.id] = answer;
  }
  return result;
}

// The address of a form is its slug: ten characters of an alphabet without
// look-alikes, from 50 random bits.
export const slugPattern = /^[a-km-np-z2-9]{10}$/u;
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
export function slugOf(random: Uint8Array): string {
  if (random.length !== 10) throw new Error("ten random bytes");
  return Array.from(random, b => alphabet[b % 32]).join("");
}

export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

// csv renders responses as RFC 4180 text, a header (`received` names the
// column of dates, then the labels) then a line per response; a cell a
// spreadsheet would read as a formula is quoted as text.
export function csv(fields: readonly Field[], responses: readonly Response[], received: string): string {
  const cell = (value: string): string => {
    const safe = /^[=+\-@\t\r]/u.test(value) ? "'" + value : value;
    return /[",\r\n]/u.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
  };
  const rows = [[received, ...fields.map(f => f.label)], ...responses.map(r => [r.at, ...fields.map(f => r.answers[f.id] ?? "")])];
  return rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
