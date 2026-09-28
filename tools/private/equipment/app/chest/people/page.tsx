import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { holderCounts, placeCounts } from "../../../lib/items.ts";
import { everyone, nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { PeopleView, type Entry } from "./people-view.tsx";

// Who holds what (managers): those who left with equipment first, then the
// team, then the places.
export default async function PeoplePage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) notFound();
  const sql = db();
  const [counts, placeList, team] = await Promise.all([holderCounts(sql, member), placeCounts(sql, member), everyone()]);
  const present = new Set(team.people.map(p => p.id));
  const names = await people([...counts.keys()].filter(id => !present.has(id)));
  const describe = (id: string) => {
    const c = counts.get(id) ?? { items: 0, seats: 0 };
    return [plural(t.peopleList.holds, c.items, locale), ...(c.seats > 0 ? [plural(t.peopleList.seats, c.seats, locale)] : [])].join(" · ");
  };
  const leavers: Entry[] = [...counts.keys()].filter(id => !present.has(id)).map(id => ({
    id, name: id === "erased" ? t.people.erased : nameOf(names.get(id), locale), photo: null, text: describe(id), count: (counts.get(id)?.items ?? 0) + (counts.get(id)?.seats ?? 0),
  })).filter(e => e.count > 0);
  const members: Entry[] = team.people.map(p => ({ id: p.id, name: p.name, photo: p.photo, text: describe(p.id), count: (counts.get(p.id)?.items ?? 0) + (counts.get(p.id)?.seats ?? 0) }));
  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>{t.peopleList.title}</h1>
          <p className="muted">{t.peopleList.intro}</p>
        </div>
      </div>
      {!team.ok && <p className="notice">{t.peopleList.unavailable}</p>}
      <PeopleView leavers={leavers} members={members} t={t.peopleList} />
      {placeList.length > 0 && (
        <section aria-labelledby="places">
          <h2 id="places" className="section-title">{t.peopleList.places}</h2>
          <ul className="people-grid">
            {placeList.map(p => (
              <li key={p.place}>
                <Link className="person-card" href={`/chest/items?holder=${encodeURIComponent("place:" + p.place)}`}>
                  <span className="place-pin" aria-hidden="true">▣</span>
                  <span className="person-text"><span className="strong">{p.place}</span><span className="small muted">{plural(t.peopleList.holds, p.count, locale)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
