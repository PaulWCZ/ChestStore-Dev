import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";

// The public forms' guard (Proposal (studio): the visitors module): the
// form's signed "shown at" time, and the Chest's counting of what a visitor
// does — per visitor, for everyone, and across the Chest's tools. On a
// Chest without it, the tool counts in its own table (form_counts).
export const guardLimits = { answersPerVisitorHour: 20, answersPerHour: 1000, uploadsPerVisitorHour: 30, uploadsPerHour: 1000, minimumSeconds: 2 } as const;

export const formToken = () => visitors.formToken();

// checkForm: the answer itself must come from a form the tool showed, and
// not faster than a person reads; a file sent along only from a form the
// tool showed (a one-question form is quick to fill).
export function checkForm(token: unknown, minimumSeconds: number = guardLimits.minimumSeconds): void {
  const verdict = visitors.checkForm(token, { minimumSeconds });
  if (verdict === "too_fast") throw new AppError("too_fast");
  if (verdict === "invalid") throw new AppError("invalid");
}

export async function admit(sql: Query, headers: Headers, name: "answer" | "upload"): Promise<void> {
  const perVisitor = name === "answer" ? guardLimits.answersPerVisitorHour : guardLimits.uploadsPerVisitorHour;
  const perHour = name === "answer" ? guardLimits.answersPerHour : guardLimits.uploadsPerHour;
  try {
    const { allowed } = await visitors.count(headers, name, { perVisitor, perHour });
    if (!allowed) throw new AppError("too_many");
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    await count(sql, visitors.visitor(headers), name, perVisitor, perHour);
  }
}

// count: the tool's own counters, per visitor (a hash of the Chest's
// opaque key) and for everyone, per hour.
export async function count(sql: Query, visitor: string, name: string, perVisitor: number, perHour: number, now = new Date()): Promise<void> {
  const hour = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
  const mine = `${name}:${createHash("sha256").update(visitor).digest("hex").slice(0, 32)}`;
  const all = `${name}:all`;
  const counts = await sql<{ key: string; count: number }[]>`
    insert into form_counts (key, hour, count) values (${mine}, ${hour}, 1), (${all}, ${hour}, 1)
    on conflict (key, hour) do update set count = form_counts.count + 1
    returning key, count`;
  if ((counts.find(c => c.key === mine)?.count ?? 0) > perVisitor || (counts.find(c => c.key === all)?.count ?? 0) > perHour) throw new AppError("too_many");
}
