import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Door } from "../components/icons.tsx";
import { can, mayChange } from "../lib/access.ts";
import { feedPage } from "../lib/calendar.ts";
import { checkInOpens } from "../lib/check-in.ts";
import { bookableDays, context, formDays, lockOf, shownDay } from "../lib/context.ts";
import { directory } from "../lib/directory.ts";
import { chestGroups, groupsOf } from "../lib/groups.ts";
import { told } from "../lib/mail.ts";
import { addDays, minutesNow } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { roomDay } from "../lib/room-bookings.ts";
import { format, formatDay, formatTime } from "../i18n/index.ts";
import type { GridBooking, GridRoom } from "../islands/RoomsView.tsx";

// Book a room: find a free one by size, time and equipment, or use the
// day's grid of rooms and hours (on a phone, each room with its free
// slots). Click or drag an empty stretch, or press "Book a room"; tap a
// booking to see it, add it to a calendar, change it or cancel it.
export async function roomsPage(p: PageContext): Promise<View> {
  const c = await context(p, p.query("office"));
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { member, locale, t, sql, office } = c;
  const exempt = can(member, "bookings.any");
  // Once today's hours are over, the next working day opens by default.
  const nowMinutes = minutesNow(c.zone);
  const over = nowMinutes >= c.rules.dayEnd - 15;
  const asked = p.query("day");
  const day = shownDay(asked, over ? { ...c, today: addDays(c.today, 1) } : c);
  const [groupList, mine] = await Promise.all([chestGroups(), groupsOf(member)]);
  const groups = new Map(groupList.map(g => [g.id, g.name]));
  const rooms: GridRoom[] = (office?.floors ?? []).flatMap(f => f.rooms.map(r => ({
    id: r.id, name: r.name, capacity: r.capacity, equipment: r.equipment, note: r.note, photo: r.photo, floor: f.name,
    group: r.groupId ? { name: groups.get(r.groupId) ?? t.rooms.aGroup, mine: exempt || mine.includes(r.groupId) } : null,
  })));
  const [bookings, everyone, how] = office ? await Promise.all([roomDay(sql, member, office.id, day, c.zone), directory(), told(sql)]) : [[], [], await told(sql)];
  const who = await people(bookings.flatMap(b => [b.memberId, ...b.attendees]));
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
  const open = p.query("booking");
  const initial = open !== undefined && shown.some(b => b.id === open) ? open : null;
  const lock = lockOf(c, day, exempt);
  const long = { weekday: "long", day: "numeric", month: "long" } as const;
  const intro = formatDay(day, locale, long) + (office ? " · " + office.name : "") + zoneNote(c.zone, member.timeZone, t.rooms.officeTime);
  const offices = office && c.offices.length > 1 ? { offices: c.offices.map(o => ({ id: o.id, name: o.name })), current: office.id, label: t.shell.office, path: `/chest/rooms?day=${day}` } : null;
  const strip = { days: bookableDays(c), current: day, today: c.today, path: "/chest/rooms", keep: office ? { office: office.id } : {}, label: t.days.date, labels: t.kit.date };
  const lockedHint = lock?.why === "closed" ? t.rooms.closedDay
    : lock?.why === "past" ? t.errors.past
    : lock?.why === "notYet" ? format(t.rooms.opensOn, { date: formatDay(lock.opens!, locale, long) })
    : null;
  return {
    title: t.rooms.title,
    body: (
      <div className="wide">
        <Island name="AutoRefresh" props={{ seconds: 20 }} />
        {rooms.length === 0 ? (
          <>
            <PageHeader title={t.rooms.title} intro={<span className="place-line">{intro}</span>} secondary={offices ? <Island name="OfficePicker" props={offices} /> : undefined} />
            <Island name="DayPicker" props={strip} />
            <EmptyState icon={<Door />} title={t.rooms.none.title} body={t.rooms.none.body}
              {...(can(member, "places.manage") ? { action: <a className="button" href="/chest/places">{t.week.noOffice.action}</a> } : {})} />
          </>
        ) : (
          <Island name="RoomsView" id={`rooms-${office?.id}-${day}`} props={{
            head: { title: t.rooms.title, intro, offices },
            notice: over && asked === undefined ? format(t.rooms.afterHours, { time: formatTime(c.rules.dayEnd, locale), day: formatDay(day, locale, long) }) : null,
            lockedHint,
            strip,
            day,
            days: formDays(c, exempt).map(d => ({ value: d, label: formatDay(d, locale, long) })),
            today: c.today,
            now: day === c.today ? nowMinutes : null,
            locked: lock ? { why: lock.why, ...(lock.opens ? { opensOn: formatDay(lock.opens, locale, long) } : {}) } : null,
            open: c.rules.dayStart,
            close: c.rules.dayEnd,
            maxWeeks: exempt ? 52 : c.rules.repeatWeeks,
            rooms,
            bookings: shown,
            people: everyone.filter(x => x.id !== member.id).map(x => ({ id: x.id, name: x.name, photo: x.photo })),
            bookFor: exempt,
            initial,
            told: how.told,
            calendarPage: how.calendarOn ? feedPage : null,
            locale,
            t: { rooms: t.rooms, booking: t.booking, equipment: t.equipment, closedDay: t.errors.closed_day, dialog: t.kit.dialog, peoplePicker: t.kit.peoplePicker, date: t.kit.date },
          }} />
        )}
      </div>
    ),
  };
}

// The rooms' hours are the office's (the Chest's time zone): a reader
// whose own zone is another one reads which, after the day.
function zoneNote(office: string, reader: string | null | undefined, words: string): string {
  return reader && reader !== office ? " · " + format(words, { zone: (office.split("/").at(-1) ?? office).replaceAll("_", " ") }) : "";
}
