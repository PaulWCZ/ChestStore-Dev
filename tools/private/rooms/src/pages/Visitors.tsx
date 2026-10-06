import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Badge } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { bookableDays, context, shownDay } from "../lib/context.ts";
import { directory } from "../lib/directory.ts";
import { minutesNow, step } from "../shared/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { reach } from "../lib/invitations.ts";
import { visitsOn } from "../lib/visits.ts";
import { formatDay, formatTime } from "../i18n/index.ts";

// Visitors: who is expected at the office on a day. A member announces
// their own visitors and sees them; the reception (office managers,
// admins) sees every visitor of the day, announces them for anyone and
// marks each arrival — the host hears it in the bell.
export async function visitorsPage(p: PageContext): Promise<View> {
  const c = await context(p, p.query("office"));
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { member, locale, t, sql, office } = c;
  const reception = can(member, "visitors.all");
  // Today first, whatever the working days: visitors come when they come.
  const day = shownDay(p.query("day"), { today: c.today, rules: { ...c.rules, weekdays: [1, 2, 3, 4, 5, 6, 7] } });
  const long = { weekday: "long", day: "numeric", month: "long" } as const;
  if (!office) {
    return {
      title: t.visitors.title,
      body: (
        <div className="narrow">
          <PageHeader title={t.visitors.title} />
          <EmptyState icon={<Badge />} title={t.visitors.empty.title} body={t.visitors.noOffice}
            {...(can(member, "places.manage") ? { action: <a className="button" href="/chest/places">{t.week.noOffice.action}</a> } : {})} />
        </div>
      ),
    };
  }
  const [list, everyone, mail] = await Promise.all([visitsOn(sql, member, office.id, day), reception ? directory() : Promise.resolve([]), reach()]);
  const who = await people(list.map(v => v.host));
  const days = [...new Set([c.today, ...bookableDays(c)])].sort();
  const now = minutesNow(c.zone);
  const soonest = Math.min(1440 - step, Math.ceil(now / 60) * 60);
  return {
    title: t.visitors.title,
    body: (
      <div className="narrow">
        <Island name="AutoRefresh" props={{ seconds: 20 }} />
        <Island name="VisitorsView" id={`visitors-${office.id}-${day}`} props={{
          head: {
            title: t.visitors.title,
            intro: formatDay(day, locale, long) + " · " + office.name,
            offices: c.offices.length > 1 ? { offices: c.offices.map(o => ({ id: o.id, name: o.name })), current: office.id, label: t.shell.office, path: `/chest/visitors?day=${day}` } : null,
          },
          strip: { days, current: day, today: c.today, path: "/chest/visitors", keep: { office: office.id }, label: t.days.date, labels: t.kit.date },
          officeId: office.id,
          day,
          dayLabel: formatDay(day, locale, long),
          isToday: day === c.today,
          past: day < c.today,
          // When a visitor is expected by default: the next round hour
          // today, 10:00 on another day.
          defaultAt: day === c.today ? soonest : 10 * 60,
          reception,
          // Whether an invitation can go by email now, and where replies land.
          mail,
          me: { id: member.id, name: member.name, photo: member.photo },
          visits: list.map(v => ({
            id: v.id,
            at: v.at,
            time: formatTime(v.at, locale),
            name: v.name,
            company: v.company,
            host: v.host === member.id ? t.people.you : nameOf(who.get(v.host), locale),
            hostId: v.host,
            arrivedAt: v.arrivedAt ? formatTime(minutesNow(c.zone, new Date(v.arrivedAt)), locale) : null,
            mayArrive: reception || v.host === member.id,
            invitation: v.invitation,
          })),
          people: everyone.map(x => ({ id: x.id, name: x.name, photo: x.photo })),
          locale,
          t: { visitors: t.visitors, dialog: t.kit.dialog, peoplePicker: t.kit.peoplePicker },
        }} />
      </div>
    ),
  };
}
