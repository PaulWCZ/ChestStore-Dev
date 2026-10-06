import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Desk } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { bookableDays, context, lockOf, shownDay } from "../lib/context.ts";
import { deskDay, lentDesks, type DeskBooking } from "../lib/desk-bookings.ts";
import { directory } from "../lib/directory.ts";
import { chestGroups, groupsOf } from "../lib/groups.ts";
import { features as featureKeys, isPart, memberPattern, type Feature, type Part } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { format, formatDay } from "../i18n/index.ts";
import type { DeskTile } from "../islands/DeskView.tsx";

// Book a desk: pick a day and a part of it, then tap a free desk on the
// plan (areas of each floor as tiles) or in the list of free ones. An
// admin or an office manager may book for someone else (?for=).
export async function desksPage(p: PageContext): Promise<View> {
  const c = await context(p, p.query("office"));
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { member, locale, t, sql, office } = c;
  const exempt = can(member, "bookings.any");
  const day = shownDay(p.query("day"), c);
  const asked = p.query("part");
  const part: Part = isPart(asked) ? asked : "day";
  const view = p.query("view") === "list" ? "list" : "plan";
  const wanted = (p.query("f") ?? "").split(",").filter((f): f is Feature => (featureKeys as readonly string[]).includes(f));
  const everyone = exempt ? await directory() : [];
  const forParam = p.query("for");
  const target = exempt && forParam !== undefined && memberPattern.test(forParam) ? everyone.find(x => x.id === forParam && x.id !== member.id) ?? null : null;
  // Whom the page books for: me, or the person an admin chose.
  const me = target ? { id: target.id, groups: target.groups } : { id: member.id, groups: await groupsOf(member) };
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
  // Each desk's bookings, once (a plan of hundreds of desks reads them per desk).
  const onDesk = new Map<string, DeskBooking[]>();
  for (const b of bookings) onDesk.set(b.deskId, [...(onDesk.get(b.deskId) ?? []), b]);
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
        bookings: (onDesk.get(d.id) ?? []).map(b => ({ id: b.id, part: b.part, mine: b.memberId === me.id, name: b.memberId === member.id ? t.people.you : nameOf(who.get(b.memberId), locale), photo: who.get(b.memberId)?.photo ?? null })),
      })),
    })).filter(a => a.desks.length > 0),
  })).filter(f => f.areas.length > 0);
  // What the day links keep: the page's other parameters, in its order.
  const keep = Object.fromEntries([...new URLSearchParams(href({ day: null }).split("?")[1] ?? "").entries()]);
  const lock = lockOf(c, day, exempt);
  const long = { weekday: "long", day: "numeric", month: "long" } as const;
  const hint = lock?.why === "closed" ? t.rooms.closedDay
    : lock?.why === "past" ? t.errors.past
    : lock?.why === "notYet" ? format(t.rooms.opensOn, { date: formatDay(lock.opens!, locale, long) })
    : c.rules.maxDeskDays ? format(t.desks.rulesWeek, { days: c.rules.daysAhead, max: c.rules.maxDeskDays }) : format(t.desks.rules, { days: c.rules.daysAhead });
  return {
    title: t.desks.title,
    body: (
      <div className="wide">
        <Island name="AutoRefresh" props={{ seconds: 20 }} />
        {/* The day strip, the other day, the part of day, the view and the
            five feature filters come before the first desk: one Tab stop
            jumps over them. */}
        {floors.length > 0 && <a className="ck-skip" href="#desk-places">{t.desks.skip}</a>}
        <PageHeader title={t.desks.title}
          intro={<span className="place-line">{formatDay(day, locale, long)}{office ? " · " + office.name : ""}</span>}
          secondary={exempt || c.offices.length > 1 ? <>
            {exempt && office && <Island name="BookFor" props={{ people: everyone.filter(x => x.id !== member.id).map(x => ({ id: x.id, name: x.name, photo: x.photo })), current: target?.id ?? "", path: href({ for: null }), locale, t: { label: t.booking.for, hint: t.booking.forHint, picker: t.kit.peoplePicker } }} />}
            {office && c.offices.length > 1 && <Island name="OfficePicker" props={{ offices: c.offices.map(o => ({ id: o.id, name: o.name })), current: office.id, label: t.shell.office, path: href({}) }} />}
          </> : undefined} />
        <Island name="DayPicker" props={{ days: bookableDays(c), current: day, today: c.today, path: "/chest/desks", keep, label: t.days.date, labels: t.kit.date }} />
        {floors.length === 0 ? (
          <EmptyState icon={<Desk />} title={t.desks.none.title} body={t.desks.none.body}
            {...(can(member, "places.manage") ? { action: <a className="button" href="/chest/places">{t.week.noOffice.action}</a> } : {})} />
        ) : (
          <Island name="DeskView" id={`desks-${office?.id}-${day}-${part}-${target?.id ?? "me"}`} props={{
            floors,
            day,
            part,
            view,
            wanted,
            locked: lock?.why ?? null,
            hint,
            forWhom: target ? { id: target.id, name: target.name } : null,
            links: {
              parts: { day: href({ part: null }), am: href({ part: "am" }), pm: href({ part: "pm" }) },
              views: { plan: href({ view: null }), list: href({ view: "list" }) },
              // What the address holds, for the feature filters' links.
              params: { day, part: part === "day" ? undefined : part, view: view === "plan" ? undefined : view, f: wanted.join(",") || undefined, office: office?.id, for: target?.id },
            },
            locale,
            t: { desks: t.desks, parts: t.parts, features: t.features, featuresShort: t.featuresShort, keptFor: t.rooms.keptFor, filters: t.kit.filters },
          }} />
        )}
      </div>
    ),
  };
}
