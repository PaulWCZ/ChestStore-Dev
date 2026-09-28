import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { DayStrip } from "../../../components/day-strip.tsx";
import { Door } from "../../../components/icons.tsx";
import { OfficePicker } from "../../../components/office-picker.tsx";
import { can, mayChange } from "../../../lib/access.ts";
import { bookableDays, context, shownDay } from "../../../lib/context.ts";
import { directory } from "../../../lib/directory.ts";
import { formatDay } from "../../../lib/i18n/index.ts";
import { addDays, minutesNow, weekday } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { roomDay } from "../../../lib/room-bookings.ts";
import { RoomsView, type GridBooking, type GridRoom } from "./rooms-view.tsx";

// Book a room: the day's grid of rooms and hours (on a phone, each room
// with its free slots). Click or drag an empty stretch, or press "Book a
// room"; tap a booking to see it, change it or cancel it.
export default async function Rooms({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c) return null;
  const { member, locale, t, sql, office } = c;
  // Once today's hours are over, the next working day opens by default.
  const over = minutesNow(c.zone) >= c.rules.dayEnd - 15;
  const day = shownDay(params["day"], over ? { ...c, today: addDays(c.today, 1) } : c);
  const href = (d: string) => `/chest/rooms?day=${d}${office ? "&office=" + office.id : ""}`;
  const rooms: GridRoom[] = (office?.floors ?? []).flatMap(f => f.rooms.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, equipment: r.equipment, note: r.note, photo: r.photo, floor: f.name })));
  const [bookings, everyone] = office ? await Promise.all([roomDay(sql, member, office.id, day, c.zone), directory()]) : [[], []];
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
  }));
  const open = typeof params["booking"] === "string" && shown.some(b => b.id === params["booking"]) ? params["booking"] : null;
  const closed = !c.rules.weekdays.includes(weekday(day));
  return (
    <main className="wide">
      <AutoRefresh seconds={20} />
      <div className="page-head">
        <div>
          <h1>{t.rooms.title}</h1>
          <p className="muted place-line">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}{office ? " · " + office.name : ""}</p>
        </div>
        {office && <OfficePicker offices={c.offices.map(o => ({ id: o.id, name: o.name }))} current={office.id} label={t.shell.office} path={href(day)} />}
      </div>
      <DayStrip days={bookableDays(c)} current={day} today={c.today} locale={locale} t={t.days} href={href} hidden={office ? { office: office.id } : {}} />
      {rooms.length === 0 ? (
        <div className="empty">
          <Door />
          <h2>{t.rooms.none.title}</h2>
          <p>{t.rooms.none.body}</p>
        </div>
      ) : (
        <RoomsView
          key={day}
          day={day}
          today={c.today}
          now={day === c.today ? minutesNow(c.zone) : null}
          past={day < c.today}
          closed={closed}
          open={c.rules.dayStart}
          close={c.rules.dayEnd}
          maxWeeks={can(member, "bookings.any") ? 52 : c.rules.repeatWeeks}
          rooms={rooms}
          bookings={shown}
          people={everyone.filter(p => p.id !== member.id).map(p => ({ id: p.id, name: p.name, photo: p.photo }))}
          initial={open}
          locale={locale}
          t={{ rooms: t.rooms, booking: t.booking, equipment: t.equipment, errors: t.errors }}
        />
      )}
    </main>
  );
}
