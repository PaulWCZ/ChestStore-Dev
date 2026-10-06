import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { Avatar, EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Clipboard, Plus } from "../components/icons.tsx";
import { KindBadge } from "../components/kind.tsx";
import { format, formatDay, plural, weekdayNames } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { listArrivals, suggestions } from "../lib/arrivals.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { listName } from "../lib/examples.ts";
import { listJourneys, listTemplates, type JourneySummary } from "../lib/journeys.ts";
import { people, subjectOf } from "../lib/people.ts";
import { choices } from "../lib/profiles.ts";
import { today } from "../lib/zone.ts";
import type { ArrivalView } from "../islands/ArrivalList.tsx";
import { Meter } from "./parts.tsx";

// HR's page: the arrivals and departures in progress, with their progress,
// and the templates they start from. The one obvious action: start a
// checklist.
export async function checklistsPage({ member, locale, t }: PageContext): Promise<View> {
  if (!can(member, "checklists.manage")) return notFound();
  const sql = db();
  const [journeys, templates, archived, expected, { entries }] = await Promise.all([listJourneys(sql, member), listTemplates(sql, member), listTemplates(sql, member, { archived: true }), listArrivals(sql, member), directory(sql, member)]);
  const suggested = suggestions(expected, entries);
  const known = await choices(sql, member);
  const formProps = {
    people: entries.map(e => ({ id: e.id, name: e.name })),
    known,
    weekdays: weekdayNames(locale),
    today: today(),
    lang: locale,
    t: { arrivals: t.arrivals, date: t.date, peoplePicker: t.peoplePicker, leaveEmpty: t.people.leaveEmpty },
  };
  const arrivalViews: ArrivalView[] = expected.map(a => ({
    id: a.id,
    name: a.name,
    details: [a.job, a.team, a.place].filter(Boolean).join(" · "),
    when: a.startDate ? format(t.arrivals.joins, { date: formatDay(a.startDate, locale, { weekday: "long", day: "numeric", month: "long" }) }) : t.arrivals.noDate,
    cancelled: a.status === "cancelled",
    checklists: a.checklists,
    started: plural(t.arrivals.started, a.checklists, locale),
    suggested: suggested.get(a.id)?.length === 1 ? suggested.get(a.id)![0]!.id : null,
    source: a.source,
    draft: a.source === "manual" ? { id: a.id, name: a.name, job: a.job, team: a.team, place: a.place, startDate: a.startDate, managerId: a.managerId, workEmail: a.workEmail } : null,
  }));
  const who = await people(journeys.flatMap(j => (j.personId ? [j.personId] : [])));
  const running = journeys.filter(j => !j.stopped && !j.completedAt);
  const completed = journeys.filter(j => !j.stopped && j.completedAt);
  const stopped = journeys.filter(j => j.stopped);
  const buttonWords = { template: t.template, kinds: t.checklists.kinds };
  const row = (j: JourneySummary) => {
    const person = subjectOf(j, who, locale);
    return (
      <li key={j.id} id={`checklist-${j.id}`}>
        <a className="journey-card" href={`/chest/checklists/${j.id}`}>
          <Avatar name={person.name} photo={person.photo} size="l" />
          <span className="journey-main">
            <strong>{person.name}{j.arrivalId && <span className="source">{t.arrivals.group}</span>}</strong>
            <span className="muted">
              <KindBadge kind={j.kind} label={t.checklists.kinds[j.kind]} /> {listName(j, t)} · {format(j.kind === "onboarding" ? t.checklists.firstDay : t.checklists.lastDay, { date: formatDay(j.anchor, locale, { day: "numeric", month: "short" }) })}
            </span>
          </span>
          <span className="journey-progress">
            <Meter done={j.done} total={j.total} />
            <span className="small">{format(t.checklists.progress, { done: j.done, total: j.total })}{j.late !== 0 && !j.completedAt && !j.stopped ? <span className="late-count"> · {plural(t.checklists.late, j.late, locale)}</span> : null}</span>
          </span>
        </a>
      </li>
    );
  };
  const nothing = journeys.length === 0 && templates.length === 0 && archived.length === 0 && expected.length === 0;
  return {
    title: t.checklists.title,
    body: (
      <div className="page narrow">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <PageHeader title={t.checklists.title} action={templates.length > 0 ? <a className="button" href="/chest/checklists/new"><Plus />{t.checklists.start}</a> : null} />
        {nothing ? (
          <EmptyState
            icon={<Clipboard />}
            title={t.checklists.empty.title}
            body={t.checklists.empty.body}
            action={(
              <>
                <Island name="ExamplesButton" props={{ label: t.checklists.empty.examples }} />
                <Island name="NewTemplate" props={{ t: buttonWords, quiet: true, label: t.checklists.empty.scratch }} />
                <Island name="ArrivalForm" props={formProps} />
              </>
            )}
          />
        ) : (
          <>
            <section id="arrivals" aria-labelledby="arrivals-title" className="section">
              <h2 id="arrivals-title" className="eyebrow">{t.arrivals.title}</h2>
              {arrivalViews.length > 0 && <Island name="ArrivalList" props={{ arrivals: arrivalViews, ...formProps }} />}
              <div className="section-actions"><Island name="ArrivalForm" props={formProps} /></div>
            </section>
            <section aria-labelledby="running-title" className="section">
              <h2 id="running-title" className="eyebrow">{t.checklists.running}</h2>
              {running.length === 0 ? <p className="muted">{t.checklists.noneRunning}</p> : <ul className="journey-cards">{running.map(row)}</ul>}
            </section>
            {completed.length > 0 && (
              <section aria-labelledby="completed-title" className="section">
                <h2 id="completed-title" className="eyebrow">{t.checklists.completed}</h2>
                <ul className="journey-cards">{completed.map(row)}</ul>
              </section>
            )}
            {stopped.length > 0 && (
              <section aria-labelledby="stopped-title" className="section">
                <h2 id="stopped-title" className="eyebrow">{t.checklists.stopped}</h2>
                <ul className="journey-cards">{stopped.map(row)}</ul>
              </section>
            )}
            <section aria-labelledby="templates-title" className="section">
              <div className="section-title">
                <h2 id="templates-title" className="eyebrow">{t.checklists.templates}</h2>
                <Island name="NewTemplate" props={{ t: buttonWords, quiet: true, label: t.checklists.newTemplate }} />
              </div>
              <ul className="template-list">
                {templates.map(x => (
                  <li key={x.id} id={`template-${x.id}`}>
                    <a href={`/chest/checklists/templates/${x.id}`} className="template-row">
                      <KindBadge kind={x.kind} label={t.checklists.kinds[x.kind]} />
                      <strong>{listName(x, t)}</strong>
                      <span className="muted small">{plural(t.checklists.steps, x.items.length, locale)}</span>
                    </a>
                  </li>
                ))}
              </ul>
              {templates.length === 0 && <Island name="ExamplesButton" props={{ label: t.checklists.empty.examples }} />}
              {archived.length > 0 && (
                <details className="archived">
                  <summary>{t.checklists.archived}</summary>
                  <ul className="template-list">
                    {archived.map(x => (
                      <li key={x.id} id={`archived-${x.id}`}>
                        <a href={`/chest/checklists/templates/${x.id}`} className="template-row">
                          <KindBadge kind={x.kind} label={t.checklists.kinds[x.kind]} />
                          <strong>{listName(x, t)}</strong>
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </>
        )}
      </div>
    ),
  };
}
