import { notFound, redirect } from "next/navigation";
import { AppError } from "../../../../../lib/app-error.ts";
import { composeData, guestNames, initialOf } from "../../../../../lib/compose.ts";
import { composeWords } from "../../../../../lib/compose-words.ts";
import { db } from "../../../../../lib/db.ts";
import { expense } from "../../../../../lib/expenses.ts";
import { format } from "../../../../../lib/i18n/index.ts";
import { viewer } from "../../../../../lib/session.ts";
import { AllowanceForm, ExpenseForm, TripForm } from "../../../compose.tsx";

// Edit a draft (a refused one shows why, above the fields).
export default async function EditExpense({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const found = await expense(sql, member, id).catch(error => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!found || found.expense.deleted) notFound();
  if (!found.access.own || found.expense.status !== "draft") redirect(`/chest/expenses/${id}`);
  const e = found.expense;
  const data = await composeData(sql, member, t, locale, { category: e.categoryId, ...(e.allowance ? { allowance: e.allowance.id } : {}) });
  const initial = initialOf(e, locale, await guestNames(e, locale));
  return (
    <div className="page">
      <div className="page-head">
        <h1>{e.trip ? t.form.editTrip : e.allowance ? t.form.editAllowance : t.form.editTitle}</h1>
      </div>
      {e.refusedReason && <p className="notice bad refused-note">{format(t.home.refusedBecause, { reason: e.refusedReason })}</p>}
      {e.trip && <TripForm data={data} initial={initial} locale={locale} t={composeWords(t)} />}
      {e.allowance && <AllowanceForm data={data} initial={initial} locale={locale} t={composeWords(t)} />}
      {!e.trip && !e.allowance && <ExpenseForm data={data} initial={initial} locale={locale} t={composeWords(t)} />}
    </div>
  );
}
