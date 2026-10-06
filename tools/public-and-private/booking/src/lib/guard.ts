import { createHash, randomBytes } from "node:crypto";
import type { Cookies } from "@argentic/chest-app";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import { AppError } from "./app-error.ts";
import { formLimits, guard, type FormKind } from "./booking.ts";
import type { Query } from "./db.ts";

// The public forms' guard (Proposal (studio): the visitors module): the
// form's signed "shown at" time, then the counting of what a visitor does
// — per visitor, for everyone, and across the Chest's tools when the Chest
// counts, else in the tool's own database (form_counts). The actions call
// it only once a request is valid (the type exists, the time is
// well-formed, the guest's link opens a booking): a request that could
// never have done anything is refused without counting, so junk cannot
// close the form to everyone.

export const formToken = (now?: number) => visitors.formToken(now);
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

// checkForm refuses a form that is not ours or was shown more than
// formLimits.tokenHours ago; one sent faster than a person types (a
// browser that fills the fields itself, a quick returning guest) is not
// refused: the answer waits the few seconds left — a person sees a slower
// "Booking…", a robot gains nothing.
export async function checkForm(token: unknown, now = Date.now, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<void> {
  const minimumSeconds = formLimits.minimumSeconds;
  const options = () => ({ minimumSeconds, maximumHours: formLimits.tokenHours, now: now() });
  let verdict = visitors.checkForm(token, options());
  if (verdict === "too_fast") {
    const shown = Number(String(token).split(".")[0]);
    await sleep(Math.max(0, Math.min(minimumSeconds * 1000, shown + minimumSeconds * 1000 - now())) + 20);
    verdict = visitors.checkForm(token, options());
  }
  if (verdict === "too_fast") throw new AppError("too_fast");
  if (verdict === "invalid") throw new AppError("invalid");
}

// One booking per form shown: the token is taken for the booking it makes
// (claimed before, given back when the booking fails — a time just taken,
// a field to correct —, kept once it succeeds); a second booking with the
// same token is refused. Tokens older than their life are forgotten by the
// nightly cleanup.
export async function claimForm(sql: Query, token: string): Promise<() => Promise<void>> {
  const key = hash(token);
  const taken = await sql`insert into form_tokens (hash) values (${key}) on conflict do nothing returning hash`;
  if (taken.length === 0) throw new AppError("invalid");
  return async () => { await sql`delete from form_tokens where hash = ${key}`; };
}

// Who the visitor is for the tool's own counters: the address the Chest's
// front saw (visitors.address(): Chest-Visitor-Address, never
// X-Forwarded-For), else a cookie of this browser's own (random, a year).
// A robot may drop the cookie: it then counts as a new visitor each time,
// and only the counters for everyone bound it — as they bound all.
const visitorCookie = "chest_v";
export function visitorOf(headers: Headers, cookies: Cookies): string {
  const address = visitors.address(headers);
  if (address) return "a:" + address.slice(0, 64);
  let id = cookies.get(visitorCookie);
  if (!id || !/^[A-Za-z0-9_-]{22}$/u.test(id)) {
    id = randomBytes(16).toString("base64url");
    cookies.set(visitorCookie, id, { path: "/", maxAge: 365 * 86400 });
  }
  return "c:" + id;
}

// admit counts one valid attempt of a kind (a booking, or a change of one
// — counted apart: changes never close the booking form). subject: what
// the attempt is about (the form's token, the guest's link), counted too
// so that one of them cannot be replayed to fill the counters. The
// Chest's counters (visitors.count) are asked only when it names the
// visitor: without an address its per-visitor limit would hold every
// visitor of the Chest together.
export async function admit(sql: Query, headers: Headers, cookies: Cookies, kind: FormKind, subject: string): Promise<void> {
  if (visitors.address(headers)) {
    try {
      const { allowed } = await visitors.count(headers, kind, { perVisitor: formLimits.perVisitorHour, perHour: formLimits.perHour });
      if (!allowed) throw new AppError("too_many");
      return;
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  await guard(sql, visitorOf(headers, cookies), kind, hash(subject));
}
