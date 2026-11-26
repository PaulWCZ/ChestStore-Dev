import { PageHeader } from "@argentic/chest-ui/components";
import { Fold } from "../components/fold.tsx";
import { Alert, Calendar, CalendarOff } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import type { MemberContext } from "@argentic/chest-app";
import { dayWords, firstUpper, plural, relative } from "../i18n/index.ts";
import * as b from "../lib/booking.ts";
import * as calendars from "../lib/calendars.ts";
import { db } from "../lib/db.ts";
import { myPage } from "../lib/my-page.ts";
import { wall } from "../lib/zone.ts";
import { zoneGroups } from "../lib/zones.ts";
import { cannotHost } from "./bits.tsx";

// When the host may be booked (/chest/hours): the week and their time zone
// first; their other calendars and the days that differ (days off, other
// hours) folded below, each saying what it holds. Times blocked by hand
// are on the agenda (tap a free stretch). Dates are written here, on the
// server.
export async function hoursPage(v: PageContext<MemberContext>): Promise<View> {
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return cannotHost(t);
  const sql = db();
  const now = Date.now();
  const today = wall(now, host.zone).date;
  const exceptions = (await b.overridesOf(sql, v.member.id, today)).map(x => ({ ...x, label: firstUpper(dayWords(x.day, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), locale) }));
  const others = (await calendars.calendarsOf(sql, v.member.id, now)).map(c => ({ id: c.id, provider: c.provider, hint: c.hint, events: c.events, error: c.error, stale: c.stale, read: c.readAt ? relative(c.readAt, locale) : null, tried: c.triedAt ? relative(c.triedAt, locale) : null }));
  const failing = others.some(c => c.error || c.stale);
  return {
    title: t.hours.title,
    body: (
      <>
        <PageHeader size="m" title={t.hours.title} intro={t.hours.intro} />
        {!host.ready && <p className="notice spaced" role="status"><Alert /><span>{t.hours.notPublic}</span></p>}
        <Island name="WeekEditor" props={{ weekly: host.weekly, zone: host.zone, dailyMax: host.dailyMax, ready: host.ready, zones: zoneGroups(t.zones, now, [host.zone]), t: { hours: t.hours, days: t.days, invalid: t.errors.invalid } }} />
        <Fold id="calendars" icon={<Calendar />} title={t.others.title} open={others.length === 0 || failing}
          status={others.length === 0 ? t.others.noneYet : failing ? t.others.someFailing : plural(t.others.connectedCount, others.length, locale)}>
          <Island name="OtherCalendars" props={{ list: others, locale, t: { others: t.others } }} />
        </Fold>
        <Fold id="exceptions" icon={<CalendarOff />} title={t.hours.exceptions}
          status={exceptions.length === 0 ? t.hours.none : plural(t.hours.planned, exceptions.length, locale)}>
          <Island name="Exceptions" props={{ list: exceptions, today, locale, t: { hours: t.hours, date: t.kit.date, invalid: t.errors.invalid } }} />
        </Fold>
      </>
    ),
  };
}
