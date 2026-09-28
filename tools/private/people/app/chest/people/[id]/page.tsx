import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Cake, Door, Moon, Pencil, Phone, Pin, Wave } from "../../../../components/icons.tsx";
import { Portrait } from "../../../../components/portrait.tsx";
import { can } from "../../../../lib/access.ts";
import { tenure } from "../../../../lib/calendar.ts";
import { db } from "../../../../lib/db.ts";
import { directory, type Entry } from "../../../../lib/directory.ts";
import { format, formatDay, plural } from "../../../../lib/i18n/index.ts";
import { journeysAbout } from "../../../../lib/journeys.ts";
import { listArrivals, suggestions } from "../../../../lib/arrivals.ts";
import { awayOf, awayText } from "../../../../lib/away.ts";
import { LinkSuggestion } from "../../checklists/arrivals-view.tsx";
import { memberPattern } from "../../../../lib/model.ts";
import { today } from "../../../../lib/zone.ts";
import { viewer } from "../../../../lib/session.ts";

// A person's page: who they are, how to reach them, what to ask them,
// whom they report to and who reports to them. Their own "edit" for them;
// HR's for everyone.
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  if (!memberPattern.test(id)) notFound();
  const sql = db();
  const { entries } = await directory(sql, member);
  const person = entries.find(e => e.id === id);
  if (!person) notFound();
  const manager = person.managerId ? entries.find(e => e.id === person.managerId) : undefined;
  const reports = entries.filter(e => e.managerId === person.id);
  const mine = person.id === member.id;
  const hr = can(member, "profile.job");
  const now = today();
  const checklists = await journeysAbout(sql, member, person.id, now);
  // Away today (Leave tells People): never why.
  const gone = (await awayOf(sql, [person.id], now)).get(person.id);
  const away = gone ? awayText(gone, now, t.away, d => formatDay(d, locale, { weekday: "long", day: "numeric", month: "long" }), format) : null;
  // HR: is this newcomer someone Hiring told of? Offer to link them.
  const match = can(member, "checklists.manage") ? [...suggestions((await listArrivals(sql, member)).filter(a => a.status === "expected"), [person])][0] : undefined;
  const empty = !person.title && !person.phone && !person.bio && person.skills.length === 0 && !person.team;
  let since = "";
  if (person.startDate) {
    if (person.startDate > now) since = format(t.profile.arrives, { date: formatDay(person.startDate, locale) });
    else {
      const long = tenure(person.startDate, now);
      const span = long.years > 0 ? plural(t.profile.years, long.years, locale) : long.months > 0 ? plural(t.profile.months, long.months, locale) : plural(t.profile.days, long.days, locale);
      since = format(t.profile.since, { date: formatDay(person.startDate, locale) }) + " · " + span;
    }
  }
  const mini = (e: Entry) => (
    <Link className="mini" href={`/chest/people/${e.id}`}>
      <Portrait name={e.name} photo={e.photo} size={48} />
      <span><strong>{e.name}</strong>{e.title && <span className="muted">{e.title}</span>}</span>
    </Link>
  );
  return (
    <main className="page narrow">
      <Link className="back" href="/chest"><Back />{t.profile.back}</Link>
      {match && <LinkSuggestion arrivalId={match[0]} memberId={person.id} name={person.name} t={{ arrivals: t.arrivals, errors: t.errors }} />}
      <article className="profile">
        <header className="profile-head">
          <Portrait name={person.name} photo={person.photo} size={168} team={person.team} arch />
          <div className="profile-id">
            {mine && <span className="badge me">{t.profile.you}</span>}
            <h1>{person.name}</h1>
            {person.pronouns && <p className="pronouns"><span className="visually-hidden">{t.profile.pronouns}</span>{person.pronouns}</p>}
            {person.title && <p className="profile-title">{person.title}</p>}
            {away && <p className="away"><Moon />{away}</p>}
            {(person.team || person.office) && (
              <p className="person-where">
                {person.team && <span className="team"><span className="visually-hidden">{t.profile.team}</span>{person.team}</span>}
                {person.office && <span className="office"><Pin /><span className="visually-hidden">{t.profile.office}</span>{person.office}</span>}
              </p>
            )}
            <div className="row actions">
              {person.phone && <a className="button" href={`tel:${person.phone.replace(/[^\d+]/gu, "")}`} aria-label={format(t.profile.call, { name: person.name })}><Phone />{person.phone}</a>}
              {mine && <Link className="button quiet" href={`/chest/people/${person.id}/edit`}><Pencil />{t.profile.editMine}</Link>}
              {!mine && hr && <Link className="button quiet" href={`/chest/people/${person.id}/edit`}><Pencil />{t.profile.edit}</Link>}
            </div>
          </div>
        </header>

        {empty && <p className="quiet-note">{mine ? t.profile.emptyMine : format(t.profile.emptyOther, { name: person.firstName || person.name })}</p>}

        {(person.bio || person.skills.length > 0) && (
          <section className="profile-block">
            {person.skills.length > 0 && (
              <>
                <h2>{t.profile.askMe}</h2>
                <ul className="topics big">{person.skills.map(s => <li key={s} className="topic">{s}</li>)}</ul>
              </>
            )}
            {person.bio && (
              <>
                <h2>{t.profile.about}</h2>
                <p className="bio">{person.bio}</p>
              </>
            )}
          </section>
        )}

        {(since || person.birthday) && (
          <ul className="facts">
            {since && <li><Wave />{since}</li>}
            {person.birthday && <li><Cake />{format(t.profile.birthday, { date: formatDay(person.birthday, locale, { day: "numeric", month: "long" }) })}</li>}
          </ul>
        )}

        {(manager || reports.length > 0) && (
          <section className="profile-block lines">
            {manager && (
              <div>
                <h2>{t.profile.managedBy}</h2>
                {mini(manager)}
              </div>
            )}
            {reports.length > 0 && (
              <div>
                <h2>{t.profile.manages}</h2>
                <ul className="minis">{reports.map(r => <li key={r.id}>{mini(r)}</li>)}</ul>
              </div>
            )}
          </section>
        )}

        {checklists.length > 0 && (
          <section className="profile-block">
            <h2>{t.profile.checklists}</h2>
            <ul className="journey-list">
              {checklists.map(c => (
                <li key={c.id}>
                  <Link className="journey-row" href={`/chest/checklists/${c.id}`}>
                    <span className={`kind ${c.kind}`}>{t.checklists.kinds[c.kind]}</span>
                    <span className="journey-name">{c.name}</span>
                    <span className="meter" aria-hidden="true"><span style={{ width: `${c.total ? Math.round((c.done / c.total) * 100) : 0}%` }} /></span>
                    <span className="muted">{format(t.checklists.progress, { done: c.done, total: c.total })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hr && (
          <div className="row hr-actions">
            <Link className="button quiet small" href={`/chest/checklists/new?person=${person.id}&kind=onboarding`}><Wave />{t.profile.startOnboarding}</Link>
            <Link className="button quiet small" href={`/chest/checklists/new?person=${person.id}&kind=offboarding`}><Door />{t.profile.startOffboarding}</Link>
          </div>
        )}
      </article>
    </main>
  );
}
