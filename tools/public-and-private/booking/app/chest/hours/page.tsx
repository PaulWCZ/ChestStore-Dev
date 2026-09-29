import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Fold } from "../../../components/fold.tsx";
import { Alert, Calendar, CalendarOff } from "../../../components/icons.tsx";
import * as b from "../../../lib/booking.ts";
import * as calendars from "../../../lib/calendars.ts";
import { db } from "../../../lib/db.ts";
import { myPage } from "../../../lib/my-page.ts";
import { firstUpper, intl, plural, relative } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { wall } from "../../../lib/zone.ts";
import { zoneGroups } from "../../../lib/zones.ts";
import { Exceptions } from "./exceptions.tsx";
import { OtherCalendars } from "./other-calendars.tsx";
import { WeekEditor } from "./week-editor.tsx";

// When the host may be booked: the week and their time zone first; their
// other calendars and the days that differ (days off, other hours) folded
// below, each saying what it holds. Times blocked by hand are on the
// agenda (tap a free stretch). Dates are written here, on the server.
export default async function HoursPage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <EmptyState headingLevel={1} title={t.bookings.cannotHostTitle} body={t.bookings.cannotHost} />;
  const sql = db();
  const now = Date.now();
  const today = wall(now, host.zone).date;
  const words = new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const exceptions = (await b.overridesOf(sql, v.member.id, today)).map(x => ({ ...x, label: firstUpper(words.format(new Date(x.day + "T12:00:00Z")), locale) }));
  const others = (await calendars.calendarsOf(sql, v.member.id, now)).map(c => ({ id: c.id, provider: c.provider, hint: c.hint, events: c.events, error: c.error, stale: c.stale, read: c.readAt ? relative(c.readAt, locale) : null, tried: c.triedAt ? relative(c.triedAt, locale) : null }));
  const catalogue = { hours: t.hours, days: t.days, errors: t.errors, date: t.date };
  const failing = others.some(c => c.error || c.stale);
  return (
    <>
      <PageHeader size="m" title={t.hours.title} intro={t.hours.intro} />
      {!host.ready && <p className="notice spaced" role="status"><Alert /><span>{t.hours.notPublic}</span></p>}
      <WeekEditor weekly={host.weekly} zone={host.zone} dailyMax={host.dailyMax} ready={host.ready} zones={zoneGroups(t.zones, now, [host.zone])} t={catalogue} />
      <Fold id="calendars" icon={<Calendar />} title={t.others.title} open={others.length === 0 || failing}
        status={others.length === 0 ? t.others.noneYet : failing ? t.others.someFailing : plural(t.others.connectedCount, others.length, locale)}>
        <OtherCalendars list={others} locale={locale} t={{ others: t.others, errors: t.errors }} />
      </Fold>
      <Fold id="exceptions" icon={<CalendarOff />} title={t.hours.exceptions}
        status={exceptions.length === 0 ? t.hours.none : plural(t.hours.planned, exceptions.length, locale)}>
        <Exceptions list={exceptions} today={today} locale={locale} t={catalogue} />
      </Fold>
    </>
  );
}
