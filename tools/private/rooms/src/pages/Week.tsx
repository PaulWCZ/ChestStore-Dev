import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Building } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { feedPage } from "../lib/calendar.ts";
import { checkInOpens } from "../lib/check-in.ts";
import { context } from "../lib/context.ts";
import { deskBookingsOf, deskBookingsOn, usualDesk } from "../lib/desk-bookings.ts";
import { groupsOf } from "../lib/groups.ts";
import { told } from "../lib/mail.ts";
import { addDays, minutesNow, mondayOf, overlaps, placeName, twoWeeks } from "../shared/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { atOffice, presenceOf } from "../lib/presence.ts";
import { myRoomBookings } from "../lib/room-bookings.ts";
import { purge } from "../lib/settings.ts";
import { usualWeek } from "../lib/usual.ts";
import { myVisitors } from "../lib/visits.ts";
import { formatDay, formatSpan, formatTime } from "../i18n/index.ts";
import type { WeekDay } from "../islands/WeekView.tsx";

// Home, "My week": for each working day of this week and the next, where I
// am (one tap), who else is at the office — my teams first —, and what I
// booked. The one obvious action: say where you will be. "My usual week"
// says it once for every week.
export async function weekPage(p: PageContext): Promise<View> {
  const c = await context(p, p.query("office"));
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { member, locale, t, sql, office } = c;
  // What the rules no longer keep goes (nothing runs in the background).
  await purge(sql, c.zone);
  const days = twoWeeks(c.today, c.rules.weekdays);
  const from = mondayOf(c.today);
  const to = addDays(from, 13);
  const [said, present, myDesks, myRooms, usual, pattern, how, visitors, myGroups] = await Promise.all([
    presenceOf(sql, [member.id], from, to),
    atOffice(sql, office?.id ?? null, from, to),
    deskBookingsOf(sql, [member.id], from, to),
    myRoomBookings(sql, member, from, to, c.zone),
    office ? usualDesk(sql, member, office.id) : null,
    usualWeek(sql, member),
    told(sql),
    myVisitors(sql, member, from, to),
    groupsOf(member),
  ]);
  const onUsual = usual ? await deskBookingsOn(sql, usual.id, from, to) : [];
  // My own desk, lent to someone on a day I am away.
  const lentTo = usual?.assigned ? onUsual.filter(b => b.memberId !== member.id) : [];
  const who = await people([...[...present.values()].flat(), ...myRooms.map(r => r.memberId), ...lentTo.map(b => b.memberId)]);
  // My teams first: those who share a group with me, then everyone else.
  const shared = (id: string) => (who.get(id)?.groups ?? []).some(g => myGroups.includes(g));
  const mine = said.get(member.id);
  const now = minutesNow(c.zone);
  const long = { weekday: "long", day: "numeric", month: "long" } as const;
  const rows: WeekDay[] = days.map(d => {
    const at = present.get(d) ?? [];
    const lent = lentTo.find(b => b.day === d);
    const rooms = myRooms.filter(b => b.day === d);
    return {
      day: d,
      week: d < addDays(from, 7) ? 0 : 1,
      label: formatDay(d, locale, long),
      short: formatDay(d, locale, { weekday: "short", day: "numeric", month: "short" }),
      isToday: d === c.today,
      past: d < c.today,
      me: mine?.get(d)?.status ?? null,
      others: at.filter(id => id !== member.id)
        .sort((a, b) => Number(shared(b)) - Number(shared(a)))
        .map(id => ({ id, name: nameOf(who.get(id), locale), photo: who.get(id)?.photo ?? null, team: shared(id) })),
      desks: myDesks.filter(b => b.day === d).map(b => ({ id: b.id, name: b.deskName, area: placeName(b.areaName, b.areaPreset, t.presets), part: b.part })),
      rooms: rooms.map(b => ({
        id: b.id,
        room: b.roomName,
        span: formatSpan(b.start, b.end, locale),
        title: b.title,
        by: b.memberId === member.id ? null : nameOf(who.get(b.memberId), locale),
        checkable: c.rules.checkIn && !b.checkedIn && d === c.today && now >= b.start - checkInOpens && now < b.end,
      })),
      usualFree: usual !== null && !usual.assigned && !onUsual.some(b => b.day === d && overlaps(b.part, "day")),
      lentTo: lent ? nameOf(who.get(lent.memberId), locale) : null,
      visitors: visitors.filter(v => v.day === d).map(v => ({ id: v.id, time: formatTime(v.at, locale), name: v.company ? `${v.name} (${v.company})` : v.name, here: v.arrivedAt !== null })),
      // The first meeting still to come that day, for "at the office?"
      // when I said Remote or Off.
      meeting: (() => {
        const m = rooms.find(b => d > c.today || (d === c.today && b.end > now));
        return m ? { room: m.roomName, time: formatTime(m.start, locale) } : null;
      })(),
    };
  });
  const day = p.query("day");
  const focus = day !== undefined && days.includes(day) ? day : null;
  // The desks one may choose for the usual week: free ones and my own.
  const choices = (office?.floors ?? []).flatMap(f => f.areas.flatMap(a => a.desks
    .filter(d => (d.assignedTo === null || d.assignedTo === member.id) && (a.groupId === null || can(member, "bookings.any") || myGroups.includes(a.groupId)))
    .map(d => ({ id: d.id, name: `${d.name} · ${a.name}`, mine: d.assignedTo === member.id }))));
  const admin = can(member, "places.manage");
  return {
    title: t.week.title,
    body: (
      <div className="narrow">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <PageHeader title={t.week.title} intro={office ? <span className="place-line">{office.name}{office.address ? " · " + office.address : ""}</span> : undefined}
          secondary={office && c.offices.length > 1 ? <Island name="OfficePicker" props={{ offices: c.offices.map(o => ({ id: o.id, name: o.name })), current: office.id, label: t.shell.office, path: "/chest" }} /> : undefined} />
        {/* Before any office exists, people still say where they work
            ("who is in on Thursday?"): the week shows, with what an admin
            does first. */}
        {!office && (
          <EmptyState headingLevel={2} icon={<Building />} title={t.week.noOffice.title} body={admin ? t.week.noOffice.body : t.week.noOffice.presence}
            {...(admin
              ? { action: <><a className="button" href="/chest/places">{t.week.noOffice.action}</a><Island name="ExampleButton" props={{ t: { label: t.week.noOffice.example, added: t.places.example.added } }} /></> }
              : { note: t.week.noOffice.member })} />
        )}
        <Island name="WeekView" id={"week-" + (office?.id ?? "none")} props={{
          days: rows,
          officeId: office?.id ?? null,
          focus,
          usual: usual ? { ...usual, areaName: placeName(usual.areaName, usual.areaPreset, t.presets) } : null,
          pattern,
          weekdays: c.rules.weekdays.map(w => ({ day: w, name: formatDay(addDays("2024-01-01", w - 1), locale, { weekday: "long" }) })),
          desks: choices,
          calendarPage: how.calendarOn ? feedPage : null,
          self: { name: member.name, photo: member.photo },
          locale,
          t: { visitor: t.visitors.mine, visitorHere: t.visitors.mineHere, week: t.week, usual: t.usual, status: t.status, parts: t.parts, days: t.days, dialog: t.kit.dialog, you: t.people.you, checkIn: t.booking.checkIn, checkedIn: t.booking.checkedInToast },
        }} />
      </div>
    ),
  };
}
