import { Calendar, Car, Receipt } from "../../../components/icons.tsx";
import { composeData } from "../../../lib/compose.ts";
import { composeWords } from "../../../lib/compose-words.ts";
import { db } from "../../../lib/db.ts";
import { viewer } from "../../../lib/session.ts";
import { AllowanceForm, ExpenseForm, TripForm } from "../compose.tsx";

// Add an expense: a receipt (the photo first, then the amount), a trip
// with one's own vehicle (?trip=1), or a flat rate (?allowance=1).
export default async function NewExpense({ searchParams }: { searchParams: Promise<{ trip?: string; allowance?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const query = await searchParams;
  const kind = query.trip === "1" ? "trip" : query.allowance === "1" ? "allowance" : "receipt";
  const data = await composeData(db(), member, t, locale);
  const words = composeWords(t);
  return (
    <main className="page">
      <div className="compose-top page-head">
        <h1>{kind === "trip" ? t.form.newTrip : kind === "allowance" ? t.form.newAllowance : t.form.newTitle}</h1>
        <nav className="kind-switch" aria-label={t.form.kind}>
          <a href="/chest/new" aria-current={kind === "receipt" ? "page" : undefined}><Receipt />{t.form.kindReceipt}</a>
          <a href="/chest/new?trip=1" aria-current={kind === "trip" ? "page" : undefined}><Car />{t.form.kindTrip}</a>
          {data.allowances.length > 0 && <a href="/chest/new?allowance=1" aria-current={kind === "allowance" ? "page" : undefined}><Calendar />{t.form.kindAllowance}</a>}
        </nav>
      </div>
      {kind === "trip" && <TripForm data={data} initial={null} locale={locale} t={words} />}
      {kind === "allowance" && <AllowanceForm data={data} initial={null} locale={locale} t={words} />}
      {kind === "receipt" && <ExpenseForm data={data} initial={null} locale={locale} t={words} />}
    </main>
  );
}
