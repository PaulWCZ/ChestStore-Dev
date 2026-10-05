import type { Member } from "@argentic/chest-sdk/member";
import type { Catalogue, Format, Locale } from "../i18n/index.ts";

// What an action or a page refuses, as a code: the catalogue's errors.<code>
// says it to the reader. Services never write sentences.
export type ErrorCode = keyof Catalogue["errors"];
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly values: Record<string, string | number>;
  constructor(code: ErrorCode, values: Record<string, string | number> = {}) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.values = values;
  }
}
export const fail = (code: ErrorCode, values?: Record<string, string | number>): never => {
  throw new AppError(code, values);
};

// Thrown by a page or an action, answered by the server.
export class HttpStatus extends Error {
  readonly status: 303 | 403 | 404;
  readonly to: string | undefined;
  constructor(status: 303 | 403 | 404, to?: string) {
    super(String(status));
    this.status = status;
    this.to = to;
  }
}
export const notFound = (): never => { throw new HttpStatus(404); };
export const forbidden = (): never => { throw new HttpStatus(403); };
// To a path of this tool ("/chest/notes/12"), never a full address.
export const redirect = (to: string): never => {
  if (!/^\/(?!\/)/u.test(to)) throw new TypeError("redirect() takes a path of the tool");
  throw new HttpStatus(303, to);
};

// The fields of an action's input. Each reads what a form sends (text) and
// what fetch sends (JSON) alike, and refuses anything else with a code.
export type Field<T> = { read(value: unknown): T };
const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : fail("invalid"));
export const field = {
  // Trimmed text, from min (1: required) to max characters.
  text: ({ min = 1, max }: { min?: number; max: number }): Field<string> => ({
    read(value) {
      const s = value === undefined || value === null ? "" : text(value).trim();
      if (s.length === 0 && min > 0) fail("empty");
      if (s.length < min) fail("invalid");
      return s.length > max ? fail("too_long", { max }) : s;
    },
  }),
  // A whole number between min and max.
  int: ({ min, max }: { min: number; max: number }): Field<number> => ({
    read(value) {
      const n = Number(text(value));
      return Number.isSafeInteger(n) && n >= min && n <= max ? n : fail("invalid");
    },
  }),
  // A row's id (a bigint column), kept as text.
  id: (): Field<string> => ({ read: value => { const s = text(value); return /^[1-9][0-9]{0,17}$/u.test(s) ? s : fail("invalid"); } }),
  // A checkbox: absent or "" is false.
  bool: (): Field<boolean> => ({ read: value => value === true || value === "true" || value === "on" || value === "1" }),
  // One of a closed list.
  choice: <const T extends string>(values: readonly T[]): Field<T> => ({ read: value => (values as readonly unknown[]).includes(value) ? value as T : fail("invalid") }),
  // A calendar day, YYYY-MM-DD.
  day: (): Field<string> => ({ read: value => { const s = text(value); return /^\d{4}-\d{2}-\d{2}$/u.test(s) && !Number.isNaN(Date.parse(s)) ? s : fail("invalid"); } }),
  optional: <T>(inner: Field<T>): Field<T | undefined> => ({ read: value => (value === undefined || value === null || value === "" ? undefined : inner.read(value)) }),
  list: <T>(inner: Field<T>, max: number): Field<T[]> => ({
    read(value) {
      const all = value === undefined ? [] : Array.isArray(value) ? value : [value];
      return all.length > max ? fail("invalid") : all.map(v => inner.read(v));
    },
  }),
};
type Fields = Record<string, Field<unknown>>;
export type InputOf<F extends Fields> = { [K in keyof F]: F[K] extends Field<infer T> ? T : never };

// Who acts and in which words: a member on /chest, a visitor on the public
// part. The request is there for what the rest does not say.
export type MemberContext = { member: Member; locale: Locale; t: Catalogue; f: Format; request: Request };
export type VisitorContext = { member: null; locale: Locale; t: Catalogue; f: Format; request: Request };

export type Action<F extends Fields = Fields, R = unknown> = {
  access: "member" | "public";
  input: F;
  run(input: InputOf<F>, context: MemberContext & VisitorContext): Promise<R>;
};

// action: a mutation of the members' part, POST /chest/actions/<name>.
// publicAction: one of the public part (no member), POST /actions/<name>.
// Both are called from an island (call(), src/core/client.ts) or by a
// <form method="post" action={actionPath("name")}> (works without
// JavaScript, refreshes in place with it). What run returns goes back to
// the island as JSON: plain data only.
export function action<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: MemberContext) => Promise<R>): Action<F, R> {
  return { access: "member", input, run: run as Action<F, R>["run"] };
}
export function publicAction<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: VisitorContext) => Promise<R>): Action<F, R> {
  return { access: "public", input, run: run as Action<F, R>["run"] };
}

export function readInput<F extends Fields>(fields: F, raw: Record<string, unknown>): InputOf<F> {
  const input: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(fields)) input[name] = f.read(raw[name]);
  return input as InputOf<F>;
}

// An outcome as an island receives it: the value, or the code and the
// sentence in the reader's language.
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ErrorCode; message: string };
