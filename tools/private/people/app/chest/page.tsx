import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Cake, CheckList, Download, Star, Upload, Wave } from "../../components/icons.tsx";
import { Portrait } from "../../components/portrait.tsx";
import { can } from "../../lib/access.ts";
import { arriving, newcomers, thisMonth } from "../../lib/calendar.ts";
import { db } from "../../lib/db.ts";
import { directory } from "../../lib/directory.ts";
import { format, formatDay, plural, relativeDays } from "../../lib/i18n/index.ts";
import { openCounts } from "../../lib/journeys.ts";
import { daysBetween, newcomerDays, today } from "../../lib/model.ts";
import { viewer } from "../../lib/session.ts";
import { DirectoryView, type Card } from "./directory-view.tsx";

// The directory: everyone, as portraits; who is new; this month's
// birthdays and anniversaries. The one obvious action: find someone.
export default async function DirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const { ok, entries } = await directory(sql, member);
  const now = today();
  const fresh = newcomers(entries, now, newcomerDays);
  const freshIds = new Set(fresh.map(e => e.id));
  const soon = arriving(entries, now);
  const moments = thisMonth(entries, now);
  const todo = (await openCounts(sql, [member.id])).get(member.id) ?? 0;
  const me = entries.find(e => e.id === member.id);
  const bare = me !== undefined && !me.phone && !me.bio && me.skills.length === 0;
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string).slice(0, 100) : "");
  const cards: Card[] = entries.map(e => ({
    id: e.id, name: e.name, photo: e.photo, title: e.title, team: e.team, office: e.office, skills: e.skills, isNew: freshIds.has(e.id), me: e.id === member.id,
  }));
  const welcome = (
    <>
      {fresh.length > 0 && (
        <section className="hello" aria-labelledby="hello-title">
          <h2 id="hello-title" className="eyebrow"><Wave />{t.directory.newcomers}</h2>
          <ul className="hello-list">
            {fresh.slice(0, 3).map(e => (
              <li key={e.id}>
                <Link href={`/chest/people/${e.id}`} className="hello-card">
                  <Portrait name={e.name} photo={e.photo} size={112} team={e.team} arch />
                  <span className="hello-text">
                    <strong>{format(t.directory.sayHello, { name: e.firstName || e.name })}</strong>
                    <span>{[e.title, e.team].filter(Boolean).join(" · ")}</span>
                    <span className="muted">{format(t.directory.started, { when: relativeDays(-daysBetween(e.startDate!, now), locale) })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {bare && (
        <div className="nudge">
          <Portrait name={member.name} photo={member.photo} size={56} />
          <div>
            <h2>{t.directory.complete.title}</h2>
            <p className="muted">{t.directory.complete.body}</p>
          </div>
          <Link className="button" href={`/chest/people/${member.id}/edit`}>{t.directory.complete.action}</Link>
        </div>
      )}
    </>
  );
  return (
    <main className="page wide">
      <AutoRefresh seconds={60} />
      {!ok && <p className="banner warn" role="alert">{t.directory.unavailable}</p>}
      {todo > 0 && (
        <Link className="banner todo" href="/chest/todo">
          <CheckList />
          <span>{plural(t.directory.todo, todo, locale)}</span>
          <span className="go">{t.directory.seeTodo}</span>
        </Link>
      )}
      <div className="page-head">
        <div>
          <h1>{t.directory.title}</h1>
          <p className="muted">{plural(t.directory.count, entries.length, locale)}</p>
        </div>
        {(can(member, "directory.import") || can(member, "directory.export")) && (
          <div className="row">
            {can(member, "directory.import") && <Link className="button quiet small" href="/chest/import"><Upload />{t.directory.import}</Link>}
            {can(member, "directory.export") && <a className="button quiet small" href="/chest/export" download><Download />{t.directory.export}</a>}
          </div>
        )}
      </div>
      <DirectoryView
        cards={cards}
        locale={locale}
        initial={{ q: pick("q"), team: pick("team"), office: pick("office") }}
        welcome={welcome}
        t={{ directory: t.directory, you: t.profile.you }}
      />
      {(moments.length > 0 || soon.length > 0) && (
        <div className="moments">
          {moments.length > 0 && (
            <section aria-labelledby="month-title">
              <h2 id="month-title" className="eyebrow"><Star />{t.directory.thisMonth}</h2>
              <ul className="moment-list">
                {moments.map(m => (
                  <li key={m.kind + m.person.id} className={m.past ? "past" : undefined}>
                    <Link href={`/chest/people/${m.person.id}`}>
                      <Portrait name={m.person.name} photo={m.person.photo} size={40} />
                      <span className="moment-text">
                        <strong>{m.person.name}</strong>
                        <span className="muted">{m.kind === "birthday" ? <><Cake /> {t.directory.birthday}</> : <><Star /> {plural(t.directory.anniversary, m.years, locale)}</>}</span>
                      </span>
                      <span className="moment-date">{formatDay(m.date, locale, { day: "numeric", month: "short" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {soon.length > 0 && (
            <section aria-labelledby="soon-title">
              <h2 id="soon-title" className="eyebrow"><Wave />{t.directory.arriving}</h2>
              <ul className="moment-list">
                {soon.map(e => (
                  <li key={e.id}>
                    <Link href={`/chest/people/${e.id}`}>
                      <Portrait name={e.name} photo={e.photo} size={40} />
                      <span className="moment-text">
                        <strong>{e.name}</strong>
                        <span className="muted">{[e.title, e.team].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="moment-date">{format(t.directory.startsOn, { date: formatDay(e.startDate!, locale, { day: "numeric", month: "short" }) })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
