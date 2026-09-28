import * as b from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { myPage } from "../../../lib/my-page.ts";
import { intl } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { wall } from "../../../lib/zone.ts";
import { Exceptions } from "./exceptions.tsx";
import { WeekEditor } from "./week-editor.tsx";

// When the host may be booked: the week, their time zone, and the days
// that differ (days off, other hours).
export default async function HoursPage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <div className="empty"><p>{t.bookings.cannotHost}</p></div>;
  const today = wall(Date.now(), host.zone).date;
  const words = new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const exceptions = (await b.overridesOf(db(), v.member.id, today)).map(x => ({ ...x, label: words.format(new Date(x.day + "T12:00:00Z")) }));
  const catalogue = { hours: t.hours, days: t.days, errors: t.errors };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.hours.title}</h1>
          <p className="muted">{t.hours.intro}</p>
        </div>
      </div>
      <WeekEditor weekly={host.weekly} zone={host.zone} t={catalogue} />
      <Exceptions list={exceptions} today={today} locale={locale} t={catalogue} />
    </>
  );
}
