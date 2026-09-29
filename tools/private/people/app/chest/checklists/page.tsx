import { Avatar, EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { listName } from "../../../lib/examples.ts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Clipboard, Plus } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDay, plural } from "../../../lib/i18n/index.ts";
import { listJourneys, listTemplates, type JourneySummary } from "../../../lib/journeys.ts";
import { people, subjectOf } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { today } from "../../../lib/zone.ts";
import { listArrivals, suggestions } from "../../../lib/arrivals.ts";
import { directory } from "../../../lib/directory.ts";
import { ArrivalList, type ArrivalView } from "./arrivals-view.tsx";
import { ArrivalForm } from "./arrival-form.tsx";
import { choices } from "../../../lib/profiles.ts";
import { ExamplesButton, NewTemplate } from "./template-buttons.tsx";
import { KindBadge } from "../../../components/kind.tsx";

// HR's page: the arrivals and departures in progress, with their progress,
// and the templates they start from. The one obvious action: start a
// checklist.
export default async function ChecklistsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "checklists.manage")) notFound();
  const sql = db();
  const [journeys, templates, archived, expected, { entries }] = await Promise.all([listJourneys(sql, member), listTemplates(sql, member), listTemplates(sql, member, { archived: true }), listArrivals(sql, member), directory(sql, member)]);
  const suggested = suggestions(expected, entries);
  const known = await choices(sql, member);
  const weekdays = Array.from({ length: 7 }, (_, i) => formatDay(`2024-01-${String(7 + i).padStart(2, "0")}`, locale, { weekday: "long" }));
  const peopleList = entries.map(e => ({ id: e.id, name: e.name }));
  const formProps = { people: peopleList, known, weekdays, today: today(), lang: locale, t: { arrivals: t.arrivals, errors: t.errors, date: t.date, peoplePicker: t.peoplePicker, leaveEmpty: t.people.leaveEmpty } };
  const arrivalViews: ArrivalView[] = expected.map(a => ({
    id: a.id,
    name: a.name,
    details: [a.job, a.team, a.place].filter(Boolean).join(" · "),
    when: a.startDate ? format(t.arrivals.joins, { date: formatDay(a.startDate, locale, { weekday: "long", day: "numeric", month: "long" }) }) : t.arrivals.noDate,
    cancelled: a.status === "cancelled",
    checklists: a.checklists,
    suggested: suggested.get(a.id)?.length === 1 ? suggested.get(a.id)![0]!.id : null,
    source: a.source,
    draft: a.source === "manual" ? { id: a.id, name: a.name, job: a.job, team: a.team, place: a.place, startDate: a.startDate, managerId: a.managerId, workEmail: a.workEmail } : null,
  }));
  const who = await people(journeys.flatMap(j => (j.personId ? [j.personId] : [])));
  const running = journeys.filter(j => !j.stopped && !j.completedAt);
  const completed = journeys.filter(j => !j.stopped && j.completedAt);
  const stopped = journeys.filter(j => j.stopped);
  const buttonWords = { newTemplate: t.checklists.newTemplate, examples: t.checklists.empty.examples, scratch: t.checklists.empty.scratch, template: t.template, kinds: t.checklists.kinds, errors: t.errors };
  const row = (j: JourneySummary) => {
    const person = subjectOf(j, who, locale);
    const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
    return (
      <li key={j.id}>
        <Link className="journey-card" href={`/chest/checklists/${j.id}`}>
          <Avatar name={person.name} photo={person.photo} size="l" />
          <span className="journey-main">
            <strong>{person.name}{j.arrivalId && <span className="source">{t.arrivals.group}</span>}</strong>
            <span className="muted">
              <KindBadge kind={j.kind} label={t.checklists.kinds[j.kind]} /> {listName(j, t)} · {format(j.kind === "onboarding" ? t.checklists.firstDay : t.checklists.lastDay, { date: formatDay(j.anchor, locale, { day: "numeric", month: "short" }) })}
            </span>
          </span>
          <span className="journey-progress">
            <span className="meter" aria-hidden="true"><span style={{ width: pct + "%" }} /></span>
            <span className="small">{format(t.checklists.progress, { done: j.done, total: j.total })}{j.late !== 0 && !j.completedAt && !j.stopped ? <span className="late-count"> · {plural(t.checklists.late, j.late, locale)}</span> : null}</span>
          </span>
        </Link>
      </li>
    );
  };
  const nothing = journeys.length === 0 && templates.length === 0 && archived.length === 0 && expected.length === 0;
  return (
    <div className="page narrow">
      <AutoRefresh seconds={60} />
      <PageHeader title={t.checklists.title} action={templates.length > 0 ? <Link className="button" href="/chest/checklists/new"><Plus />{t.checklists.start}</Link> : null} />
      {nothing ? (
        <EmptyState
          icon={<Clipboard />}
          title={t.checklists.empty.title}
          body={t.checklists.empty.body}
          action={(
            <>
              <ExamplesButton t={buttonWords} />
              <NewTemplate t={buttonWords} quiet label={t.checklists.empty.scratch} />
              <ArrivalForm {...formProps} />
            </>
          )}
        />
      ) : (
        <>
          <section id="arrivals" aria-labelledby="arrivals-title" className="section">
            <h2 id="arrivals-title" className="eyebrow">{t.arrivals.title}</h2>
            {arrivalViews.length > 0 && <ArrivalList arrivals={arrivalViews} locale={locale} {...formProps} />}
            <div className="section-actions"><ArrivalForm {...formProps} /></div>
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
              <NewTemplate t={buttonWords} quiet label={t.checklists.newTemplate} />
            </div>
            <ul className="template-list">
              {templates.map(x => (
                <li key={x.id}>
                  <Link href={`/chest/checklists/templates/${x.id}`} className="template-row">
                    <KindBadge kind={x.kind} label={t.checklists.kinds[x.kind]} />
                    <strong>{listName(x, t)}</strong>
                    <span className="muted small">{plural(t.checklists.steps, x.items.length, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {templates.length === 0 && <ExamplesButton t={buttonWords} />}
            {archived.length > 0 && (
              <details className="archived">
                <summary>{t.checklists.archived}</summary>
                <ul className="template-list">
                  {archived.map(x => (
                    <li key={x.id}>
                      <Link href={`/chest/checklists/templates/${x.id}`} className="template-row">
                        <KindBadge kind={x.kind} label={t.checklists.kinds[x.kind]} />
                        <strong>{listName(x, t)}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}
    </div>
  );
}
