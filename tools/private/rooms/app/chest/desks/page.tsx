import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { DayPicker } from "../../../components/day-picker.tsx";
import { Desk } from "../../../components/icons.tsx";
import { OfficePicker } from "../../../components/office-picker.tsx";
import { can } from "../../../lib/access.ts";
import { bookableDays, context, lockOf, shownDay } from "../../../lib/context.ts";
import { deskDay, lentDesks } from "../../../lib/desk-bookings.ts";
import { directory } from "../../../lib/directory.ts";
import { chestGroups } from "../../../lib/groups.ts";
import { format, formatDay } from "../../../lib/i18n/index.ts";
import { features as featureKeys, isPart, memberPattern, type Feature, type Part } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { BookFor } from "./book-for.tsx";
import { DeskView, type DeskTile } from "./desk-view.tsx";

// Book a desk: pick a day and a part of it, then tap a free desk on the
// plan (areas of each floor as tiles) or in the list of free ones. An admin
// may book for someone else (?for=).
export default async function Desks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c) return null;
  const { member, locale, t, sql, office } = c;
  const exempt = can(member, "bookings.any");
  const day = shownDay(params["day"], c);
  const part: Part = isPart(params["part"]) ? params["part"] : "day";
  const view = params["view"] === "list" ? "list" : "plan";
  const wanted = (typeof params["f"] === "string" ? params["f"].split(",") : []).filter((f): f is Feature => (featureKeys as readonly string[]).includes(f));
  const everyone = exempt ? await directory() : [];
  const target = exempt && typeof params["for"] === "string" && memberPattern.test(params["for"]) ? everyone.find(p => p.id === params["for"] && p.id !== member.id) ?? null : null;
  // Whom the page books for: me, or the person an admin chose.
  const me = target ? { id: target.id, groups: target.groups } : { id: member.id, groups: member.groups };
  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | null> = { day, part: part === "day" ? null : part, view: view === "plan" ? null : view, f: wanted.join(",") || null, office: office?.id ?? null, for: target?.id ?? null, ...changes };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    return "/chest/desks?" + q.toString();
  };
  const [bookings, lent, groupList] = office ? await Promise.all([deskDay(sql, member, office.id, day), lentDesks(sql, office.id, day), chestGroups()]) : [[], new Map<string, string>(), []];
  const groups = new Map(groupList.map(g => [g.id, g.name]));
  const allDesks = office?.floors.flatMap(f => f.areas.flatMap(a => a.desks)) ?? [];
  const who = await people([...bookings.map(b => b.memberId), ...allDesks.flatMap(d => (d.assignedTo ? [d.assignedTo] : []))]);
  const floors = (office?.floors ?? []).map(f => ({
    id: f.id,
    name: f.name,
    areas: f.areas.map(a => ({
      id: a.id,
      name: a.name,
      kept: a.groupId ? { name: groups.get(a.groupId) ?? t.rooms.aGroup, mine: exempt || me.groups.includes(a.groupId) } : null,
      desks: a.desks.map((d): DeskTile => ({
        id: d.id,
        name: d.name,
        features: d.features,
        assigned: d.assignedTo ? { mine: d.assignedTo === me.id, name: nameOf(who.get(d.assignedTo), locale), lent: lent.has(d.id) && d.assignedTo !== me.id } : null,
        bookings: bookings.filter(b => b.deskId === d.id).map(b => ({ id: b.id, part: b.part, mine: b.memberId === me.id, name: b.memberId === member.id ? t.people.you : nameOf(who.get(b.memberId), locale), photo: who.get(b.memberId)?.photo ?? null })),
      })),
    })).filter(a => a.desks.length > 0),
  })).filter(f => f.areas.length > 0);
  // What the day links keep: the page's other parameters, in its order.
  const keep = Object.fromEntries([...new URLSearchParams(href({ day: null }).split("?")[1] ?? "").entries()].map(([k, v]) => [k, v]));
  const lock = lockOf(c, day, exempt);
  const hint = lock?.why === "closed" ? t.rooms.closedDay
    : lock?.why === "past" ? t.errors.past
    : lock?.why === "notYet" ? format(t.rooms.opensOn, { date: formatDay(lock.opens!, locale, { weekday: "long", day: "numeric", month: "long" }) })
    : c.rules.maxDeskDays ? format(t.desks.rulesWeek, { days: c.rules.daysAhead, max: c.rules.maxDeskDays }) : format(t.desks.rules, { days: c.rules.daysAhead });
  return (
    <div className="wide">
      <AutoRefresh seconds={20} />
      {/* The day strip (one Tab stop since kit 0.2.6), the other day, the
          part of day, the view and the five feature filters come before
          the first desk — ten stops: one Tab stop jumps over them. */}
      {floors.length > 0 && <a className="ck-skip" href="#desk-places">{t.desks.skip}</a>}
      <PageHeader title={t.desks.title}
        intro={<span className="place-line">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}{office ? " · " + office.name : ""}</span>}
        secondary={exempt || c.offices.length > 1 ? <>
          {exempt && office && <BookFor people={everyone.filter(p => p.id !== member.id).map(p => ({ id: p.id, name: p.name, photo: p.photo }))} current={target?.id ?? ""} path={href({ for: null })} locale={locale} t={{ label: t.booking.for, hint: t.booking.forHint, picker: t.peoplePicker }} />}
          {office && <OfficePicker offices={c.offices.map(o => ({ id: o.id, name: o.name }))} current={office.id} label={t.shell.office} path={href({})} />}
        </> : undefined} />
      <DayPicker days={bookableDays(c)} current={day} today={c.today} path="/chest/desks" keep={keep} label={t.days.date} labels={t.date} />
      {floors.length === 0 ? (
        <EmptyState icon={<Desk />} title={t.desks.none.title} body={t.desks.none.body}
          {...(can(member, "places.manage") ? { action: <Link className="button" href="/chest/places">{t.week.noOffice.action}</Link> } : {})} />
      ) : (
        <DeskView
          key={day + part + (target?.id ?? "")}
          floors={floors}
          day={day}
          part={part}
          view={view}
          wanted={wanted}
          locked={lock?.why ?? null}
          hint={hint}
          forWhom={target ? { id: target.id, name: target.name } : null}
          links={{
            parts: { day: href({ part: null }), am: href({ part: "am" }), pm: href({ part: "pm" }) },
            views: { plan: href({ view: null }), list: href({ view: "list" }) },
            // What the address holds, for the feature filters' links.
            params: { day, part: part === "day" ? undefined : part, view: view === "plan" ? undefined : view, f: wanted.join(",") || undefined, office: office?.id, for: target?.id },
          }}
          locale={locale}
          t={{ desks: t.desks, parts: t.parts, features: t.features, featuresShort: t.featuresShort, errors: t.errors, keptFor: t.rooms.keptFor, filters: t.filters }}
        />
      )}
    </div>
  );
}
