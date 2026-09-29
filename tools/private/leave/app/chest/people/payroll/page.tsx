import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { today } from "../../../../lib/model.ts";
import { viewer } from "../../../../lib/session.ts";

// Payroll's two files: the absences of a month (the pay slip's days off),
// and everyone's balances on a day (the pay slip's paid-leave box, and what
// is paid to those who leave). HR only.
export default async function PayrollPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "export")) notFound();
  const now = today();
  return (
    <main className="page narrow">
      <Link className="back" href="/chest/people"><Back />{t.team.back}</Link>
      <h1>{t.payroll.title}</h1>
      <section className="panel">
        <h2>{t.payroll.absences}</h2>
        <p className="muted small">{t.payroll.absencesHint}</p>
        <form className="form-row" action="/chest/people/export" method="get">
          <div className="field-group">
            <label className="field-label" htmlFor="month">{t.team.exportMonth}</label>
            <input id="month" name="month" type="month" className="field compact" defaultValue={now.slice(0, 7)} required />
          </div>
          <button type="submit" className="button"><Download />{t.payroll.download}</button>
        </form>
      </section>
      <section className="panel">
        <h2>{t.payroll.balances}</h2>
        <p className="muted small">{t.payroll.balancesHint}</p>
        <form className="form-row" action="/chest/people/balances" method="get">
          <div className="field-group">
            <label className="field-label" htmlFor="on">{t.payroll.on}</label>
            <input id="on" name="on" type="date" className="field compact" defaultValue={now} max={now} required />
          </div>
          <button type="submit" className="button"><Download />{t.payroll.download}</button>
        </form>
      </section>
    </main>
  );
}
