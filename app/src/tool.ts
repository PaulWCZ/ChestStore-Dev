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
  // The input field it refuses (set by the fields of an action): a form
  // shows the sentence under that field.
  field?: string;
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
// The tasks under way, for settled() of ./testing: kept on globalThis, so
// a test sees those of a server built with its own copy of the package.
export const pendingAfter = ((globalThis as Record<symbol, unknown>)[Symbol.for("@argentic/chest-app after")] ??= new Set<Promise<unknown>>()) as Set<Promise<unknown>>;
export function after(name: string, task: () => Promise<unknown>): void {
  // Started in a promise: a task that throws before its first await is
  // logged too (an uncaught throw would stop the server).
  let done: () => void = () => {};
  const tracked = new Promise<void>(resolve => { done = resolve; });
  pendingAfter.add(tracked);
  setImmediate(() => void Promise.resolve().then(task).catch(error => log.error(`${name} failed`, error)).finally(() => {
    pendingAfter.delete(tracked);
    done();
  }));
}

// cutText(text, max): text cut to at most max characters as the SDK
// counts them (code points), never inside a letter or an emoji, "…"
// ending what was cut. For a limit set elsewhere — a notification's title
// (80) or body (280), which the SDK refuses rather than cuts: a schedule
// that sends a too-long title fails at every run.
export function cutText(text: string, max: number): string {
  if ([...text].length <= max) return text;
  let kept = "";
  let size = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    const length = [...segment].length;
    if (size + length > max - 1) break;
    kept += segment;
    size += length;
  }
  return kept.trimEnd() + "…";
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

// An amount as people write it, to cents: "1234.5", "12,50", "1 234,50"
// (spaces only between groups of three), "1,234.50", "1.234,50",
// "1,000,000" and "1.000.000" (two group marks or more: whole). A group
// mark counts beside a decimal mark of the other kind; a lone "," or "."
// followed by three digits ("1,250", "0,500", "1.234") is refused with
// "amount_ambiguous": an English reader means 1250, a French one 1.25. At
// most two decimals, numbers included (12.345 and 1.005 refused, never
// rounded).
// readMoney(value, decimals): what field.money reads, for an amount whose
// currency is known only at run time (an expense in any currency, an
// island showing what will be saved): minor units, or a refusal (fail:
// "invalid", "amount_ambiguous"). The same in the browser.
export function readMoney(value: unknown, decimals = 2): number {
  return cents(value, decimals) ?? fail("invalid");
}

// decimals: the currency's minor unit (2: euros and cents; 0: yen, CFA
// francs; 3: Kuwaiti or Tunisian dinars) — the amount is read in those
// units. With 0 decimals, "1,250" and "1.250" are both 1250 (no decimal
// part to mistake them for).
function cents(value: unknown, places = 2): number | null {
  const scale = 10 ** places;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e13) return null;
    const n = Math.round(value * scale);
    return Math.abs(n / scale - value) < 1e-9 ? n : null;
  }
  // A currency's sign or code before or after the number ("€12 500",
  // "12 500 €", "12500 EUR", "-$5"): the number alone is read.
  let s = text(value).trim().replace(/^(-?)\s*(?:\p{Sc}|[A-Z]{3})\s*/u, "$1").replace(/\s*(?:\p{Sc}|[A-Z]{3})$/u, "");
  const part = places > 0 ? `(?:[.,]\\d{1,${places}})?` : "";
  // Spaces (any kind) only as group separators: "1 234,50", never "12 50".
  if (/[\s\u00a0\u202f]/u.test(s)) {
    if (!new RegExp(`^-?\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+${part}$`, "u").test(s)) return null;
    s = s.replace(spaces, "");
  }
  const plain = places > 0 ? new RegExp(`^(-?)(\\d{1,13})(?:[.,](\\d{1,${places}}))?$`, "u").exec(s) : /^(-?)(\d{1,13})()$/u.exec(s);
  // Groups of three with one and the same mark.
  const grouped = places > 0 ? new RegExp(`^(-?)(\\d{1,3}([.,])\\d{3}(?:\\3\\d{3})*)([.,])(\\d{1,${places}})$`, "u").exec(s) : null;
  const whole3 = new RegExp(`^(-?)(\\d{1,3}([.,])\\d{3}(?:\\3\\d{3})${places > 0 ? "+" : "*"})$`, "u").exec(s);
  let sign: string, whole: string, decimals: string;
  // A plain number with as many decimals as a group has digits ("1,250"
  // with 3 decimals) is the ambiguity below, not a plain amount.
  if (plain && !(places === 3 && /^-?[1-9]\d{0,2}[.,]\d{3}$/u.test(s))) [, sign = "", whole = "", decimals = ""] = plain;
  else if (grouped && grouped[3] !== grouped[4] && !/^-?0[.,]/u.test(s)) {
    sign = grouped[1] ?? "";
    whole = (grouped[2] ?? "").replace(/[.,]/gu, "");
    decimals = grouped[5] ?? "";
  } else if (whole3 && !/^-?0[.,]/u.test(s)) {
    sign = whole3[1] ?? "";
    whole = (whole3[2] ?? "").replace(/[.,]/gu, "");
    decimals = "";
  } else if (places > 0 && /^-?[1-9]\d{0,2}[.,]\d{3}$/u.test(s)) return fail("amount_ambiguous" as ErrorCode);
  else return null;
  if (whole.length > 13) return null;
  const n = Number(whole) * scale + (places > 0 ? Number(decimals.padEnd(places, "0")) : 0);
  return sign ? -n : n;
}

// A visitor's text: no control character but tab and line breaks (a NUL
// would reach PostgreSQL as an error).
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
// Bidirectional overrides and isolates (a name that reads backwards, a
// file name that hides its extension): removed. Zero-width characters
// alone are no text (empty).
const bidi = /[\u202a-\u202e\u2066-\u2069]/gu;
const invisible = /[\u200b-\u200d\u2060\ufeff]/gu;

export const field = {
  // Trimmed text, from min (1: required) to max characters (code points,
  // not UTF-16 units); bidirectional overrides removed; only invisible
  // characters is empty.
  text: ({ min = 1, max }: { min?: number; max: number }): Field<string> => ({
    read(value) {
      const s = value === undefined || value === null ? "" : text(value).replace(bidi, "").trim();
      if (controls.test(s)) fail("invalid");
      // Code points (an accented letter or a simple emoji counts one).
      const length = [...s].length;
      if ((length === 0 || s.replace(invisible, "").trim() === "") && min > 0) fail("empty");
      if (length < min) fail("invalid");
      return length > max ? fail("too_long", { max }) : s;
    },
  }),
  // A whole number between min and max, written in digits ("", "0x5",
  // "1e1" refused: an empty required number is not 0).
  int: ({ min, max }: { min: number; max: number }): Field<number, number | string> => ({
    read(value) {
      if (value === undefined || value === null) fail("empty");
      const s = typeof value === "number" ? String(value) : text(value).trim();
      if (s === "") fail("empty");
      if (!/^-?\d{1,15}$/u.test(s)) fail("invalid");
      const n = Number(s);
      return n >= min && n <= max ? n : fail("invalid");
    },
  }),
  // An amount, read in its currency's minor units (cents with decimals 2,
  // the default; above): store it as bigint, write it with f.money(n, {
  // cents: true }) for 2 decimals. min and max are in the same units.
  money: ({ min = 0, max, decimals = 2 }: { min?: number; max: number; decimals?: 0 | 1 | 2 | 3 | 4 }): Field<number, number | string> => ({
    read(value) {
      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) fail("empty");
      const n = cents(value, decimals);
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
  for (const [name, f] of Object.entries(fields)) {
    try {
      input[name] = f.read(raw[name], raw);
    } catch (error) {
      if (error instanceof AppError && error.field === undefined) error.field = name;
      throw error;
    }
  }
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
  // A public action's bound (publicAction's options).
  readonly bound?: Bound | false;
  // Sent at once by call() and forms, beside the queue of actions (a slow
  // one: AI, an import, an upload).
  readonly parallel?: boolean;
  run(input: InputOf<F>, context: never): Promise<R>; // its context: by access
};

// action: a mutation of the members' part, POST /chest/actions/<name>.
// publicAction: one of the public part (no member), POST /actions/<name>.
// Both are called from an island (call()) or by a
// <form method="post" action="/chest/actions/<name>">. What run returns
// goes back to the island as JSON: plain data only.
// parallel: true — a slow action (AI, an import, an upload) does not hold
// the others the page sends (they go one at a time otherwise).
export function action<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: MemberContext) => Promise<R>, options: { maxBody?: number; parallel?: boolean } = {}): Action<F, R> {
  return { access: "member", input, maxBody: options.maxBody ?? 1 << 20, ...(options.parallel ? { parallel: true } : {}), run: run as Action<F, R>["run"] };
}
// bound (public actions): anyone on the Internet may call one, so each is
// bounded, the same way in every tool:
// - a form token for this action: <Honeypot action="…" /> in the form
//   carries one (the page made it, signed with a key from CHEST_TOKEN and
//   the action's name: another action refuses it); it lasts formMinutes (120 by
//   default) and serves once, whatever the answer (each answer, and the
//   page a form goes back to, brings the next) — without a fresh one,
//   "expired"; with formSeconds, a form sent sooner than a person fills it
//   waits the seconds left;
// - a robot that fills <Honeypot />'s field ("website") is answered "done"
//   and nothing is done;
// - budgets, a day (the Chest's): perVisitor for one visitor, perDay for
//   everyone together, perSubject (with charge(kind, { subject })) for one
//   thing written to (a guest link, a booking). The visitor is the address
//   the Chest's front gives (Chest-Visitor-Address, a studio proposal: no
//   Chest gives it yet), else the browser's cookie (chest_v); one with
//   neither counts in perDay only. A visitor who already wrote today keeps
//   a reserve past perDay (a tenth). Past a budget: "limit".
// What it holds, and what it does not: a written call is counted only once
// valid (the token, the fields, and what the run checks before charge();
// a run that throws gives its counts back), so junk never writes and a
// person's mistakes cost nothing. But each fresh token is one free page
// load: a robot without an address the Chest can name, clearing its
// cookie, can still spend perDay with calls that pass the checks, and the
// people coming after it then meet "limit" until tomorrow (the people who
// wrote earlier keep the reserve). Fair public writes need the visitor's
// address from the Chest's front — a blocker the SDK report names.
// Refusals are counted per visitor and for everyone: a visitor past ten
// times their budget (at least 20) is refused before the run; everyone's
// ceiling (ten times perDay) never refuses a call — past it, the run is
// told (flooded) so its checks stay cheap. A public request should never
// call the Chest at all (cache a minute, or the tool's own table).
// Kinds of write with budgets of their own (a new booking, a change to
// one): { budgets: { new: …, change: … } }, and run says which once it has
// checked the request: await charge("new"). Counted in chest_bounds,
// tokens in chest_seen (the tool's migrations/0001_chest.sql).
// checkSources() fails on a publicAction without bound; bound: false says
// the action writes nothing anyone could fill (or guards itself).
export type Budget = { perVisitor: number; perDay: number; perSubject?: number };
// work: a proof of work the browser computes before it sends (a Worker;
// true = 14 bits, a fraction of a second on a laptop, about a second at
// worst on a mid-range phone; twice, then four times harder as the day's
// budget runs low) — a robot pays it for every call. The form
// then needs JavaScript.
export type Bound = (Budget | { budgets: Readonly<Record<string, Budget>> }) & { formMinutes?: number; formSeconds?: number; work?: boolean | number };
// What a public action's run gets: the visitor, and charge(kind, { subject }),
// the budget it spends (with budgets of several kinds; once per call).
// flooded: refusals today passed ten times the day's budget — keep the
// checks cheap (nothing that asks the Chest; what it said a minute ago).
export type PublicContext = VisitorContext & { charge(kind: string, options?: { subject?: string }): Promise<void>; flooded: boolean };
export function publicAction<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: PublicContext) => Promise<R>, options: { maxBody?: number; bound?: Bound | false; parallel?: boolean } = {}): Action<F, R> {
  if (options.bound && !("budgets" in options.bound) && options.bound.perSubject !== undefined) throw new TypeError("publicAction: perSubject needs budgets by kind and charge(kind, { subject }) in the run");
  return { access: "public", input, maxBody: options.maxBody ?? 1 << 20, ...(options.bound !== undefined ? { bound: options.bound } : {}), ...(options.parallel ? { parallel: true } : {}), run: run as Action<F, R>["run"] };
}

// An outcome as an island receives it: the value, or the code and the
// sentence in the reader's language.
// field: the input field a refusal is about (a form shows it under it).
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ErrorCode; message: string; field?: string };
