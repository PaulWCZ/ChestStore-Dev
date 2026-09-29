import { Avatar, EmptyState, Filters, PageHeader, SearchBox } from "@argentic/chest-ui/components";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { DayPicker } from "../../../components/day-picker.tsx";
import { bookableDays, context, shownDay } from "../../../lib/context.ts";
import { deskBookingsOf } from "../../../lib/desk-bookings.ts";
import { directory } from "../../../lib/directory.ts";
import { chestGroups } from "../../../lib/groups.ts";
import { format, formatDay, plural } from "../../../lib/i18n/index.ts";
import { limits, nextWorkingDay, placeName, twoWeeks, type Status } from "../../../lib/model.ts";
import { inMeetings, presenceOf } from "../../../lib/presence.ts";

// "Who's where": everyone who has Rooms, on one day, grouped by where they
// work, with the desk they booked. A team (a Chest group: Sales, Tech…)
// narrows it — "is my team in on Thursday?"; search a name — "Where is
// Léa?" — to see that person's coming days too.
export default async function WhoIsWhere({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c) return null;
  const { locale, t, sql } = c;
  const day = shownDay(params["day"], { today: c.today, rules: { ...c.rules, weekdays: [1, 2, 3, 4, 5, 6, 7] } });
  const q = typeof params["q"] === "string" ? params["q"].trim().slice(0, limits.search) : "";
  // Teams: the Chest's groups that have someone here, mine first.
  const [all, groupList] = await Promise.all([directory(q || undefined), chestGroups()]);
  const used = new Set(all.flatMap(p => p.groups));
  const teams = groupList.filter(g => used.has(g.id)).sort((a, b) => Number(c.member.groups.includes(b.id)) - Number(c.member.groups.includes(a.id)) || a.name.localeCompare(b.name, locale));
  const team = typeof params["team"] === "string" ? teams.find(g => g.id === params["team"]) ?? null : null;
  const everyone = team ? all.filter(p => p.groups.includes(team.id)) : all;
  const ids = everyone.map(p => p.id);
  const coming = twoWeeks(c.today, c.rules.weekdays).filter(d => d >= c.today).slice(0, 5);
  const from = coming[0] && coming[0] < day ? coming[0] : day;
  const to = coming.at(-1) && coming.at(-1)! > day ? coming.at(-1)! : day;
  const [said, desks, meetings] = await Promise.all([presenceOf(sql, ids, from, to), deskBookingsOf(sql, ids, from, to), inMeetings(sql, ids, from, to)]);
  const officeName = new Map(c.offices.map(o => [o.id, o.name]));
  // What a person said; else a desk or a meeting in a room that day means
  // the office (as My week counts them).
  const statusOf = (id: string, d: string): Status | "none" => said.get(id)?.get(d)?.status ?? (desks.some(b => b.memberId === id && b.day === d) || meetings.get(id)?.has(d) ? "office" : "none");
  const groups: Record<Status | "none", typeof everyone> = { office: [], remote: [], off: [], none: [] };
  for (const p of everyone) groups[statusOf(p.id, day)].push(p);
  const detailed = q !== "" && everyone.length <= 5;
  const days = bookableDays(c).length > 0 ? bookableDays(c) : [nextWorkingDay(c.today, c.rules.weekdays)];
  return (
    <div className="narrow">
      <AutoRefresh seconds={30} />
      <PageHeader title={t.who.title} intro={<span className="place-line">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</span>} />
      {/* A name (the kit's SearchBox: "/" reaches it), a team (the kit's
          Filters: links, one team at a time, "Everyone" first). */}
      <div className="who-find">
        <SearchBox action="/chest/people" value={q} keep={{ day, team: team?.id }} labels={t.search} />
        {teams.length > 0 && (
          <div className="team-chips">
            <Filters path="/chest/people" params={{ day, q: q || undefined, team: team?.id }} labels={t.filters}
              groups={[{ key: "team", label: t.who.teams, all: true, options: teams.slice(0, 16).map(g => ({ value: g.id, label: c.member.groups.includes(g.id) ? format(t.who.myTeamName, { team: g.name }) : g.name })) }]} />
          </div>
        )}
      </div>
      <DayPicker days={days} current={day} today={c.today} path="/chest/people" keep={{ ...(q ? { q } : {}), ...(team ? { team: team.id } : {}) }} label={t.days.date} labels={t.date} />
      {everyone.length === 0 ? (
        <EmptyState title={q ? t.who.noMatch : team ? t.who.noTeam : t.who.nobody} />
      ) : (
        (["office", "remote", "off", "none"] as const).filter(g => groups[g].length > 0).map(g => (
          <section key={g} className={"who-group is-" + g} aria-labelledby={"who-" + g}>
            <h2 id={"who-" + g} className="annotation">{t.who.groups[g]} <span className="count">{plural(t.who.count, groups[g].length, locale)}</span></h2>
            <ul className="rows">
              {groups[g].map(p => {
                const desk = desks.filter(b => b.memberId === p.id && b.day === day);
                const office = said.get(p.id)?.get(day)?.officeId;
                return (
                  <li key={p.id} className="row-item person-row">
                    <Avatar name={p.name} photo={p.photo} size="l" />
                    <span className="grow">
                      <strong>{p.name}</strong>
                      {desk.map(b => <span key={b.id} className="muted small sub-line">{format(t.who.desk, { desk: b.deskName, area: placeName(b.areaName, b.areaPreset, t.presets) })}{b.part !== "day" ? " · " + t.parts[b.part] : ""}{c.offices.length > 1 ? " · " + (officeName.get(b.officeId) ?? "") : ""}</span>)}
                      {desk.length === 0 && g === "office" && 1 < c.offices.length && office && <span className="muted small sub-line">{format(t.who.in, { office: officeName.get(office) ?? "" })}</span>}
                    </span>
                    {detailed && (
                      <ol className="mini-week" aria-label={t.who.week}>
                        {coming.map(d => {
                          const s = statusOf(p.id, d);
                          return <li key={d} className={"is-" + s} title={formatDay(d, locale) + " · " + t.status[s]}><span className="dow">{formatDay(d, locale, { weekday: "narrow" })}</span><span className="visually-hidden">{formatDay(d, locale)}: {t.status[s]}</span></li>;
                        })}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
