import type { Member } from "@argentic/chest-sdk/member";
import type { Format } from "./i18n.ts";
import { log } from "./log.ts";
import type { ErrorCode, Words } from "./register.ts";

// What pages and actions use: refusals, redirects, the fields of an
// action's input, the actions themselves.

// ---- Refusals: a code, said to the reader by words.errors[code].
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

// ---- Thrown by a page or an action, answered by the server.
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

// A path of this tool ("/chest/notes/12?tab=2"), as the browser will read
// it — or null for anything that would leave the tool: "//evil", "/\evil",
// "/\t/evil", "https://…". The only way a redirect target is accepted.
export function toolPath(to: unknown): string | null {
  if (typeof to !== "string" || !to.startsWith("/") || to.length > 2048) return null;
  try {
    const url = new URL(to, "https://tool.invalid");
    return url.origin === "https://tool.invalid" ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}
export const redirect = (to: string): never => {
  const path = toolPath(to);
  if (path === null) throw new TypeError("redirect() takes a path of the tool");
  throw new HttpStatus(303, path);
};

// after(): work that need not delay the answer (a notification, a badge),
// done once it is sent. A failure is logged, never thrown: an unhandled
// rejection would stop the server. Nothing here may take minutes (that is
// a schedule's work): the tool may sleep.
export function after(name: string, task: () => Promise<unknown>): void {
  setImmediate(() => task().catch(error => log.error(`${name} failed`, error)));
}

// ---- The fields of an action's input. Each reads what a form sends
// (text) and what fetch sends (JSON) alike, and refuses with a code.
// read(value, all): its own value, and every value sent (for keyed()).
export type Field<T> = { read(value: unknown, all?: Record<string, unknown>): T };
// A field the sender may leave out (a box not ticked, an empty list).
type Omissible<T> = Field<T> & { readonly omissible: true };
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
  // An amount, read in cents ("12,50", "1 234.5", 12.5 → 1250, 123450,
  // 1250): store it as bigint cents, write it with f.money(cents, { cents: true }).
  money: ({ min = 0, max }: { min?: number; max: number }): Field<number> => ({
    read(value) {
      const s = typeof value === "number" ? value.toFixed(2) : text(value).replace(/[\s  ]/gu, "").replace(",", ".");
      if (!/^-?\d{1,13}(\.\d{1,2})?$/u.test(s)) fail("invalid");
      const cents = Math.round(Number(s) * 100);
      return cents >= min && cents <= max ? cents : fail("invalid");
    },
  }),
  // A row's id (a bigint column), kept as text.
  id: (): Field<string> => ({ read: value => { const s = text(value); return /^[1-9][0-9]{0,17}$/u.test(s) ? s : fail("invalid"); } }),
  // A checkbox: absent or "" is false.
  bool: (): Omissible<boolean> => ({ omissible: true, read: value => value === true || value === "true" || value === "on" || value === "1" }),
  // One of a closed list.
  choice: <const T extends string>(values: readonly T[]): Field<T> => ({ read: value => ((values as readonly unknown[]).includes(value) ? value as T : fail("invalid")) }),
  // A calendar day, YYYY-MM-DD.
  day: (): Field<string> => ({ read: value => { const s = text(value); return /^\d{4}-\d{2}-\d{2}$/u.test(s) && !Number.isNaN(Date.parse(s)) ? s : fail("invalid"); } }),
  // Absent, null or "": undefined.
  optional: <T>(inner: Field<T>): Field<T | undefined> => ({ read: (value, all) => (value === undefined || value === null || value === "" ? undefined : inner.read(value, all)) }),
  // A change that may also clear: absent is "unchanged" (undefined), null
  // or "" is "none" (null) — a due date removed.
  nullable: <T>(inner: Field<T>): Field<T | null | undefined> => ({ read: (value, all) => (value === undefined ? undefined : value === null || value === "" ? null : inner.read(value, all)) }),
  // Absent is "unchanged" (undefined); anything sent is read, "" included.
  sent: <T>(inner: Field<T>): Field<T | undefined> => ({ read: (value, all) => (value === undefined ? undefined : inner.read(value, all)) }),
  // Up to max values (a form's checkboxes of one name, a JSON array).
  list: <T>(inner: Field<T>, max: number): Omissible<T[]> => ({
    omissible: true,
    read(value, all) {
      const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
      return values.length > max ? fail("invalid") : values.map(v => inner.read(v, all));
    },
  }),
  // Every value sent under a name the pattern matches, by its first group:
  // keyed(/^d([1-9][0-9]*)$/u, field.int(…), 40) reads d12, d13… as { "12": …, "13": … }.
  keyed: <T>(pattern: RegExp, inner: Field<T>, max: number): Omissible<Record<string, T>> => ({
    omissible: true,
    read(_value, all) {
      const found: Record<string, T> = {};
      for (const [name, value] of Object.entries(all ?? {})) {
        const key = pattern.exec(name)?.[1];
        if (key !== undefined) found[key] = inner.read(value, all);
      }
      return Object.keys(found).length > max ? fail("invalid") : found;
    },
  }),
  // A structured value an island sends as JSON, taken as it is: the rules
  // of src/lib/ check it. Never from a form (a string is refused).
  json: (): Field<unknown> => ({ read: value => (value !== null && typeof value === "object" ? value : fail("invalid")) }),
};
export type Fields = Record<string, Field<unknown>>;
type Read<F> = F extends Field<infer T> ? T : never;
// What run() receives: every field, read.
export type InputOf<F extends Fields> = { [K in keyof F]: Read<F[K]> };
// What call() sends: a field that may be absent may be left out.
type Leavable<F extends Fields> = { [K in keyof F]: F[K] extends { omissible: true } ? K : unknown extends Read<F[K]> ? never : undefined extends Read<F[K]> ? K : never }[keyof F];
export type SentOf<F extends Fields> = { [K in Exclude<keyof F, Leavable<F>>]: Read<F[K]> } & { [K in Leavable<F>]?: Read<F[K]> };

export function readInput<F extends Fields>(fields: F, raw: Record<string, unknown>): InputOf<F> {
  const input: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(fields)) input[name] = f.read(raw[name], raw);
  return input as InputOf<F>;
}

// The browser's cookies: read one, set one on the answer (always Secure,
// HttpOnly, SameSite=Lax; a path of the tool, a lifetime in seconds).
export type Cookies = { get(name: string): string | undefined; set(name: string, value: string, options: { path: string; maxAge: number }): void };

// Who acts and in which words: a member on /chest, a visitor on the public
// part. The request is there for what the rest does not say.
export type MemberContext = { member: Member; locale: string; t: Words; f: Format; request: Request; cookies: Cookies };
export type VisitorContext = { member: null; locale: string; t: Words; f: Format; request: Request; cookies: Cookies };

export type Action<F extends Fields = Fields, R = unknown> = {
  readonly access: "member" | "public";
  readonly input: F;
  // The largest body it takes, in bytes (1 MiB by default).
  readonly maxBody: number;
  run(input: InputOf<F>, context: never): Promise<R>; // its context: by access
};

// action: a mutation of the members' part, POST /chest/actions/<name>.
// publicAction: one of the public part (no member), POST /actions/<name>.
// Both are called from an island (call()) or by a
// <form method="post" action="/chest/actions/<name>">. What run returns
// goes back to the island as JSON: plain data only.
export function action<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: MemberContext) => Promise<R>, options: { maxBody?: number } = {}): Action<F, R> {
  return { access: "member", input, maxBody: options.maxBody ?? 1 << 20, run: run as Action<F, R>["run"] };
}
export function publicAction<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: VisitorContext) => Promise<R>, options: { maxBody?: number } = {}): Action<F, R> {
  return { access: "public", input, maxBody: options.maxBody ?? 1 << 20, run: run as Action<F, R>["run"] };
}

// An outcome as an island receives it: the value, or the code and the
// sentence in the reader's language.
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ErrorCode; message: string };
