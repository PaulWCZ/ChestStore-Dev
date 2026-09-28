import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Building } from "../../components/icons.tsx";
import { OfficePicker } from "../../components/office-picker.tsx";
import { can } from "../../lib/access.ts";
import { context } from "../../lib/context.ts";
import { deskBookingsOf, deskBookingsOn, usualDesk } from "../../lib/desk-bookings.ts";
import { formatDay, formatSpan } from "../../lib/i18n/index.ts";
import { addDays, mondayOf, overlaps, twoWeeks } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { atOffice, presenceOf } from "../../lib/presence.ts";
import { myRoomBookings } from "../../lib/room-bookings.ts";
import { purge } from "../../lib/settings.ts";
import { WeekView, type WeekDay } from "./week-view.tsx";

// Home, "My week": for each working day of this week and the next, where I
// am (one tap), who else is at the office, and what I booked. The one
// obvious action: say where you will be.
export default async function MyWeek({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c) return null;
  const { member, locale, t, sql, office } = c;
  if (!office) {
    return (
      <main className="narrow">
        <div className="empty">
          <Building />
          <h1>{t.week.noOffice.title}</h1>
          <p>{t.week.noOffice.body}</p>
          {can(member, "places.manage") ? <Link className="button" href="/chest/places">{t.week.noOffice.action}</Link> : <p className="muted">{t.week.noOffice.member}</p>}
        </div>
      </main>
    );
  }
  // What the rules no longer keep goes (nothing runs in the background).
  await purge(sql, c.zone);
  const days = twoWeeks(c.today, c.rules.weekdays);
  const from = mondayOf(c.today);
  const to = addDays(from, 13);
  const [said, present, myDesks, myRooms, usual] = await Promise.all([
    presenceOf(sql, [member.id], from, to),
    atOffice(sql, office.id, from, to),
    deskBookingsOf(sql, [member.id], from, to),
    myRoomBookings(sql, member, from, to, c.zone),
    usualDesk(sql, member, office.id),
  ]);
  const usualTaken = usual && !usual.assigned ? await deskBookingsOn(sql, usual.id, from, to) : [];
  const who = await people([...[...present.values()].flat(), ...myRooms.map(r => r.memberId)]);
  const mine = said.get(member.id);
  const rows: WeekDay[] = days.map(d => {
    const at = present.get(d) ?? [];
    return {
      day: d,
      week: d < addDays(from, 7) ? 0 : 1,
      label: formatDay(d, locale, { weekday: "long", day: "numeric", month: "long" }),
      short: formatDay(d, locale, { weekday: "short", day: "numeric", month: "short" }),
      isToday: d === c.today,
      past: d < c.today,
      me: mine?.get(d)?.status ?? null,
      others: at.filter(id => id !== member.id).map(id => ({ id, name: nameOf(who.get(id), locale), photo: who.get(id)?.photo ?? null })),
      desks: myDesks.filter(b => b.day === d).map(b => ({ id: b.id, name: b.deskName, area: b.areaName, part: b.part })),
      rooms: myRooms.filter(b => b.day === d).map(b => ({
        id: b.id,
        room: b.roomName,
        span: formatSpan(b.start, b.end, locale),
        title: b.title,
        by: b.memberId === member.id ? null : nameOf(who.get(b.memberId), locale),
      })),
      usualFree: usual !== null && !usual.assigned && !usualTaken.some(b => b.day === d && overlaps(b.part, "day")),
    };
  });
  const focus = typeof params["day"] === "string" && days.includes(params["day"]) ? params["day"] : null;
  return (
    <main className="narrow">
      <AutoRefresh seconds={30} />
      <div className="page-head">
        <div>
          <h1>{t.week.title}</h1>
          <p className="muted place-line">{office.name}{office.address ? " · " + office.address : ""}</p>
        </div>
        <OfficePicker offices={c.offices.map(o => ({ id: o.id, name: o.name }))} current={office.id} label={t.shell.office} path="/chest" />
      </div>
      <WeekView
        days={rows}
        officeId={office.id}
        focus={focus}
        usual={usual}
        self={{ name: member.name, photo: member.photo }}
        locale={locale}
        t={{ week: t.week, status: t.status, parts: t.parts, days: t.days, errors: t.errors, undo: t.booking.undo, you: t.people.you }}
      />
    </main>
  );
}
