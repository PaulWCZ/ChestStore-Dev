import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { addMonths } from "../../../../lib/calendar.ts";
import { formatDay } from "../../../../lib/i18n/index.ts";
import { today } from "../../../../lib/model.ts";
import { viewer } from "../../../../lib/session.ts";
import { OnDay } from "./on-day.tsx";

// Payroll's two files: the absences of a month (the pay slip's days off),
// and everyone's balances on a day (the pay slip's paid-leave box, and what
// is paid to those who leave). HR only.
export default async function PayrollPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "export")) notFound();
  const now = today();
  // The months payroll asks for: this one, the next, and two years back
  // (a select in the reader's language — not the browser's month field,
  // which writes the computer's format).
  const first = now.slice(0, 7) + "-01";
  const months = Array.from({ length: 27 }, (_, i) => addMonths(first, 1 - i).slice(0, 7)).map(m => ({ value: m, name: formatDay(m + "-01", locale, { month: "long", year: "numeric" }) }));
  return (
    <div className="page narrow">
      <Link className="back" href="/chest/people"><Back />{t.team.back}</Link>
      <h1>{t.payroll.title}</h1>
      <section className="panel">
        <h2>{t.payroll.absences}</h2>
        <p className="muted small">{t.payroll.absencesHint}</p>
        <form className="form-row" action="/chest/people/export" method="get">
          <div className="field-group">
            <label className="field-label" htmlFor="month">{t.team.exportMonth}</label>
            <select id="month" name="month" className="field compact month-select" defaultValue={now.slice(0, 7)} required>
              {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
            </select>
          </div>
          <button type="submit" className="button"><Download />{t.payroll.download}</button>
        </form>
      </section>
      <section className="panel">
        <h2>{t.payroll.balances}</h2>
        <p className="muted small">{t.payroll.balancesHint}</p>
        <form className="form-row" action="/chest/people/balances" method="get">
          <div className="field-group day-field">
            <OnDay today={now} label={t.payroll.on} labels={t.date} />
          </div>
          <button type="submit" className="button"><Download />{t.payroll.download}</button>
        </form>
      </section>
    </div>
  );
}
