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
// it — or null for anything that could leave the tool or reach another
// path than it reads: "//evil", "/\evil", "/<tab>/evil", "https://…", and
// any "." or ".." segment, raw or encoded ("/..//evil" would become
// "//evil"). The only way a redirect target is accepted.
export function toolPath(to: unknown): string | null {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//") || to.length > 2048) return null;
  if (/[\\\u0000-\u001f\u007f]/u.test(to)) return null;
  const path = to.split(/[?#]/u)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.split("/").some(segment => segment === "." || segment === "..")) return null;
  try {
    const url = new URL(to, "https://tool.invalid");
    const result = url.pathname + url.search + url.hash;
    return url.origin === "https://tool.invalid" && !result.startsWith("//") ? result : null;
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
// Two types: what run() receives (T, read) and what call() may send (W,
// on the wire): field.money() reads 1250 from "12,50", "12.50" or 12.5.
export type Field<T, W = T> = { read(value: unknown, all?: Record<string, unknown>): T; readonly wire?: W };
// A field the sender may leave out (a box not ticked, an empty list).
type Omissible<T, W = T> = Field<T, W> & { readonly omissible: true };
const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : fail("invalid"));
const spaces = /[\s\u00a0\u202f]/gu;

// An amount as people write it, to cents: "1234.5", "1 234,50" (any
// space), "1,234.50", "1.234,50", "1,234" (English thousands). A lone "."
// or "," followed by one or two digits is the decimal mark; "12.345" and
// "1.234" are refused (which one was meant?).
function cents(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  const s = text(value).replace(spaces, "");
  const m = /^(-?)(\d+(?:([.,])\d{3})*)(?:([.,])(\d{1,2}))?$/u.exec(s);
  if (!m) return null;
  const [, sign, whole = "", group, mark, decimals = ""] = m;
  if (group && (group === mark || (group === "." && mark !== ","))) return null;
  if (group && !/^\d{1,3}([.,]\d{3})+$/u.test(whole)) return null;
  const digits = whole.replace(/[.,]/gu, "");
  if (digits.length > 13) return null;
  const n = Number(digits) * 100 + Number(decimals.padEnd(2, "0"));
  return sign ? -n : n;
}

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
  // A whole number between min and max, written in digits ("", "0x5",
  // "1e1" refused: an empty required number is not 0).
  int: ({ min, max }: { min: number; max: number }): Field<number, number | string> => ({
    read(value) {
      const s = typeof value === "number" ? String(value) : text(value).trim();
      if (s === "") fail("empty");
      if (!/^-?\d{1,15}$/u.test(s)) fail("invalid");
      const n = Number(s);
      return n >= min && n <= max ? n : fail("invalid");
    },
  }),
  // An amount, read in cents (above): store it as bigint cents, write it
  // with f.money(cents, { cents: true }). min and max are in cents.
  money: ({ min = 0, max }: { min?: number; max: number }): Field<number, number | string> => ({
    read(value) {
      if (typeof value === "string" && value.trim() === "") fail("empty");
      const n = cents(value);
      return n !== null && n >= min && n <= max ? n : fail("invalid");
    },
  }),
  // A row's id (a bigint column), kept as text.
  id: (): Field<string, string | number> => ({ read: value => { const s = text(value); return /^[1-9][0-9]{0,17}$/u.test(s) ? s : fail("invalid"); } }),
  // A checkbox: absent or "" is false.
  bool: (): Omissible<boolean, boolean | string> => ({ omissible: true, read: value => value === true || value === "true" || value === "on" || value === "1" }),
  // One of a closed list.
  choice: <const T extends string>(values: readonly T[]): Field<T> => ({ read: value => ((values as readonly unknown[]).includes(value) ? value as T : fail("invalid")) }),
  // A calendar day that exists, YYYY-MM-DD (2026-02-31 refused).
  day: (): Field<string> => ({
    read: value => {
      const s = text(value).trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(s);
      const at = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
      return at && at.toISOString().slice(0, 10) === s ? s : fail("invalid");
    },
  }),
  // Absent, null or "": undefined.
  optional: <T, W>(inner: Field<T, W>): Field<T | undefined, W | "" | null | undefined> => ({ read: (value, all) => (value === undefined || value === null || value === "" ? undefined : inner.read(value, all)) }),
  // A change that may also clear: absent is "unchanged" (undefined), null
  // or "" is "none" (null) — a due date removed.
  nullable: <T, W>(inner: Field<T, W>): Field<T | null | undefined, W | "" | null | undefined> => ({ read: (value, all) => (value === undefined ? undefined : value === null || value === "" ? null : inner.read(value, all)) }),
  // Absent is "unchanged" (undefined); anything sent is read, "" included.
  sent: <T, W>(inner: Field<T, W>): Field<T | undefined, W | undefined> => ({ read: (value, all) => (value === undefined ? undefined : inner.read(value, all)) }),
  // Up to max values (a form's checkboxes of one name, a JSON array).
  list: <T, W>(inner: Field<T, W>, max: number): Omissible<T[], readonly W[]> => ({
    omissible: true,
    read(value, all) {
      const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
      return values.length > max ? fail("invalid") : values.map(v => inner.read(v, all));
    },
  }),
  // Every value sent under a name the pattern matches, by its first group:
  // keyed(/^d([1-9][0-9]*)$/u, field.int(…), 40) reads d12, d13… as { "12": …, "13": … }.
  // From call(), send the names themselves beside the other fields.
  keyed: <T, W>(pattern: RegExp, inner: Field<T, W>, max: number): Omissible<Record<string, T>, never> => ({
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
export type Fields = Record<string, Field<unknown, any>>;
type Read<F> = F extends Field<infer T, unknown> ? T : never;
type Wire<F> = F extends { readonly wire?: infer W } ? W : never;
// What run() receives: every field, read.
export type InputOf<F extends Fields> = { [K in keyof F]: Read<F[K]> };
// What call() sends: the wire types; a field that may be absent may be
// left out.
type Leavable<F extends Fields> = { [K in keyof F]: F[K] extends { omissible: true } ? K : unknown extends Wire<F[K]> ? never : undefined extends Wire<F[K]> ? K : never }[keyof F];
export type SentOf<F extends Fields> = { [K in Exclude<keyof F, Leavable<F>>]: Wire<F[K]> } & { [K in Leavable<F>]?: Wire<F[K]> };

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
