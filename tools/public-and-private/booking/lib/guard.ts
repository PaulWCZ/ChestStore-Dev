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

export function checkForm(token: unknown): void {
  const verdict = visitors.checkForm(token, { minimumSeconds: formLimits.minimumSeconds });
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
