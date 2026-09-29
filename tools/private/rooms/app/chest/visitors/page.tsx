import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { DayPicker } from "../../../components/day-picker.tsx";
import { Badge } from "../../../components/icons.tsx";
import { OfficePicker } from "../../../components/office-picker.tsx";
import { can } from "../../../lib/access.ts";
import { bookableDays, context, shownDay } from "../../../lib/context.ts";
import { directory } from "../../../lib/directory.ts";
import { formatDay, formatTime } from "../../../lib/i18n/index.ts";
import { minutesNow, step } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { visitsOn } from "../../../lib/visits.ts";
import { VisitorsView } from "./visitors-view.tsx";

// Visitors: who is expected at the office on a day. A member announces
// their own visitors and sees them; the reception (office managers,
// admins) sees every visitor of the day, announces them for anyone and
// marks each arrival — the host hears it in the bell.
export default async function Visitors({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c) return null;
  const { member, locale, t, sql, office } = c;
  const reception = can(member, "visitors.all");
  // Today first, whatever the working days: visitors come when they come.
  const day = shownDay(params["day"], { today: c.today, rules: { ...c.rules, weekdays: [1, 2, 3, 4, 5, 6, 7] } });
  const intro = <span className="place-line">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}{office ? " · " + office.name : ""}</span>;
  if (!office) {
    return (
      <div className="narrow">
        <PageHeader title={t.visitors.title} />
        <EmptyState icon={<Badge />} title={t.visitors.empty.title} body={t.visitors.noOffice}
          {...(can(member, "places.manage") ? { action: <Link className="button" href="/chest/places">{t.week.noOffice.action}</Link> } : {})} />
      </div>
    );
  }
  const [list, everyone] = await Promise.all([visitsOn(sql, member, office.id, day), reception ? directory() : Promise.resolve([])]);
  const who = await people(list.map(v => v.host));
  const days = [...new Set([c.today, ...bookableDays(c)])].sort();
  const now = minutesNow(c.zone);
  const soonest = Math.min(1440 - step, Math.ceil(now / 60) * 60);
  return (
    <div className="narrow">
      <AutoRefresh seconds={20} />
      <VisitorsView
        head={{
          title: t.visitors.title,
          intro,
          secondary: c.offices.length > 1 ? <OfficePicker offices={c.offices.map(o => ({ id: o.id, name: o.name }))} current={office.id} label={t.shell.office} path={`/chest/visitors?day=${day}`} /> : undefined,
        }}
        strip={<DayPicker days={days} current={day} today={c.today} path="/chest/visitors" keep={{ office: office.id }} label={t.days.date} labels={t.date} />}
        key={day + office.id}
        officeId={office.id}
        day={day}
        dayLabel={formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}
        isToday={day === c.today}
        past={day < c.today}
        // When a visitor is expected by default: the next round hour today,
        // 10:00 on another day.
        defaultAt={day === c.today ? soonest : 10 * 60}
        reception={reception}
        me={{ id: member.id, name: member.name, photo: member.photo }}
        visits={list.map(v => ({
          id: v.id,
          at: v.at,
          time: formatTime(v.at, locale),
          name: v.name,
          company: v.company,
          host: v.host === member.id ? t.people.you : nameOf(who.get(v.host), locale),
          hostId: v.host,
          arrivedAt: v.arrivedAt ? formatTime(minutesNow(c.zone, new Date(v.arrivedAt)), locale) : null,
          mayArrive: reception || v.host === member.id,
        }))}
        people={everyone.map(p => ({ id: p.id, name: p.name, photo: p.photo }))}
        locale={locale}
        t={{ visitors: t.visitors, errors: t.errors, dialog: t.dialog, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
