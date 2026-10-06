import { Island, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { format, formatDay, localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { leavingList } from "../lib/departures.ts";
import { holderCounts, placeCounts } from "../lib/items.ts";
import { everyone, nameOf, people } from "../lib/people.ts";
import type { Entry } from "../islands/PeopleView.tsx";

// Who holds what (managers): those who left with equipment first, then the
// team, then the places.
export async function peoplePage({ member, locale: language, t }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const [counts, placeList, team, departing] = await Promise.all([holderCounts(sql, member), placeCounts(sql, member), everyone(), leavingList(sql, member)]);
  // Their last day, when People told it.
  const lastDays = new Map(departing.map(d => [d.memberId, d.lastDay]));
  const present = new Set(team.people.map(p => p.id));
  const names = await people([...counts.keys()].filter(id => !present.has(id)));
  const describe = (id: string) => {
    const c = counts.get(id) ?? { items: 0, seats: 0 };
    const last = present.has(id) ? lastDays.get(id) : undefined;
    return [
      plural(t.peopleList.holds, c.items, locale),
      ...(c.seats > 0 ? [plural(t.peopleList.seats, c.seats, locale)] : []),
      ...(last ? [format(t.overview.lastDay, { date: formatDay(last, locale, { day: "numeric", month: "short" }) })] : []),
    ].join(" · ");
  };
  const leavers: Entry[] = [...counts.keys()].filter(id => !present.has(id)).map(id => ({
    id, name: id === "erased" ? t.people.erased : nameOf(names.get(id), locale), photo: null, text: describe(id), count: (counts.get(id)?.items ?? 0) + (counts.get(id)?.seats ?? 0),
  })).filter(e => e.count > 0);
  const members: Entry[] = team.people.map(p => ({ id: p.id, name: p.name, photo: p.photo, text: describe(p.id), count: (counts.get(p.id)?.items ?? 0) + (counts.get(p.id)?.seats ?? 0) }));
  return { title: t.peopleList.title, body: (
    <div className="wide">
      <PageHeader size="m" title={t.peopleList.title} intro={t.peopleList.intro} />
      {!team.ok && <p className="notice">{t.peopleList.unavailable}</p>}
      <Island id="i-people" name="PeopleView" props={{ leavers, members, t: t.peopleList, search: t.search }} />
      {placeList.length > 0 && (
        <section aria-labelledby="places">
          <h2 id="places" className="section-title">{t.peopleList.places}</h2>
          <ul className="people-grid">
            {placeList.map(p => (
              <li key={p.place}>
                <a className="person-card" href={`/chest/items?holder=${encodeURIComponent("place:" + p.place)}`}>
                  <span className="place-pin" aria-hidden="true">▣</span>
                  <span className="person-text"><span className="strong">{p.place}</span><span className="small muted">{plural(t.peopleList.holds, p.count, locale)}</span></span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  ) };
}
