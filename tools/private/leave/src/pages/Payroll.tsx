import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Back, Download } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { addMonths } from "../shared/calendar.ts";
import { lastPayrollDay } from "../shared/model.ts";
import { today } from "../lib/today.ts";

// Payroll's two files: the absences of a month (the pay slip's days off),
// and everyone's balances on a day (the pay slip's paid-leave box, and what
// is paid to those who leave). HR only.
export async function payrollPage({ member, t }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "export")) return notFound();
  const now = today();
  // The months payroll asks for: this one, the next, and two years back.
  const first = now.slice(0, 7) + "-01";
  return {
    title: t.payroll.title,
    body: (
      <div className="page narrow">
        <a className="back" href="/chest/people"><Back />{t.team.back}</a>
        <h1>{t.payroll.title}</h1>
        <section className="panel">
          <h2>{t.payroll.absences}</h2>
          <p className="muted small">{t.payroll.absencesHint}</p>
          <form className="form-row" action="/chest/people/export" method="get">
            <div className="field-group">
              <Island name="OnMonth" props={{ today: now, min: addMonths(first, -25).slice(0, 7), max: addMonths(first, 1).slice(0, 7), label: t.team.exportMonth, labels: t.kit.date }} />
            </div>
            <button type="submit" className="button"><Download />{t.payroll.download}</button>
          </form>
        </section>
        <section className="panel">
          <h2>{t.payroll.balances}</h2>
          <p className="muted small">{t.payroll.balancesHint}</p>
          <form className="form-row" action="/chest/people/balances" method="get">
            <div className="field-group day-field">
              <Island name="OnDay" props={{ today: now, max: lastPayrollDay(now), label: t.payroll.on, hint: t.payroll.onHint, labels: t.kit.date }} />
            </div>
            <button type="submit" className="button"><Download />{t.payroll.download}</button>
          </form>
        </section>
      </div>
    ),
  };
}
