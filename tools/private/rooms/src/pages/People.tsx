import { Island, type PageContext, type View } from "@argentic/chest-app";
import { Avatar, EmptyState, Filters, PageHeader } from "@argentic/chest-ui/components";
import { bookableDays, context, shownDay } from "../lib/context.ts";
import { deskBookingsOf, type DeskBooking } from "../lib/desk-bookings.ts";
import { directory } from "../lib/directory.ts";
import { chestGroups, groupsOf } from "../lib/groups.ts";
import { limits, nextWorkingDay, placeName, twoWeeks, type Status } from "../shared/model.ts";
import { inMeetings, presenceOf } from "../lib/presence.ts";
import { format, formatDay, plural } from "../i18n/index.ts";

// "Who's where": everyone who has Rooms, on one day, grouped by where they
// work, with the desk they booked. A team (a Chest group: Sales, Tech…)
// narrows it — "is my team in on Thursday?"; search a name — "Where is
// Léa?" — to see that person's coming days too.
export async function peoplePage(p: PageContext): Promise<View> {
  const c = await context(p, p.query("office"));
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { locale, t, sql } = c;
  const day = shownDay(p.query("day"), { today: c.today, rules: { ...c.rules, weekdays: [1, 2, 3, 4, 5, 6, 7] } });
  const q = (p.query("q") ?? "").trim().slice(0, limits.search);
  // Teams: the Chest's groups that have someone here, mine first.
  const [all, groupList, mine] = await Promise.all([directory(q || undefined), chestGroups(), groupsOf(c.member)]);
  const used = new Set(all.flatMap(x => x.groups));
  const teams = groupList.filter(g => used.has(g.id)).sort((a, b) => Number(mine.includes(b.id)) - Number(mine.includes(a.id)) || a.name.localeCompare(b.name, locale));
  const asked = p.query("team");
  const team = asked !== undefined ? teams.find(g => g.id === asked) ?? null : null;
  const everyone = team ? all.filter(x => x.groups.includes(team.id)) : all;
  const ids = everyone.map(x => x.id);
  const coming = twoWeeks(c.today, c.rules.weekdays).filter(d => d >= c.today).slice(0, 5);
  const from = coming[0] && coming[0] < day ? coming[0] : day;
  const to = coming.at(-1) && coming.at(-1)! > day ? coming.at(-1)! : day;
  const [said, desks, meetings] = await Promise.all([presenceOf(sql, ids, from, to), deskBookingsOf(sql, ids, from, to), inMeetings(sql, ids, from, to)]);
  const officeName = new Map(c.offices.map(o => [o.id, o.name]));
  // Each person's desks of each day, once (hundreds of people, a week).
  const deskOf = new Map<string, DeskBooking[]>();
  for (const b of desks) deskOf.set(b.memberId + " " + b.day, [...(deskOf.get(b.memberId + " " + b.day) ?? []), b]);
  // What a person said; else a desk or a meeting in a room that day means
  // the office (as My week counts them).
  const statusOf = (id: string, d: string): Status | "none" => said.get(id)?.get(d)?.status ?? (deskOf.has(id + " " + d) || meetings.get(id)?.has(d) ? "office" : "none");
  const groups: Record<Status | "none", typeof everyone> = { office: [], remote: [], off: [], none: [] };
  for (const x of everyone) groups[statusOf(x.id, day)].push(x);
  const detailed = q !== "" && everyone.length <= 5;
  const days = bookableDays(c).length > 0 ? bookableDays(c) : [nextWorkingDay(c.today, c.rules.weekdays)];
  return {
    title: t.who.title,
    body: (
      <div className="narrow">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <PageHeader title={t.who.title} intro={<span className="place-line">{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</span>} />
        {/* A name (the kit's SearchBox: "/" reaches it), a team (the kit's
            Filters: links, one team at a time, "Everyone" first). */}
        <div className="who-find">
          <Island name="Search" props={{ action: "/chest/people", value: q, keep: { day, team: team?.id }, labels: t.kit.search }} />
          {teams.length > 0 && (
            <div>
              <Filters path="/chest/people" params={{ day, q: q || undefined, team: team?.id }} labels={t.kit.filters}
                groups={[{ key: "team", label: t.who.teams, all: true, options: teams.slice(0, 16).map(g => ({ value: g.id, label: mine.includes(g.id) ? format(t.who.myTeamName, { team: g.name }) : g.name })) }]} />
            </div>
          )}
        </div>
        <Island name="DayPicker" props={{ days, current: day, today: c.today, path: "/chest/people", keep: { ...(q ? { q } : {}), ...(team ? { team: team.id } : {}) }, label: t.days.date, labels: t.kit.date }} />
        {everyone.length === 0 ? (
          <EmptyState title={q ? t.who.noMatch : team ? t.who.noTeam : t.who.nobody} />
        ) : (
          (["office", "remote", "off", "none"] as const).filter(g => groups[g].length > 0).map(g => (
            <section key={g} className={"who-group is-" + g} aria-labelledby={"who-" + g}>
              <h2 id={"who-" + g} className="annotation">{t.who.groups[g]} <span className="count">{plural(t.who.count, groups[g].length, locale)}</span></h2>
              <ul className="rows">
                {groups[g].map(x => {
                  const desk = deskOf.get(x.id + " " + day) ?? [];
                  const office = said.get(x.id)?.get(day)?.officeId;
                  return (
                    <li key={x.id} id={"p-" + x.id} className="row-item person-row">
                      <Avatar name={x.name} photo={x.photo} size="l" />
                      <span className="grow">
                        <strong>{x.name}</strong>
                        {desk.map(b => <span key={b.id} className="muted small sub-line">{format(t.who.desk, { desk: b.deskName, area: placeName(b.areaName, b.areaPreset, t.presets) })}{b.part !== "day" ? " · " + t.parts[b.part] : ""}{c.offices.length > 1 ? " · " + (officeName.get(b.officeId) ?? "") : ""}</span>)}
                        {desk.length === 0 && g === "office" && 1 < c.offices.length && office && <span className="muted small sub-line">{format(t.who.in, { office: officeName.get(office) ?? "" })}</span>}
                      </span>
                      {detailed && (
                        <ol className="mini-week" aria-label={t.who.week}>
                          {coming.map(d => {
                            const s = statusOf(x.id, d);
                            return <li key={d} className={"is-" + s} title={formatDay(d, locale) + " · " + t.status[s]}><span>{formatDay(d, locale, { weekday: "narrow" })}</span><span className="visually-hidden">{formatDay(d, locale)}: {t.status[s]}</span></li>;
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
    ),
  };
}
