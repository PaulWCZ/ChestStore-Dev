import { Island, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { CheckList, Download, Table, Upload } from "../components/icons.tsx";
import { format, formatDay, plural, relativeDays } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { listArrivals, suggestions } from "../lib/arrivals.ts";
import { awayOf, awayText } from "../lib/away.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { openCounts } from "../lib/journeys.ts";
import { offlineStaff } from "../lib/offline.ts";
import { membersWithRecord } from "../lib/records.ts";
import { today } from "../lib/zone.ts";
import { arriving, newcomers, thisMonth } from "../shared/calendar.ts";
import { collator } from "../shared/format.ts";
import { addDays, daysBetween, newcomerDays } from "../shared/model.ts";
import type { Card, Welcome } from "../islands/DirectoryView.tsx";
import { Moments } from "./parts.tsx";

// The directory: everyone, as portraits; who is new; this month's
// birthdays and anniversaries. The one obvious action: find someone.
export async function directoryPage({ member, locale, t, query }: PageContext): Promise<View> {
  const sql = db();
  const { ok, entries } = await directory(sql, member);
  const now = today();
  const fresh = newcomers(entries, now, newcomerDays);
  const freshIds = new Set(fresh.map(e => e.id));
  const soon = arriving(entries, now);
  // HR also sees the arrivals Hiring told of, and, when one of them now has
  // access, is offered to link them.
  const hr = can(member, "checklists.manage");
  const told = hr ? (await listArrivals(sql, member)).filter(a => a.status === "expected") : [];
  const matches = [...suggestions(told, entries)].flatMap(([arrivalId, found]) => (found.length === 1 ? [{ arrivalId, person: found[0]! }] : [])).slice(0, 3);
  const soonTold = told.filter(a => a.startDate === null || (a.startDate >= now && a.startDate <= addDays(now, 60)));
  const moments = thisMonth(entries, now);
  const todo = (await openCounts(sql, [member.id])).get(member.id) ?? 0;
  const me = entries.find(e => e.id === member.id);
  const bare = me !== undefined && !me.phone && !me.bio && me.skills.length === 0;
  // HR's first run: three steps, each ticked when it is done (then HR's
  // own profile nudge, like everyone's).
  const recorded = can(member, "records.manage") ? await membersWithRecord(sql, member) : null;
  const others = entries.filter(e => e.id !== member.id);
  const steps = recorded && entries.length > 1 ? [
    { key: "import", href: "/chest/import", done: others.some(e => e.title || e.team) },
    { key: "table", href: "/chest/table", done: entries.every(e => e.title) },
    { key: "records", href: "/chest/records", done: entries.every(e => recorded.has(e.id)) },
  ] as const : null;
  // A first run only: nobody's job written yet, or no HR record at all (a
  // record missing later is the records page's and the register's to say).
  const setup = steps && (!steps[0].done || recorded!.size === 0) ? steps : null;
  const pick = (key: string) => (query(key) ?? "").slice(0, 100);
  // Who is away today (Leave tells People): written here, dates on the server.
  const away = await awayOf(sql, entries.map(e => e.id), now);
  const awayWords = (id: string) => {
    const a = away.get(id);
    return a ? awayText(a, now, t.away, d => formatDay(d, locale, { weekday: "short", day: "numeric", month: "short" }), format) : null;
  };
  // Staff without the Chest (HR records not linked to a member): their
  // name, job and team, marked; HR's card opens the record, anyone else's
  // opens nothing (lib/offline.ts).
  const offline = await offlineStaff(sql, member, now);
  const byName = collator(locale);
  const cards: Card[] = [
    ...entries.map(e => ({
      id: e.id, name: e.name, photo: e.photo, title: e.title, team: e.team, office: e.office, skills: e.skills, isNew: freshIds.has(e.id), me: e.id === member.id, away: awayWords(e.id),
      // Found by the search too: the work address and HR's extra fields.
      also: [e.email, ...Object.values(e.extras)].filter(Boolean).join(" "),
      href: `/chest/people/${e.id}`, offline: false,
    })),
    ...offline.map(o => ({
      id: o.id, name: o.name, photo: null, title: o.title, team: o.team, office: "", skills: [], isNew: false, me: false, away: null, also: "",
      href: can(member, "records.manage") ? `/chest/records/${o.recordId}` : null, offline: true,
    })),
  ].sort((a, b) => byName.compare(a.name, b.name) || (a.id < b.id ? -1 : 1));
  const sorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort(byName.compare);
  const welcome: Welcome = {
    hello: fresh.length === 0 ? null : {
      title: t.directory.newcomers,
      people: fresh.slice(0, 3).map(e => ({
        id: e.id, name: e.name, photo: e.photo, team: e.team,
        text: format(t.directory.sayHello, { name: e.firstName || e.name }),
        line: [e.title, e.team].filter(Boolean).join(" · "),
        started: format(t.directory.started, { when: relativeDays(-daysBetween(e.startDate!, now), locale) }),
      })),
    },
    setup: setup && { title: t.directory.setup.title, body: t.directory.setup.body, done: t.directory.setup.done, steps: setup.map(s => ({ key: s.key, href: s.href, label: t.directory.setup[s.key], done: s.done })) },
    nudge: bare ? { name: member.name, photo: member.photo, title: t.directory.complete.title, body: t.directory.complete.body, action: t.directory.complete.action, href: `/chest/people/${member.id}/edit` } : null,
  };
  return {
    title: t.directory.title,
    body: (
      <div className="page wide">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        {!ok && <p className="banner warn" role="alert">{t.directory.unavailable}</p>}
        {matches.map(m => <Island key={m.arrivalId} id={`suggest-${m.arrivalId}`} name="LinkSuggestion" props={{ arrivalId: m.arrivalId, memberId: m.person.id, text: format(t.arrivals.suggestion, { name: m.person.name }), action: t.arrivals.suggestionAction, linked: t.arrivals.linked }} />)}
        {todo > 0 && (
          <a className="banner todo" href="/chest/todo">
            <CheckList />
            <span>{plural(t.directory.todo, todo, locale)}</span>
            <span className="go">{t.directory.seeTodo}</span>
          </a>
        )}
        <PageHeader
          title={t.directory.title}
          intro={plural(t.directory.count, entries.length + offline.length, locale)}
          secondary={(can(member, "directory.import") || can(member, "directory.export")) && (
            <>
              {can(member, "profile.job") && <a className="button quiet small" href="/chest/table"><Table />{t.directory.table}</a>}
              {can(member, "directory.import") && <a className="button quiet small" href="/chest/import"><Upload />{t.directory.import}</a>}
              {can(member, "directory.export") && <a className="button quiet small" href="/chest/export" download><Download />{t.directory.export}</a>}
            </>
          )}
        />
        <Island
          name="DirectoryView"
          props={{
            cards,
            teams: sorted(cards.map(c => c.team)),
            offices: sorted(cards.map(c => c.office)),
            locale,
            initial: { q: pick("q"), team: pick("team"), office: pick("office") },
            welcome,
            t: { team: t.directory.team, allTeams: t.directory.allTeams, office: t.directory.office, allOffices: t.directory.allOffices, clear: t.directory.clear, shown: t.directory.shown, noResults: t.directory.noResults, askMe: t.directory.askMe, new: t.directory.new, offline: t.directory.offline, you: t.profile.you, search: t.search },
          }}
        />
        <Moments
          month={moments.map(m => ({
            key: m.kind + m.person.id, href: `/chest/people/${m.person.id}`, name: m.person.name, photo: m.person.photo, past: m.past, birthday: m.kind === "birthday",
            line: m.kind === "birthday" ? t.directory.birthday : plural(t.directory.anniversary, m.years, locale),
            date: formatDay(m.date, locale, { day: "numeric", month: "short" }),
          }))}
          soon={[
            ...soon.map(e => ({ key: e.id, href: `/chest/people/${e.id}`, name: e.name, photo: e.photo, source: null, line: [e.title, e.team].filter(Boolean).join(" · "), date: format(t.directory.startsOn, { date: formatDay(e.startDate!, locale, { day: "numeric", month: "short" }) }) })),
            ...soonTold.map(a => ({ key: "arrival" + a.id, href: "/chest/checklists#arrivals", name: a.name, photo: null, source: a.source === "manual" ? t.arrivals.manual : t.arrivals.fromHiring, line: [a.job, a.team].filter(Boolean).join(" · "), date: a.startDate ? format(t.directory.startsOn, { date: formatDay(a.startDate, locale, { day: "numeric", month: "short" }) }) : t.arrivals.noDate })),
          ]}
          t={{ thisMonth: t.directory.thisMonth, arriving: t.directory.arriving }}
        />
      </div>
    ),
  };
}
