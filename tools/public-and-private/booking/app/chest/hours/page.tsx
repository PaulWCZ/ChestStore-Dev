import * as b from "../../../lib/booking.ts";
import * as calendars from "../../../lib/calendars.ts";
import { db } from "../../../lib/db.ts";
import { myPage } from "../../../lib/my-page.ts";
import { clock, endClock, firstUpper, intl, relative } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { wall } from "../../../lib/zone.ts";
import { zoneGroups } from "../../../lib/zones.ts";
import { Blocks } from "./blocks.tsx";
import { Exceptions } from "./exceptions.tsx";
import { OtherCalendars } from "./other-calendars.tsx";
import { WeekEditor } from "./week-editor.tsx";

// When the host may be booked: the week, their time zone, the times their
// other calendars keep busy, the times they block, and the days that
// differ (days off, other hours). Dates are written here, on the server.
export default async function HoursPage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <div className="empty"><p>{t.bookings.cannotHost}</p></div>;
  const sql = db();
  const now = Date.now();
  const today = wall(now, host.zone).date;
  const words = new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const exceptions = (await b.overridesOf(sql, v.member.id, today)).map(x => ({ ...x, label: firstUpper(words.format(new Date(x.day + "T12:00:00Z")), locale) }));
  const dayOf = new Intl.DateTimeFormat(intl(locale), { timeZone: host.zone, weekday: "long", day: "numeric", month: "long" });
  const blocks = (await b.blocksOf(sql, v.member.id, new Date(now))).map(x => ({ id: x.id, note: x.note, label: `${firstUpper(dayOf.format(x.start), locale)}, ${clock(x.start, host.zone, locale)}–${endClock(x.start, x.end, host.zone, locale)}` }));
  const others = (await calendars.calendarsOf(sql, v.member.id, now)).map(c => ({ id: c.id, provider: c.provider, hint: c.hint, events: c.events, error: c.error, stale: c.stale, read: c.readAt ? relative(c.readAt, locale) : null, tried: c.triedAt ? relative(c.triedAt, locale) : null }));
  const catalogue = { hours: t.hours, days: t.days, errors: t.errors };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.hours.title}</h1>
          <p className="muted">{t.hours.intro}</p>
        </div>
      </div>
      <WeekEditor weekly={host.weekly} zone={host.zone} dailyMax={host.dailyMax} zones={zoneGroups(t.zones, now, [host.zone])} t={catalogue} />
      <OtherCalendars list={others} locale={locale} t={{ others: t.others, errors: t.errors }} />
      <Blocks list={blocks} today={today} t={catalogue} />
      <Exceptions list={exceptions} today={today} locale={locale} t={catalogue} />
    </>
  );
}
