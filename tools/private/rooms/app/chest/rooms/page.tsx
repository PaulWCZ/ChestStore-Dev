import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { DayPicker } from "../../../components/day-picker.tsx";
import { Door } from "../../../components/icons.tsx";
import { OfficePicker } from "../../../components/office-picker.tsx";
import { can, mayChange } from "../../../lib/access.ts";
import { feedPage } from "../../../lib/calendar.ts";
import { bookableDays, context, formDays, lockOf, shownDay } from "../../../lib/context.ts";
import { told } from "../../../lib/mail.ts";
import { directory } from "../../../lib/directory.ts";
import { chestGroups } from "../../../lib/groups.ts";
import { format, formatDay, formatTime } from "../../../lib/i18n/index.ts";
import { addDays, minutesNow } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { roomDay } from "../../../lib/room-bookings.ts";
import { checkInOpens } from "../../../lib/check-in.ts";
import { RoomsView, type GridBooking, type GridRoom } from "./rooms-view.tsx";

// Book a room: find a free one by size, time and equipment, or use the
// day's grid of rooms and hours (on a phone, each room with its free
// slots). Click or drag an empty stretch, or press "Book a room"; tap a
// booking to see it, add it to a calendar, change it or cancel it.
export default async function Rooms({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c) return null;
  const { member, locale, t, sql, office } = c;
  const exempt = can(member, "bookings.any");
  // Once today's hours are over, the next working day opens by default.
  const over = minutesNow(c.zone) >= c.rules.dayEnd - 15;
  const day = shownDay(params["day"], over ? { ...c, today: addDays(c.today, 1) } : c);
  const groups = new Map((await chestGroups()).map(g => [g.id, g.name]));
  const rooms: GridRoom[] = (office?.floors ?? []).flatMap(f => f.rooms.map(r => ({
    id: r.id, name: r.name, capacity: r.capacity, equipment: r.equipment, note: r.note, photo: r.photo, floor: f.name,
    group: r.groupId ? { name: groups.get(r.groupId) ?? t.rooms.aGroup, mine: exempt || member.groups.includes(r.groupId) } : null,
  })));
  const [bookings, everyone, how] = office ? await Promise.all([roomDay(sql, member, office.id, day, c.zone), directory(), told(sql)]) : [[], [], await told(sql)];
  const who = await people(bookings.flatMap(b => [b.memberId, ...b.attendees]));
  const nowMinutes = minutesNow(c.zone);
  const shown: GridBooking[] = bookings.map(b => ({
    id: b.id,
    roomId: b.roomId,
    start: b.start,
    end: b.end,
    title: b.title,
    series: b.series,
    organiser: { id: b.memberId, name: b.memberId === member.id ? t.people.you : nameOf(who.get(b.memberId), locale), photo: who.get(b.memberId)?.photo ?? null },
    attendees: b.attendees.map(a => ({ id: a, name: nameOf(who.get(a), locale), photo: who.get(a)?.photo ?? null })),
    mine: b.memberId === member.id || b.attendees.includes(member.id),
    canChange: mayChange(member, b.memberId),
    checkedIn: b.checkedIn,
    checkable: c.rules.checkIn && !b.checkedIn && (b.memberId === member.id || b.attendees.includes(member.id)) && day === c.today && nowMinutes >= b.start - checkInOpens && nowMinutes < b.end,
  }));
  const open = typeof params["booking"] === "string" && shown.some(b => b.id === params["booking"]) ? params["booking"] : null;
  const lock = lockOf(c, day, exempt);
  const keep: Record<string, string> = office ? { office: office.id } : {};
  const intro = <span className="place-line">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}{office ? " · " + office.name : ""}</span>;
  const picker = office && c.offices.length > 1 ? <OfficePicker offices={c.offices.map(o => ({ id: o.id, name: o.name }))} current={office.id} label={t.shell.office} path={`/chest/rooms?day=${day}`} /> : undefined;
  const header = <PageHeader title={t.rooms.title} intro={intro} secondary={picker} />;
  const strip = <DayPicker days={bookableDays(c)} current={day} today={c.today} path="/chest/rooms" keep={keep} label={t.days.date} labels={t.date} />;
  const days = formDays(c, exempt).map(d => ({ value: d, label: formatDay(d, locale, { weekday: "long", day: "numeric", month: "long" }) }));
  return (
    <div className="wide">
      <AutoRefresh seconds={20} />
      {rooms.length === 0 ? (
        <>
          {header}
          {strip}
          <EmptyState icon={<Door />} title={t.rooms.none.title} body={t.rooms.none.body}
            {...(can(member, "places.manage") ? { action: <Link className="button" href="/chest/places">{t.week.noOffice.action}</Link> } : {})} />
        </>
      ) : (
        <RoomsView
          head={{ title: t.rooms.title, intro, secondary: picker }}
          notice={over && params["day"] === undefined ? format(t.rooms.afterHours, { time: formatTime(c.rules.dayEnd, locale), day: formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" }) }) : null}
          strip={strip}
          key={day}
          day={day}
          days={days}
          today={c.today}
          now={day === c.today ? minutesNow(c.zone) : null}
          locked={lock ? { why: lock.why, ...(lock.opens ? { opensOn: formatDay(lock.opens, locale, { weekday: "long", day: "numeric", month: "long" }) } : {}) } : null}
          open={c.rules.dayStart}
          close={c.rules.dayEnd}
          maxWeeks={exempt ? 52 : c.rules.repeatWeeks}
          rooms={rooms}
          bookings={shown}
          people={everyone.filter(p => p.id !== member.id).map(p => ({ id: p.id, name: p.name, photo: p.photo }))}
          bookFor={exempt}
          initial={open}
          told={how.told}
          calendarPage={how.calendarOn ? feedPage : null}
          locale={locale}
          t={{ rooms: t.rooms, booking: t.booking, equipment: t.equipment, errors: t.errors, dialog: t.dialog, peoplePicker: t.peoplePicker, date: t.date }}
        />
      )}
    </div>
  );
}
