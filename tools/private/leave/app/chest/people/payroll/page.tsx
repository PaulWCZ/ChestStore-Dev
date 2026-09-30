import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { addMonths } from "../../../../lib/calendar.ts";
import { lastPayrollDay } from "../../../../lib/model.ts";
import { today } from "../../../../lib/today.ts";
import { viewer } from "../../../../lib/session.ts";
import { OnDay, OnMonth } from "./on-day.tsx";

// Payroll's two files: the absences of a month (the pay slip's days off),
// and everyone's balances on a day (the pay slip's paid-leave box, and what
// is paid to those who leave). HR only.
export default async function PayrollPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "export")) notFound();
  const now = today();
  // The months payroll asks for: this one, the next, and two years back.
  const first = now.slice(0, 7) + "-01";
  return (
    <div className="page narrow">
      <Link className="back" href="/chest/people"><Back />{t.team.back}</Link>
      <h1>{t.payroll.title}</h1>
      <section className="panel">
        <h2>{t.payroll.absences}</h2>
        <p className="muted small">{t.payroll.absencesHint}</p>
        <form className="form-row" action="/chest/people/export" method="get">
          <div className="field-group">
            <OnMonth today={now} min={addMonths(first, -25).slice(0, 7)} max={addMonths(first, 1).slice(0, 7)} label={t.team.exportMonth} labels={t.date} />
          </div>
          <button type="submit" className="button"><Download />{t.payroll.download}</button>
        </form>
      </section>
      <section className="panel">
        <h2>{t.payroll.balances}</h2>
        <p className="muted small">{t.payroll.balancesHint}</p>
        <form className="form-row" action="/chest/people/balances" method="get">
          <div className="field-group day-field">
            <OnDay today={now} max={lastPayrollDay(now)} label={t.payroll.on} hint={t.payroll.onHint} labels={t.date} />
          </div>
          <button type="submit" className="button"><Download />{t.payroll.download}</button>
        </form>
      </section>
    </div>
  );
}
