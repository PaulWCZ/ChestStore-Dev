import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import { AppError } from "./app-error.ts";
import { formLimits, guard } from "./booking.ts";
import type { Query } from "./db.ts";
import { visitorKey } from "./public-origin.ts";

// The public forms' guard (Proposal (studio): the visitors module): the
// form's signed "shown at" time, and the Chest's counting of what a visitor
// does — per visitor, for everyone, and across the Chest's tools. On a
// Chest without it, the tool counts in its own database (form_counts).

export const formToken = () => visitors.formToken();

// checkForm refuses a form that is not ours; one sent faster than a person
// types (a browser that fills the fields itself, a quick returning guest)
// is not refused: the answer waits the few seconds left — a person sees a
// slower "Booking…", a robot gains nothing.
export async function checkForm(token: unknown, now = Date.now, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<void> {
  const minimumSeconds = formLimits.minimumSeconds;
  let verdict = visitors.checkForm(token, { minimumSeconds, now: now() });
  if (verdict === "too_fast") {
    const shown = Number(String(token).split(".")[0]);
    await sleep(Math.max(0, Math.min(minimumSeconds * 1000, shown + minimumSeconds * 1000 - now())) + 20);
    verdict = visitors.checkForm(token, { minimumSeconds, now: now() });
  }
  if (verdict === "too_fast") throw new AppError("too_fast");
  if (verdict === "invalid") throw new AppError("invalid");
}

export async function admit(sql: Query, headers: Headers, name: "book" | "change"): Promise<void> {
  try {
    const { allowed } = await visitors.count(headers, name, { perVisitor: formLimits.perVisitorHour, perHour: formLimits.perHour });
    if (!allowed) throw new AppError("too_many");
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    await guard(sql, visitorKey(headers));
  }
}
