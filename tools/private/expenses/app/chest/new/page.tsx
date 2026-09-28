import { Car, Receipt } from "../../../components/icons.tsx";
import { composeData } from "../../../lib/compose.ts";
import { composeWords } from "../../../lib/compose-words.ts";
import { db } from "../../../lib/db.ts";
import { viewer } from "../../../lib/session.ts";
import { ExpenseForm, TripForm } from "../compose.tsx";

// Add an expense: a receipt (the photo first, then the amount), or a trip
// with one's own vehicle (?trip=1).
export default async function NewExpense({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const trip = (await searchParams).trip === "1";
  const data = await composeData(db(), member, t);
  return (
    <main className="page">
      <div className="compose-top page-head">
        <h1>{trip ? t.form.newTrip : t.form.newTitle}</h1>
        <nav className="kind-switch" aria-label={t.form.kind}>
          <a href="/chest/new" aria-current={trip ? undefined : "page"}><Receipt />{t.form.kindReceipt}</a>
          <a href="/chest/new?trip=1" aria-current={trip ? "page" : undefined}><Car />{t.form.kindTrip}</a>
        </nav>
      </div>
      {trip
        ? <TripForm data={data} initial={null} locale={locale} t={composeWords(t)} />
        : <ExpenseForm data={data} initial={null} locale={locale} t={composeWords(t)} />}
    </main>
  );
}
