import { log } from "@argentic/chest-app";
import type { Query } from "./db.ts";
import type { Form } from "./forms.ts";

// A form's public answers, per visitor and day (an office behind one
// address, a kiosk at an event: one visitor), per form (a flood on one
// form leaves the company's other forms open) and in all. A form whose
// answers go further — a contact in Clients, a ticket in Support, a post
// to a web address, a copy by email — has much tighter budgets of its own
// ("reaching"): a robot that answers it makes records elsewhere, not only
// rows here. Files the same way, kept low: a visitor's file is up to
// 10 MiB, and nothing names the visitor (Settings says these numbers).
// watchFlood (below) tells the operator's log when a form's day runs low.
export const publicLimits = {
  answers: { perVisitor: 100, perSubject: 2000, perDay: 20_000 },
  reaching: { perVisitor: 20, perSubject: 200, perDay: 2000 },
  files: { perVisitor: 30, perSubject: 200, perDay: 1000 },
  formSeconds: 3,
} as const;

// A public form is open to anyone on the Internet, and nothing names a
// visitor who sends no cookie: a robot can answer it as fast as the
// package's budgets let it (publicLimits, above). Two things
// follow here.
//
// reaches: whether an answer of this form goes further than Forms — a
// contact in Clients, a ticket in Support, a post to a web address, a copy
// by email. Such a form spends the tighter "reaching" budget: a flood
// makes at most that many records elsewhere in a day.
export async function reaches(sql: Query, form: Pick<Form, "id" | "routes" | "sendCopy" | "anonymous">): Promise<boolean> {
  if (form.anonymous) return false;
  if (form.routes.contact || form.routes.request || form.sendCopy) return true;
  const [hook] = await sql`select 1 from form_hooks where form_id = ${form.id} and disabled_at is null limit 1`;
  return hook !== undefined;
}

// watchFlood: the operator sees a flood in the tool's log — once when a
// form has taken half of its day's budget, once at four fifths, once when
// it is spent (later answers are refused "limit" until tomorrow). Only
// counts and the form's id are written, never an answer.
export const floodMarks = [0.5, 0.8, 1] as const;
export async function watchFlood(sql: Query, form: Pick<Form, "id">, perDay: number): Promise<void> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from answers
    where form_id = ${form.id} and deleted_at is null and created_at >= current_date`;
  const before = row?.n ?? 0;
  const mark = crossed(before, perDay);
  if (mark !== null) log.warn(mark === 1 ? "public answers: the form's budget for today is spent" : "public answers: the form's budget for today runs low", { form: form.id, today: before + 1, budget: perDay });
}

// crossed: the mark this answer (the one after `before`) reaches, if any.
export function crossed(before: number, perDay: number): number | null {
  for (const mark of floodMarks) {
    const at = Math.ceil(perDay * mark);
    if (before < at && before + 1 >= at) return mark;
  }
  return null;
}
